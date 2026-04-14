const browserHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const browserProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const wsProtocol = browserProtocol === 'https:' ? 'wss:' : 'ws:';
const isLocalBrowserHost = browserHost === 'localhost' || browserHost === '127.0.0.1';
const fallbackBackendHost = `${browserHost}:8787`;

export const API_BASE =
  process.env.NEXT_PUBLIC_LOCAL_RUNTIME_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (isLocalBrowserHost ? `${browserProtocol}//127.0.0.1:8787` : `${browserProtocol}//${fallbackBackendHost}`);

export const WS_BASE =
  process.env.NEXT_PUBLIC_LOCAL_RUNTIME_WS ??
  process.env.NEXT_PUBLIC_BACKEND_WS ??
  (isLocalBrowserHost ? `${wsProtocol}//127.0.0.1:8787/ws/state` : `${wsProtocol}//${fallbackBackendHost}/ws/state`);
