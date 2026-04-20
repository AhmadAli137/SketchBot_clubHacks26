'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

import { applyThemeMode, THEME_STORAGE_KEY, type ThemeMode } from '@/lib/theme-preference';

type ThemeToggleProps = {
  /** Default: text pill used in toolbars. `icon` = compact Sun/Moon control (e.g. auth screen). */
  variant?: 'default' | 'icon';
};

function resolveAndSyncTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const bridge = window.sketchbotDesktop;
  const fromFile = bridge?.initialTheme;

  const storedRaw = window.localStorage.getItem(THEME_STORAGE_KEY);
  const fromStorage = storedRaw === 'light' || storedRaw === 'dark' ? storedRaw : null;

  if (fromFile === 'light' || fromFile === 'dark') {
    if (fromStorage !== fromFile) {
      window.localStorage.setItem(THEME_STORAGE_KEY, fromFile);
    }
    return fromFile;
  }

  if (fromStorage) {
    void bridge?.setTheme?.(fromStorage);
    return fromStorage;
  }

  return 'dark';
}

export function ThemeToggle({ variant = 'default' }: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeMode>('dark');

  useEffect(() => {
    const mode = resolveAndSyncTheme();
    setTheme(mode);
    applyThemeMode(mode);
  }, []);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    applyThemeMode(nextTheme);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      void window.sketchbotDesktop?.setTheme?.(nextTheme);
    }
  };

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className="auth-theme-fab"
        onClick={toggleTheme}
        aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        title={theme === 'light' ? 'Dark theme' : 'Light theme'}
      >
        {theme === 'light' ? <Moon size={16} strokeWidth={2.25} /> : <Sun size={16} strokeWidth={2.25} />}
      </button>
    );
  }

  return (
    <button className="tab" type="button" onClick={toggleTheme} aria-label="Toggle color theme">
      {theme === 'light' ? 'Dark mode' : 'Light mode'}
    </button>
  );
}
