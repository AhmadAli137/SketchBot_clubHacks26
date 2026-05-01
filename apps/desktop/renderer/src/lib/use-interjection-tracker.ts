'use client';

/**
 * useInterjectionTracker — Level 2 learning hook.
 *
 * Whenever Spark interjects (speaks, highlights, awards XP, asks to drop a
 * demo), we record the interjection and watch user activity for the next
 * 60 seconds. If the kid did anything in that window — placed something,
 * ran a sim, replied to chat — the outcome is "engaged". If the kid
 * stayed silent through the whole window, "ignored". Tool confirmations
 * resolve immediately to "engaged" or "declined".
 *
 * Outcomes accumulate in spark-memory and surface as a one-line synopsis
 * in the next observation tick's prompt — see lib/spark-memory.ts and
 * lib/spark-context.ts for the read side.
 */

import { useEffect, useRef } from 'react';
import { onSparkEvent, type SparkEventDetail } from '@/lib/spark-events';
import {
  recordInterjection,
  markInterjectionOutcome,
  type InterjectionType,
} from '@/lib/spark-memory';

const ENGAGEMENT_WINDOW_MS = 60_000;

interface PendingInterjection {
  id: string;
  /** Wallclock when the interjection happened. */
  startedAt: number;
  /** Timer that resolves to "ignored" if no engagement event lands. */
  timer: ReturnType<typeof setTimeout>;
}

interface Options {
  /** Full studentName as used elsewhere — keys the spark-memory store. */
  studentName: string;
  /** Disable when the agentic tutor is off. */
  enabled: boolean;
}

/**
 * The user-action events that count as "engagement after Spark spoke".
 * Subset of the spark-events kinds; chosen so that incidental signals
 * (idle/active flips, observation lifecycle) don't accidentally resolve
 * an interjection as engaged.
 */
const ENGAGEMENT_KINDS = new Set([
  'user.place', 'user.delete', 'user.rotate', 'user.code-run',
  'sim.start', 'sim.complete', 'sim.fail',
  'tutor.evaluation.pass', 'tutor.evaluation.fail',
]);

export function useInterjectionTracker(opts: Options) {
  const studentRef = useRef(opts.studentName);
  studentRef.current = opts.studentName;
  const enabledRef = useRef(opts.enabled);
  enabledRef.current = opts.enabled;

  const pendingRef = useRef<PendingInterjection[]>([]);

  useEffect(() => {
    if (!opts.enabled) return;

    const startTracking = (type: InterjectionType, preview: string) => {
      const studentName = studentRef.current;
      if (!studentName) return;
      const id = recordInterjection(studentName, type, preview);
      if (!id) return;
      const timer = setTimeout(() => {
        // Window closed with no engagement — record as ignored.
        markInterjectionOutcome(studentName, id, 'ignored');
        pendingRef.current = pendingRef.current.filter((p) => p.id !== id);
      }, ENGAGEMENT_WINDOW_MS);
      pendingRef.current.push({ id, startedAt: Date.now(), timer });
    };

    const resolveAll = (outcome: 'engaged' | 'declined') => {
      const studentName = studentRef.current;
      if (!studentName) return;
      const pending = pendingRef.current;
      pendingRef.current = [];
      for (const p of pending) {
        clearTimeout(p.timer);
        markInterjectionOutcome(studentName, p.id, outcome);
      }
    };

    const unsub = onSparkEvent((detail: SparkEventDetail) => {
      const k = detail.kind;

      // Spark interjected → start a new tracker. Three signals trigger this:
      //   • the observation tick produced a tool request (annotative tools
      //     are the loudest "Spark just acted" signal we have on the bus —
      //     they're emitted via `emitToolRequest` and we don't see them
      //     directly here, so we rely on the dispatcher to also fire a
      //     SparkEvent via tutor.xp on award_xp; for highlight we instead
      //     watch for the user.place/etc that comes after — handled below)
      //   • tool execution events that the dispatcher fires
      //
      // The simplest accurate signal we DO see: when Spark speaks, the
      // tutor-panel appends a tutor message and the existing TTS path
      // emits no spark event. We rely on the message-mount path to call
      // recordInterjection directly (see tutor-panel.tsx). Here we only
      // resolve outcomes, not start new ones — except for tool.xp which
      // is itself a Spark action.
      if (k === 'tutor.xp') {
        const reason = (detail.payload?.reason as string | undefined) ?? '';
        startTracking('xp', reason);
        return;
      }

      // Engagement signal — any meaningful user action resolves all
      // pending interjections to engaged.
      if (ENGAGEMENT_KINDS.has(k)) {
        resolveAll('engaged');
        return;
      }
    });

    return () => {
      unsub();
      // Clear timers but leave outcomes as-is on cleanup.
      for (const p of pendingRef.current) clearTimeout(p.timer);
      pendingRef.current = [];
    };
  }, [opts.enabled]);
}

/**
 * Imperative entry point for code paths that don't sit on the event bus —
 * tutor-panel calls this when it appends a tutor message to chat (whether
 * from a streamed reply or a tick observation), and the tool dispatcher
 * calls it on mutative confirmations.
 *
 * Returns the interjection id so callers can resolve a specific outcome
 * (e.g., the dispatcher uses this to mark a confirmation declined).
 */
export function trackInterjectionStart(
  studentName: string,
  type: InterjectionType,
  preview: string,
): string {
  return recordInterjection(studentName, type, preview);
}

export function trackInterjectionResolved(
  studentName: string,
  id: string,
  outcome: 'engaged' | 'ignored' | 'declined',
): void {
  markInterjectionOutcome(studentName, id, outcome);
}
