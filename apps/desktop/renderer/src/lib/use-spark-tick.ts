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
import { appendResponseLog, bucketSessionDuration, type SparkContextSignature } from '@/lib/spark-response-log';

// Tightened from the initial 30s/60s — Spark felt absent. Now ~20s base
// with a 15s tighten after a fail, and a 35s slowdown only when truly in
// flow. Idle skip at 90s so a quick coffee break doesn't kill the loop.
const BASE_INTERVAL_MS    = 20_000;
const TIGHT_INTERVAL_MS   = 15_000;
const FLOW_INTERVAL_MS    = 35_000;
const IDLE_SKIP_THRESHOLD = 90_000;
const RATE_LIMIT_MS       = 10_000; // hard floor — never exceed 1 call / 10s
const POST_SPEAK_QUIET_MS = 20_000; // breathing room after Spark just spoke
// Hard timeout on a single observe request. If Anthropic hangs (rare but
// real on tool-use loops) we abort instead of blocking new triggers
// behind the inFlightRef guard for minutes.
const OBSERVE_TIMEOUT_MS  = 20_000;
// Stale-response discard. If a fetch eventually completes but the user
// has moved on, the response references context that no longer matches
// what's on screen. Show only fresh responses.
const STALENESS_THRESHOLD_MS = 25_000;

export interface SparkObservation {
  speak: boolean;
  message: string;
  /** Optional tool request from the agent. The renderer's tool dispatcher
   *  decides whether to run it immediately (annotative) or ask first
   *  (mutative). See lib/spark-tools.ts. */
  tool_request?: SparkToolRequest | null;
  /** Self-paced cadence — the agent suggests when it wants to be invoked
   *  again, in seconds. Backend clamps to 5–180. The frontend respects
   *  this in computeNextDelay() instead of using a fixed schedule. */
  next_check?: number;
}

export interface UseSparkTickOptions {
  /** Build the situational-awareness preamble for this tick. */
  getContextText: () => string;
  /** Optional: structured signature snapshot used by the local response log
   *  for offline pattern mining. When omitted, log entries get a degraded
   *  (events-only) signature. See lib/spark-response-log.ts. */
  getContextSignature?: () => {
    objectCount: number;
    objectTypes: string[];
  };
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
  // Self-paced cadence — when set, computeNextDelay returns this once
  // instead of the rule-based default. Cleared after one use.
  const agentSuggestedDelayRef = useRef<number | null>(null);

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
      // Agent self-paced cadence wins when it suggested a value last tick.
      // Clear after one use so the rule-based fallback kicks in if the
      // agent forgets to set next_check next time.
      if (agentSuggestedDelayRef.current !== null) {
        const ms = agentSuggestedDelayRef.current;
        agentSuggestedDelayRef.current = null;
        return ms;
      }

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
      const startTs = now;
      // Hard timeout via AbortController so a hung Anthropic call can't
      // block new triggers behind inFlightRef for minutes. If the abort
      // fires we'll catch it below and the observing pose still ends.
      const ac = new AbortController();
      const timeoutId = setTimeout(() => ac.abort(), OBSERVE_TIMEOUT_MS);

      // Tell the behavior coordinator we're literally analysing the canvas
      // — it shows a "looking at your work" pose for the duration of the
      // network call instead of cycling random ambient scenes.
      emitSparkEvent('spark.observe.start');
      try {
        const res = await fetch(`${CLOUD_API_URL}/api/tutor/observe`, {
          method: 'POST',
          headers: cloudHeaders(o.cloudAuthToken),
          signal: ac.signal,
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

        // Staleness check — even if the response eventually came back,
        // drop it when too long has passed. The context Spark saw is now
        // out of date and the response would feel disconnected.
        const elapsed = Date.now() - startTs;
        if (elapsed > STALENESS_THRESHOLD_MS) return;

        // Capture agent's suggested next-check cadence for the next
        // schedule() call. Even if the response is silent or stale we
        // honour the pacing hint — the agent might have decided
        // "nothing's happening, give it 90s" which is just as valid as
        // "speak now."
        if (typeof data?.next_check === 'number' && data.next_check >= 5) {
          agentSuggestedDelayRef.current = Math.min(180, data.next_check) * 1000;
        }

        // Local-only telemetry: log this observation outcome so we can
        // mine common (context, response) patterns later for a hard-coded
        // fast-path. See lib/spark-response-log.ts for the review snippet.
        try {
          const recent = sparkBehavior.getRecentEvents(5);
          const sceneSnap = o.getContextSignature?.() ?? { objectCount: 0, objectTypes: [] };
          const contextSig: SparkContextSignature = {
            mode: o.conceptId ? 'concept' : 'sandbox',
            conceptId: o.conceptId,
            ageGroup: o.ageGroup,
            layer: o.layer,
            objectCount: sceneSnap.objectCount,
            objectTypes: [...sceneSnap.objectTypes].sort(),
            recentEventKinds: recent.map((e) => e.kind),
            failStreak: sparkBehavior.getStreaks().failStreak,
            successStreak: sparkBehavior.getStreaks().successStreak,
            sessionDurationBucket: bucketSessionDuration(
              Math.round((Date.now() - sparkBehavior.getSessionStart()) / 1000),
            ),
          };
          appendResponseLog({
            studentName: o.studentName,
            context: contextSig,
            outcome: {
              speak: !!data?.speak,
              message: data?.message ?? '',
              tool: data?.tool_request
                ? { id: data.tool_request.id, reason: data.tool_request.reason }
                : null,
              nextCheckSec: typeof data?.next_check === 'number' ? data.next_check : null,
            },
          });
        } catch { /* logging is best-effort */ }

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
        // Abort errors land here too; that's the desired behaviour.
      } finally {
        clearTimeout(timeoutId);
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
    // fire an immediate observation tick instead of waiting for the next
    // scheduled poll. Two flavors:
    //
    //   IMMEDIATE_TRIGGER_KINDS — outcome events that should react fast:
    //     sim/evaluation outcomes, milestones, return-from-idle. These fire
    //     a tick within ~80ms.
    //
    //   BUILD_TRIGGER_KINDS — low-level user actions (place, delete, rotate)
    //     that fire constantly during active building. We DON'T want a tick
    //     per click — that would spam Anthropic. Instead a 5s debounce: the
    //     timer resets on every build event and only fires when the user
    //     pauses. Result: Spark reacts ~5-8s after you stop building,
    //     instead of waiting up to 20s for the next scheduled poll.
    //
    // Both flavors are still subject to the 10s rate limit + in-flight
    // guards inside tickOnce, so they can't spam.
    const IMMEDIATE_TRIGGER_KINDS = new Set<string>([
      'sim.complete', 'sim.fail',
      'tutor.evaluation.pass', 'tutor.evaluation.fail',
      'tutor.level-up', 'tutor.layer-up', 'tutor.concept-mastered',
      'session.return',
    ]);
    const BUILD_TRIGGER_KINDS = new Set<string>([
      'user.place', 'user.delete', 'user.rotate', 'user.code-run',
    ]);
    // Was 5s. Tightened to 3s — natural micro-pauses while building (think,
    // adjust, look at the canvas) are much shorter than 5s. With 5s the
    // user often kept building through the timer, so the eventual tick
    // saw context that included the last full minute of activity, not
    // "what just happened." 3s catches more pauses without being twitchy.
    const BUILD_SETTLE_MS = 3_000;
    let buildSettleTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubEvents = onSparkEvent((detail) => {
      if (cancelled) return;
      if (IMMEDIATE_TRIGGER_KINDS.has(detail.kind)) {
        // Defer one render frame so any state mutations from the event
        // (placed object lands in scene) settle before we snapshot context.
        setTimeout(() => { void tickOnce(); }, 80);
        return;
      }
      if (BUILD_TRIGGER_KINDS.has(detail.kind)) {
        // Debounce — every build event resets the timer. Fires only on
        // a 5s pause in build activity.
        if (buildSettleTimer) clearTimeout(buildSettleTimer);
        buildSettleTimer = setTimeout(() => {
          buildSettleTimer = null;
          void tickOnce();
        }, BUILD_SETTLE_MS);
        return;
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (buildSettleTimer) clearTimeout(buildSettleTimer);
      unsubEvents();
    };
    // We deliberately depend only on `enabled` + parent toggle — opts changes
    // are tracked via optsRef so we don't restart the loop on every parent
    // re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, parentEnabled]);
}
