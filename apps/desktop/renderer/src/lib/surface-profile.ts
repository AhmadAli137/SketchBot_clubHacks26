'use client';

/**
 * Surface profiles — Cal.6.
 *
 * Each surface (paper / desk / carpet) stores its own calibration
 * constants. When the kid switches surfaces, the saved profile for the
 * new surface gets pushed to the bot via POST /api/robot/calibration
 * — same payload as the wizard, just sourced from localStorage rather
 * than from a fresh measurement.
 *
 * Why "named calibrations" instead of multipliers on top of a base:
 * the source of distance/angle error on a carpet (slip during turns,
 * lower effective wheel diameter) doesn't decompose cleanly into a
 * single scalar that applies to every command. A re-calibration on
 * that surface measures the actual numbers — and reuse-as-profile
 * just means saving the four learned values keyed by surface name.
 *
 * Storage:
 *   localStorage.sketchbot.surface-profiles.v1 = {
 *     active: 'paper' | 'desk' | 'carpet',
 *     profiles: { paper: Cal | null, desk: Cal | null, carpet: Cal | null }
 *   }
 *
 * Profiles default to null — that means "this surface hasn't been
 * calibrated yet; pushing it would just leave the bot at defaults".
 * The wizard writes to the active profile on save, so the first
 * calibration on each surface lights up its slot.
 */

import type { RobotCalibration } from './use-robot-calibration';

export type SurfaceId = 'paper' | 'desk' | 'carpet';

export const SURFACES: { id: SurfaceId; label: string; description: string }[] = [
  { id: 'paper',  label: 'Paper',   description: 'Drawing-pad / cardstock — least slip, default tuning.' },
  { id: 'desk',   label: 'Desk',    description: 'Smooth tabletop or laminate — slight extra slip.' },
  { id: 'carpet', label: 'Carpet',  description: 'Soft carpet or rug — significant friction and wheel deflection.' },
];

type StoredProfile = {
  /** When the kid last saved a calibration for this surface. Used by
   *  the UI to show "calibrated 3 days ago" / "not yet calibrated". */
  savedAt: number;
  /** Just the tunable fields from RobotCalibration — `provisioned` is
   *  always true for stored profiles by definition. */
  wheel_diameter_mm: number;
  wheel_base_mm:     number;
  lr_balance:        number;
  duty_min:          number;
};

type SurfaceState = {
  active: SurfaceId;
  profiles: Partial<Record<SurfaceId, StoredProfile>>;
};

const STORAGE_KEY = 'sketchbot.surface-profiles.v1';
const CHANGE_EVENT = 'sketchbot:surface-profile-changed';

const DEFAULT_STATE: SurfaceState = {
  active: 'paper',
  profiles: {},
};

function read(): SurfaceState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<SurfaceState>;
    return {
      active:   parsed.active && SURFACES.some((s) => s.id === parsed.active)
        ? parsed.active
        : 'paper',
      profiles: parsed.profiles ?? {},
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function write(next: SurfaceState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  } catch {
    // Quota / disabled — slider state resets on reload but the app
    // still works.
  }
}

export function getSurfaceState(): SurfaceState {
  return read();
}

export function setActiveSurface(id: SurfaceId): void {
  const cur = read();
  if (cur.active === id) return;
  write({ ...cur, active: id });
}

/** Persist a calibration as the named surface's profile. The wizard
 *  calls this with whatever it just saved to the bot's NVS. */
export function saveSurfaceProfile(id: SurfaceId, cal: RobotCalibration): void {
  const cur = read();
  const next: SurfaceState = {
    ...cur,
    profiles: {
      ...cur.profiles,
      [id]: {
        savedAt:           Date.now(),
        wheel_diameter_mm: cal.wheel_diameter_mm,
        wheel_base_mm:     cal.wheel_base_mm,
        lr_balance:        cal.lr_balance,
        duty_min:          cal.duty_min,
      },
    },
  };
  write(next);
}

export function getSurfaceProfile(id: SurfaceId): StoredProfile | null {
  return read().profiles[id] ?? null;
}

/** Subscribe to changes — used by UI bits that need to react to
 *  the active surface or to a save landing in a slot. */
export function onSurfaceChange(handler: (s: SurfaceState) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<SurfaceState>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
