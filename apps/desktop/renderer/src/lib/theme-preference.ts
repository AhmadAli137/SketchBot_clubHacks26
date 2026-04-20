/** Sync with `layout.tsx` inline script and Electron `sketchbot-theme-pref.json`. */
export const THEME_STORAGE_KEY = 'sketchbot-theme-mode';

export type ThemeMode = 'light' | 'dark';

export function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.dataset.theme = mode;
}
