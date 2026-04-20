'use client';

import { useEffect, useState } from 'react';

export type DesktopLaunchPhase = 'starting' | 'ready' | 'error';

export type DesktopLaunchState = {
  phase: DesktopLaunchPhase;
  message: string;
  detail?: string;
};

export type DesktopShellBridge = {
  isDesktopShell: boolean;
  runtimePort: string;
  rendererMode: string;
  /** Last saved theme from disk (`userData/sketchbot-theme-pref.json`). `null` if never saved. */
  initialTheme?: 'light' | 'dark' | null;
  setTheme?: (theme: 'light' | 'dark') => Promise<void>;
  getLaunchState: () => Promise<DesktopLaunchState>;
  retryLaunch: () => Promise<DesktopLaunchState>;
  getPairingTargets: () => Promise<string[]>;
  onLaunchState: (callback: (state: DesktopLaunchState) => void) => () => void;
};

declare global {
  interface Window {
    sketchbotDesktop?: DesktopShellBridge;
  }
}

const defaultLaunchState: DesktopLaunchState = {
  phase: 'ready',
  message: 'SketchBot Desktop is ready.',
};

export function useDesktopShell() {
  const [available, setAvailable] = useState(false);
  const [launchState, setLaunchState] = useState<DesktopLaunchState>(defaultLaunchState);
  const [pairingTargets, setPairingTargets] = useState<string[]>([]);

  useEffect(() => {
    const bridge = window.sketchbotDesktop;
    if (!bridge) {
      return;
    }

    setAvailable(true);
    void bridge.getLaunchState().then(setLaunchState).catch(() => {});
    void bridge.getPairingTargets().then(setPairingTargets).catch(() => {});

    const unsubscribe = bridge.onLaunchState((nextState) => {
      setLaunchState(nextState);
      void bridge.getPairingTargets().then(setPairingTargets).catch(() => {});
    });

    return unsubscribe;
  }, []);

  const retryLaunch = async () => {
    const bridge = window.sketchbotDesktop;
    if (!bridge) {
      return;
    }
    const nextState = await bridge.retryLaunch();
    setLaunchState(nextState);
  };

  return {
    available,
    launchState,
    pairingTargets,
    retryLaunch,
  };
}
