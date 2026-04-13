'use client';

import { useEffect, useState } from 'react';

type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'sketchbot-theme-mode';

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.dataset.theme = mode;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>('light');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    const nextTheme: ThemeMode =
      stored === 'dark' || stored === 'light'
        ? stored
        : window.matchMedia?.('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';

    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    applyTheme(nextTheme);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    }
  };

  return (
    <button className="tab" type="button" onClick={toggleTheme} aria-label="Toggle color theme">
      {theme === 'light' ? 'Dark mode' : 'Light mode'}
    </button>
  );
}
