const browserHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const browserProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const desktopRuntimePort =
  typeof window !== 'undefined' ? window.sketchbotDesktop?.runtimePort : undefined;
const wsProtocol = browserProtocol === 'https:' ? 'wss:' : 'ws:';
const isLocalBrowserHost = browserHost === 'localhost' || browserHost === '127.0.0.1';
const fallbackBackendHost = `${browserHost}:8787`;
const desktopApiBase = desktopRuntimePort ? `http://127.0.0.1:${desktopRuntimePort}` : undefined;
const desktopWsBase = desktopRuntimePort ? `ws://127.0.0.1:${desktopRuntimePort}/ws/state` : undefined;

export const API_BASE =
  desktopApiBase ??
  process.env.NEXT_PUBLIC_LOCAL_RUNTIME_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (isLocalBrowserHost ? `${browserProtocol}//127.0.0.1:8787` : `${browserProtocol}//${fallbackBackendHost}`);

export const WS_BASE =
  desktopWsBase ??
  process.env.NEXT_PUBLIC_LOCAL_RUNTIME_WS ??
  process.env.NEXT_PUBLIC_BACKEND_WS ??
  (isLocalBrowserHost ? `${wsProtocol}//127.0.0.1:8787/ws/state` : `${wsProtocol}//${fallbackBackendHost}/ws/state`);
