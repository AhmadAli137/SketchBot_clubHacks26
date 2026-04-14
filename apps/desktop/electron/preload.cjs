const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sketchbotDesktop', {
  isDesktopShell: true,
  runtimePort: process.env.SKETCHBOT_LOCAL_RUNTIME_PORT || '8787',
  rendererMode: 'desktop',
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
