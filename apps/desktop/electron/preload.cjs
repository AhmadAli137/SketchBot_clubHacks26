const { contextBridge, ipcRenderer, app } = require('electron');
const fs = require('fs');
const path = require('path');

function themePrefPath() {
  return path.join(app.getPath('userData'), 'sketchbot-theme-pref.json');
}

/** @returns {'light' | 'dark' | null} */
function readThemeFromDisk() {
  try {
    const p = themePrefPath();
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j.theme === 'light' || j.theme === 'dark') {
        return j.theme;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

contextBridge.exposeInMainWorld('sketchbotDesktop', {
  isDesktopShell: true,
  runtimePort: process.env.SKETCHBOT_LOCAL_RUNTIME_PORT || '8787',
  rendererMode: 'desktop',
  initialTheme: readThemeFromDisk(),
  setTheme: (theme) => ipcRenderer.invoke('desktop:set-theme', theme),
  getLaunchState: () => ipcRenderer.invoke('desktop:get-launch-state'),
  retryLaunch: () => ipcRenderer.invoke('desktop:retry-launch'),
  getPairingTargets: () => ipcRenderer.invoke('desktop:get-pairing-targets'),
  onLaunchState: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('desktop:launch-state', listener);
    return () => {
      ipcRenderer.removeListener('desktop:launch-state', listener);
    };
  },
});
