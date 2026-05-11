'use client';

/**
 * Hook over GET /api/devices. Lets the renderer answer "is this serial
 * already paired to my account?" so the home-screen pairing card only
 * appears for genuinely-new robots.
 *
 * Refreshes on auth-token change (sign-in/out, refresh) and exposes a
 * manual `refresh()` so the pairing card can re-fetch after a successful
 * claim — the new bot should immediately disappear from the unclaimed
 * list, even before the next /ws/state tick.
 */

import { useCallback, useEffect, useState } from 'react';

import { CLOUD_API_URL, cloudHeaders } from './cloud-api';

export type PairedDevice = {
  id: string;
  serial: string;
  name: string | null;
  registered_at: string;
  last_seen_at: string | null;
  has_token: boolean;
  token_issued_at: string | null;
};

type Options = {
  authToken: string | null | undefined;
  /** When false the hook stays idle — useful for guest sessions. */
  enabled?: boolean;
};

type State = {
  devices: PairedDevice[] | null;
  isLoading: boolean;
  error: string | null;
};

export function usePairedDevices({ authToken, enabled = true }: Options) {
  const [state, setState] = useState<State>({
    devices: null,
    isLoading: false,
    error: null,
  });

  const fetchDevices = useCallback(async () => {
    if (!enabled || !authToken) {
      setState({ devices: null, isLoading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const res = await fetch(`${CLOUD_API_URL}/api/devices`, {
        headers: cloudHeaders(authToken),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { devices: PairedDevice[] };
      setState({ devices: body.devices, isLoading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      setState({ devices: null, isLoading: false, error: message });
    }
  }, [authToken, enabled]);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  const isClaimedByMe = useCallback(
    (serial: string | null | undefined) => {
      if (!serial || !state.devices) return false;
      const norm = serial.trim().toUpperCase();
      return state.devices.some((d) => d.serial.toUpperCase() === norm);
    },
    [state.devices],
  );

  return {
    devices: state.devices,
    isLoading: state.isLoading,
    error: state.error,
    isClaimedByMe,
    refresh: fetchDevices,
  };
}
