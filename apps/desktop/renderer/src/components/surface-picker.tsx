'use client';

/**
 * Surface picker — Cal.6.
 *
 * Three pills (paper / desk / carpet). Tapping one:
 *   1. Marks that surface active in localStorage (lib/surface-profile.ts)
 *   2. If a stored profile exists for that surface, POSTs it to the
 *      bot via useRobotCalibration.save() so the new commands use the
 *      right tuning right away.
 *   3. If no stored profile exists for that surface, just flips the
 *      active flag — the kid is expected to run the wizard next; the
 *      wizard's save will land in this surface's slot.
 *
 * Self-contained: doesn't need any state from outside. Reads its own
 * surface state via the lib hooks, fetches the runtime API base from
 * a prop.
 */

import { useEffect, useState } from 'react';
import { Check, Loader2, AlertTriangle } from 'lucide-react';

import {
  SURFACES,
  type SurfaceId,
  getSurfaceState,
  setActiveSurface,
  getSurfaceProfile,
  onSurfaceChange,
} from '@/lib/surface-profile';
import { useRobotCalibration } from '@/lib/use-robot-calibration';

type Props = {
  apiBase: string;
  /** Only show the picker when a real bot is on the LAN — surface
   *  profiles don't matter in simulator mode. */
  robotConnected: boolean;
};

export function SurfacePicker({ apiBase, robotConnected }: Props) {
  const [state, setState] = useState(() => getSurfaceState());
  useEffect(() => onSurfaceChange(setState), []);

  const { save, error: saveError } = useRobotCalibration({
    apiBase,
    enabled: robotConnected,
  });
  const [pushing, setPushing] = useState<SurfaceId | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  if (!robotConnected) return null;

  const onPick = async (id: SurfaceId) => {
    if (id === state.active) return;
    setActiveSurface(id);
    setPushError(null);
    const profile = getSurfaceProfile(id);
    if (!profile) {
      // No stored cal yet — just flip active. The kid runs the wizard
      // to populate this slot.
      return;
    }
    setPushing(id);
    try {
      await save({
        wheel_diameter_mm: profile.wheel_diameter_mm,
        wheel_base_mm:     profile.wheel_base_mm,
        lr_balance:        profile.lr_balance,
        duty_min:          profile.duty_min,
      });
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'push failed');
    } finally {
      setPushing(null);
    }
  };

  return (
    <div className="surface-picker">
      <span className="surface-picker-label">Surface</span>
      <div className="surface-picker-pills">
        {SURFACES.map((s) => {
          const isActive = state.active === s.id;
          const hasProfile = state.profiles[s.id] !== undefined;
          const isPushing = pushing === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={`surface-pill${isActive ? ' is-active' : ''}${hasProfile ? '' : ' is-empty'}`}
              onClick={() => void onPick(s.id)}
              disabled={isPushing}
              title={hasProfile
                ? `${s.description}  ·  calibrated`
                : `${s.description}  ·  not yet calibrated (run the wizard while on this surface)`}
            >
              {isPushing
                ? <Loader2 size={11} style={{ animation: 'spin 0.9s linear infinite' }} />
                : hasProfile && isActive
                  ? <Check size={11} strokeWidth={3} />
                  : null}
              {s.label}
              {!hasProfile && <span className="surface-pill-empty-dot" aria-hidden>·</span>}
            </button>
          );
        })}
      </div>
      {(pushError || saveError) && (
        <span className="surface-picker-warn">
          <AlertTriangle size={11} /> {pushError ?? saveError}
        </span>
      )}
    </div>
  );
}
