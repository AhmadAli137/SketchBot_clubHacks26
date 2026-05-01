'use client';

import { useEffect } from 'react';
import { emitSparkEvent } from './spark-events';

const IDLE_THRESHOLD_MS = 20_000; // 20s of no input → emit user.idle

/**
 * Tracks user idle state app-wide. Mount once near the root.
 *
 * Emits `user.idle` after IDLE_THRESHOLD_MS of no mouse/keyboard activity,
 * and `user.active` once when the user comes back. The behavior coordinator
 * uses these to drift into a calmer mood and to count toward the proactive
 * idle nudge.
 */
export function useSparkIdle() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let isIdle = false;

    const markActive = () => {
      if (isIdle) {
        isIdle = false;
        emitSparkEvent('user.active');
      }
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        isIdle = true;
        emitSparkEvent('user.idle');
      }, IDLE_THRESHOLD_MS);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
    for (const e of events) window.addEventListener(e, markActive, { passive: true });
    markActive(); // start the timer

    return () => {
      for (const e of events) window.removeEventListener(e, markActive);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, []);
}
