'use client';

/**
 * Per-installation settings for the agentic tutor loop. Stored in
 * localStorage so a parent can flip the toggle once and have it stick
 * across sessions.
 *
 * The single setting today is `agenticTutorEnabled` — controls whether
 * the renderer fires `/api/tutor/observe` ticks at all. Set to false to
 * fall back to a pure trigger-driven tutor (no proactive interjections).
 *
 * See docs/privacy-tutor-observe.md for the rationale.
 */

const STORAGE_KEY = 'sketchbot.agentic-tutor.v1';
const SETTING_CHANGE_EVENT = 'sketchbot:agentic-setting-changed';

export interface AgenticSettings {
  /** Master switch for proactive tick observations. Default ON. */
  agenticTutorEnabled: boolean;
}

const DEFAULTS: AgenticSettings = {
  agenticTutorEnabled: true,
};

function readSettings(): AgenticSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AgenticSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function writeSettings(next: AgenticSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(SETTING_CHANGE_EVENT, { detail: next }));
  } catch {
    // Quota exceeded or storage disabled — silently swallow. The toggle
    // will reset on next launch but the app still works.
  }
}

export function getAgenticSettings(): AgenticSettings {
  return readSettings();
}

export function setAgenticTutorEnabled(enabled: boolean): void {
  const current = readSettings();
  writeSettings({ ...current, agenticTutorEnabled: enabled });
}

/**
 * Subscribe to setting changes. Returns an unsubscribe function. Call from
 * a useEffect so live toggles are picked up without a page reload.
 */
export function onAgenticSettingsChange(handler: (s: AgenticSettings) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<AgenticSettings>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(SETTING_CHANGE_EVENT, listener);
  return () => window.removeEventListener(SETTING_CHANGE_EVENT, listener);
}
