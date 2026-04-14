'use client';

import { useEffect, useState } from 'react';

// The desktop renderer is local-first. Do not inherit stale hosted web env vars here.
const DEFAULT_API_BASE = process.env.NEXT_PUBLIC_LOCAL_RUNTIME_URL ?? 'http://127.0.0.1:8787';
const DEFAULT_WS_BASE = process.env.NEXT_PUBLIC_LOCAL_RUNTIME_WS ?? 'ws://127.0.0.1:8787/ws/state';

export function useRuntimeConfig() {
  const [runtimeConfig, setRuntimeConfig] = useState({
    apiBase: DEFAULT_API_BASE,
    wsBase: DEFAULT_WS_BASE,
  });

  useEffect(() => {
    const runtimePort = window.sketchbotDesktop?.runtimePort;
    if (!runtimePort) {
      return;
    }

    setRuntimeConfig({
      apiBase: `http://127.0.0.1:${runtimePort}`,
      wsBase: `ws://127.0.0.1:${runtimePort}/ws/state`,
    });
  }, []);

  return runtimeConfig;
}
