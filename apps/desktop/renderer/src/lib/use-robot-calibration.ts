'use client';

/**
 * Read / write the firmware's per-device calibration via the local
 * runtime (Cal.2). Wraps the three /api/robot/calibration endpoints
 * that ultimately forward to the firmware's get_/set_/clear_calibration
 * WS commands.
 *
 * Usage:
 *   const { calibration, isLoading, error, refresh, save, clear }
 *     = useRobotCalibration({ apiBase, enabled: robotConnected });
 *
 * `calibration` is `null` while loading or when no bot is reachable;
 * the wizard treats null as "show 'connect a robot first' state".
 */

import { useCallback, useEffect, useState } from 'react';

export type RobotCalibration = {
  provisioned:       boolean;
  wheel_diameter_mm: number;
  wheel_base_mm:     number;
  lr_balance:        number;
  duty_min:          number;
};

/** Partial update — server merges with whatever's currently on the bot. */
export type RobotCalibrationPatch = Partial<Omit<RobotCalibration, 'provisioned'>>;

type Options = {
  apiBase: string;
  /** Don't hit the endpoint when no real bot is on the LAN — saves a
   *  guaranteed-503 from the runtime when only the simulator is up. */
  enabled?: boolean;
};

type State = {
  calibration: RobotCalibration | null;
  isLoading:   boolean;
  error:       string | null;
};

export function useRobotCalibration({ apiBase, enabled = true }: Options) {
  const [state, setState] = useState<State>({
    calibration: null,
    isLoading:   false,
    error:       null,
  });

  const refresh = useCallback(async () => {
    if (!enabled || !apiBase) {
      setState({ calibration: null, isLoading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, isLoading: true, error: null }));
    // A freshly-paired bot can return 502/503 on the very first GET
    // (firmware still loading NVS, or the bridge socket just opened
    // and command_result hasn't drained yet). Retry once after a
    // short pause so the wizard doesn't surface a scary error on
    // open. Real errors persist past the retry.
    const attempt = async (): Promise<Response> =>
      fetch(`${apiBase}/api/robot/calibration`, { cache: 'no-store' });
    try {
      let res = await attempt();
      if (!res.ok && (res.status === 502 || res.status === 503)) {
        await new Promise((r) => setTimeout(r, 600));
        res = await attempt();
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as RobotCalibration;
      setState({ calibration: data, isLoading: false, error: null });
    } catch (err) {
      setState({
        calibration: null,
        isLoading: false,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }, [apiBase, enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (patch: RobotCalibrationPatch) => {
    if (!apiBase) throw new Error('No runtime configured');
    const res = await fetch(`${apiBase}/api/robot/calibration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { detail?: string })?.detail ?? `HTTP ${res.status}`);
    }
    const updated = (await res.json()) as RobotCalibration;
    setState({ calibration: updated, isLoading: false, error: null });
    return updated;
  }, [apiBase]);

  const clear = useCallback(async () => {
    if (!apiBase) throw new Error('No runtime configured');
    const res = await fetch(`${apiBase}/api/robot/calibration`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { detail?: string })?.detail ?? `HTTP ${res.status}`);
    }
    const updated = (await res.json()) as RobotCalibration;
    setState({ calibration: updated, isLoading: false, error: null });
    return updated;
  }, [apiBase]);

  return {
    calibration: state.calibration,
    isLoading:   state.isLoading,
    error:       state.error,
    refresh,
    save,
    clear,
  };
}
