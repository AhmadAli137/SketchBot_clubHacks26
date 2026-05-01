'use client';

/**
 * useSparkTick — adaptive observation loop for the agentic tutor.
 *
 * On a roughly 30-second cadence (tighter after a fail, looser when in flow,
 * skipped entirely when idle) the renderer assembles a SparkContext, posts
 * it to /api/tutor/observe, and either drops Spark a one-line interjection
 * or stays silent. Designed so MOST ticks are silent — Spark only speaks
 * when he genuinely has something useful to say.
 *
 * Cost notes:
 *   • Each tick is one Anthropic call. With Sonnet 4.6 + caching + structured
 *     output, silent ticks cost ~$0.002 and spoken ticks ~$0.005. A 30-min
 *     active session with a 1-in-5 speak ratio totals ~$0.10–0.15. The hard
 *     ceiling is enforced by the 10-second rate limit at the bottom.
 *   • Cadence adapts based on the spark-behavior coordinator's recent fail
 *     streak. Idle (>2 min no events) skips the tick entirely.
 *
 * Privacy notes: the context payload contains the child's first name + age
 * range only, plus raw scene positions and recent in-app actions. No images,
 * no audio, no chat history beyond what the cached message thread already
 * holds. Server-side this hits /api/tutor/observe which does NOT persist
 * payloads beyond the single turn. See docs/privacy-tutor-observe.md.
 */

import { useEffect, useRef, useState } from 'react';
import { CLOUD_API_URL, cloudHeaders } from '@/lib/cloud-api';
import { sparkBehavior } from '@/lib/spark-behavior';
import { getAgenticSettings, onAgenticSettingsChange } from '@/lib/agentic-settings';
import { emitToolRequest, type SparkToolRequest } from '@/lib/spark-tools';
import { emitSparkEvent, onSparkEvent } from '@/lib/spark-events';

// Tightened from the initial 30s/60s — Spark felt absent. Now ~20s base
// with a 15s tighten after a fail, and a 35s slowdown only when truly in
// flow. Idle skip at 90s so a quick coffee break doesn't kill the loop.
const BASE_INTERVAL_MS    = 20_000;
const TIGHT_INTERVAL_MS   = 15_000;
const FLOW_INTERVAL_MS    = 35_000;
const IDLE_SKIP_THRESHOLD = 90_000;
const RATE_LIMIT_MS       = 10_000; // hard floor — never exceed 1 call / 10s
const POST_SPEAK_QUIET_MS = 30_000; // breathing room after Spark just spoke

export interface SparkObservation {
  speak: boolean;
  message: string;
  /** Optional tool request from the agent. The renderer's tool dispatcher
   *  decides whether to run it immediately (annotative) or ask first
   *  (mutative). See lib/spark-tools.ts. */
  tool_request?: SparkToolRequest | null;
}

export interface UseSparkTickOptions {
  /** Build the situational-awareness preamble for this tick. */
  getContextText: () => string;
  /** Called when the tutor decides to interject. The host shows the message. */
  onObservation: (obs: SparkObservation) => void;
  /** Identity payload passed to /api/tutor/observe. */
  studentName: string;
  ageGroup: string;
  actorRole: 'student' | 'teacher';
  conceptId: string | null;
  layer: string | null;
  /** Auth header builder (Supabase access token, etc.). */
  cloudAuthToken: string | null | undefined;
  /** Disable the loop (e.g., when the user is on a non-session screen). */
  enabled: boolean;
}

export function useSparkTick(opts: UseSparkTickOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const lastCallTsRef = useRef(0);
  const lastSpeakTsRef = useRef(0);
  const inFlightRef = useRef(false);

  // Parent toggle — when off, no observation calls happen, period.
  const [parentEnabled, setParentEnabled] = useState<boolean>(() =>
    getAgenticSettings().agenticTutorEnabled,
  );
  useEffect(() => onAgenticSettingsChange((s) => setParentEnabled(s.agenticTutorEnabled)), []);

  useEffect(() => {
    if (!opts.enabled || !parentEnabled) return;
    if (typeof window === 'undefined') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const computeNextDelay = (): number | null => {
      const now = Date.now();
      const lastEvent = sparkBehavior.getRecentEvents(1).at(-1);
      const idleMs = lastEvent ? now - lastEvent.ts : now - sparkBehavior.getSessionStart();

      // No events for a long while → skip ticks until the user does something.
      // The behavior coordinator will fire events again as soon as they return.
      if (idleMs > IDLE_SKIP_THRESHOLD) {
        return BASE_INTERVAL_MS; // re-check eligibility on the same cadence
      }

      const { failStreak } = sparkBehavior.getStreaks();
      let interval = BASE_INTERVAL_MS;
      if (failStreak >= 1) {
        interval = TIGHT_INTERVAL_MS;
      } else {
        // "In flow" = recent build activity, no fails. Use behavior mood as a
        // cheap proxy without re-deriving here.
        const mood = sparkBehavior.getState().mood;
        if (mood === 'engaged' || mood === 'happy') {
          interval = FLOW_INTERVAL_MS;
        }
      }

      // Quiet window right after Spark spoke.
      const sinceSpeak = now - lastSpeakTsRef.current;
      if (sinceSpeak < POST_SPEAK_QUIET_MS) {
        interval = Math.max(interval, POST_SPEAK_QUIET_MS - sinceSpeak);
      }

      return interval;
    };

    const tickOnce = async () => {
      if (cancelled) return;
      if (inFlightRef.current) return; // overlap guard

      const now = Date.now();
      // Hard rate limit — never exceed 1 call / RATE_LIMIT_MS regardless of
      // logic above. Belt-and-suspenders against runaway timers.
      if (now - lastCallTsRef.current < RATE_LIMIT_MS) return;

      // Skip tick when there's been zero activity for a long time. Fast path,
      // no API call, no cost.
      const lastEvent = sparkBehavior.getRecentEvents(1).at(-1);
      const idleMs = lastEvent ? now - lastEvent.ts : now - sparkBehavior.getSessionStart();
      if (idleMs > IDLE_SKIP_THRESHOLD) return;

      const o = optsRef.current;
      const contextText = o.getContextText();
      if (!contextText.trim()) return;

      lastCallTsRef.current = now;
      inFlightRef.current = true;
      // Tell the behavior coordinator we're literally analysing the canvas
      // — it shows a "looking at your work" pose for the duration of the
      // network call instead of cycling random ambient scenes.
      emitSparkEvent('spark.observe.start');
      try {
        const res = await fetch(`${CLOUD_API_URL}/api/tutor/observe`, {
          method: 'POST',
          headers: cloudHeaders(o.cloudAuthToken),
          body: JSON.stringify({
            student_name: o.studentName,
            age_group: o.ageGroup,
            actor_role: o.actorRole,
            concept_id: o.conceptId ?? 'free-draw',
            layer: o.layer ?? 'intuitive',
            context_text: contextText,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as SparkObservation;
        if (cancelled) return;
        // Emit any tool request first — the dispatcher will either run it
        // immediately (annotative) or queue a confirmation (mutative).
        if (data && data.tool_request && data.tool_request.id) {
          emitToolRequest(data.tool_request);
        }
        if (data && typeof data.speak === 'boolean' && data.speak && data.message) {
          lastSpeakTsRef.current = Date.now();
          o.onObservation(data);
        }
      } catch {
        // Swallow — observation is best-effort. The coordinator's silent
        // ambient layer keeps Spark feeling alive even without network.
      } finally {
        inFlightRef.current = false;
        // Always end the observing pose, whether we got a response, an
        // error, or a silent JSON. Reactive scenes (celebrate / aha) take
        // precedence anyway because they fire from emit calls below.
        emitSparkEvent('spark.observe.end');
      }
    };

    const schedule = () => {
      if (cancelled) return;
      const delay = computeNextDelay();
      if (delay === null) return;
      timer = setTimeout(async () => {
        await tickOnce();
        schedule();
      }, delay);
    };

    schedule();

    // Event-driven trigger: when something meaningful happens on the canvas
    // (sim outcome, evaluation, milestone), fire an immediate observation
    // tick instead of waiting for the next scheduled poll. The 10s rate
    // limit + in-flight guards still apply, so this can't spam Anthropic.
    // Result: Spark reacts within ~1-3s of the event instead of up to 20s.
    const IMMEDIATE_TRIGGER_KINDS = new Set([
      'sim.complete', 'sim.fail',
      'tutor.evaluation.pass', 'tutor.evaluation.fail',
      'tutor.level-up', 'tutor.layer-up', 'tutor.concept-mastered',
      'session.return',
    ]);
    const unsubEvents = onSparkEvent((detail) => {
      if (cancelled) return;
      if (!IMMEDIATE_TRIGGER_KINDS.has(detail.kind)) return;
      // Defer one render frame so any state mutations from the event
      // (placed object lands in scene) settle before we snapshot context.
      setTimeout(() => { void tickOnce(); }, 80);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubEvents();
    };
    // We deliberately depend only on `enabled` + parent toggle — opts changes
    // are tracked via optsRef so we don't restart the loop on every parent
    // re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, parentEnabled]);
}
