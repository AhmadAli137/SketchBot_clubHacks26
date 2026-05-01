'use client';

/**
 * useCloudKeepalive — defeats Render free-tier cold starts.
 *
 * Render's free plan suspends a service after ~15 min of no traffic. The
 * next request takes 30-60s to wake the dyno, which surfaces as Spark
 * appearing to ignore actions for almost a minute. This hook pings a
 * cheap public endpoint (the cloud backend's root) every 10 min while
 * the user is in a session, so the dyno stays warm.
 *
 * Cost: one HEAD/GET per 10 min. Negligible bandwidth, no auth required,
 * no API credit consumption. Stops cleanly when the session ends.
 *
 * Real fix is a paid Render plan ($7/mo Starter) — this is the free
 * version that gets us most of the way there.
 */

import { useEffect } from 'react';
import { CLOUD_API_URL } from '@/lib/cloud-api';

const KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000;

export function useCloudKeepalive(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (!CLOUD_API_URL) return;

    let cancelled = false;

    const ping = () => {
      if (cancelled) return;
      // Use a no-cors GET so it succeeds regardless of CORS configuration —
      // we don't care about the response body, only that the request woke
      // the dyno.
      void fetch(`${CLOUD_API_URL}/`, { method: 'GET', mode: 'no-cors', cache: 'no-store' })
        .catch(() => { /* network blip is fine, next interval will retry */ });
    };

    // Fire one immediately on mount so a cold dyno warms while the user
    // is starting their session, not 10 min into it.
    ping();
    const id = window.setInterval(ping, KEEPALIVE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled]);
}
