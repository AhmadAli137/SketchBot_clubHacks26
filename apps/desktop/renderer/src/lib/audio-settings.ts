'use client';

/**
 * Per-installation audio mix. Two independent volumes (0..1) that the
 * user controls from the account panel:
 *
 *   - musicVolume: master gain for the menu/background music loop
 *     (lib/menu-music.ts). Multiplies the existing artistic envelope
 *     so 1.0 = "as loud as the composer intended", 0.0 = silent.
 *   - tutorVolume: gain on Spark's voice — TTS audio in the tutor
 *     panel (components/tutor-panel.tsx) and lesson audio
 *     (lib/use-lesson-audio.ts).
 *
 * Persisted in localStorage. Both audio paths subscribe to change
 * events so the slider drag is audible immediately without a reload.
 *
 * Mirrors the `agentic-settings.ts` pattern.
 */

const STORAGE_KEY = 'sketchbot.audio-settings.v1';
const SETTING_CHANGE_EVENT = 'sketchbot:audio-setting-changed';

export interface AudioSettings {
  musicVolume: number;  // 0..1
  tutorVolume: number;  // 0..1
}

const DEFAULTS: AudioSettings = {
  musicVolume: 1,
  tutorVolume: 1,
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function readSettings(): AudioSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      musicVolume: clamp01(parsed.musicVolume ?? DEFAULTS.musicVolume),
      tutorVolume: clamp01(parsed.tutorVolume ?? DEFAULTS.tutorVolume),
    };
  } catch {
    return DEFAULTS;
  }
}

function writeSettings(next: AudioSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(SETTING_CHANGE_EVENT, { detail: next }));
  } catch {
    // Storage disabled / quota — slider state resets on reload but app works.
  }
}

export function getAudioSettings(): AudioSettings {
  return readSettings();
}

export function setMusicVolume(v: number): void {
  const current = readSettings();
  writeSettings({ ...current, musicVolume: clamp01(v) });
}

export function setTutorVolume(v: number): void {
  const current = readSettings();
  writeSettings({ ...current, tutorVolume: clamp01(v) });
}

/**
 * Subscribe to setting changes. Returns an unsubscribe. Call from a
 * useEffect so live drags are heard without a reload.
 */
export function onAudioSettingsChange(handler: (s: AudioSettings) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<AudioSettings>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(SETTING_CHANGE_EVENT, listener);
  return () => window.removeEventListener(SETTING_CHANGE_EVENT, listener);
}
