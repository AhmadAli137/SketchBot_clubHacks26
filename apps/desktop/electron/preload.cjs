const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('sketchbotDesktop', {
  runtimePort: process.env.SKETCHBOT_LOCAL_RUNTIME_PORT || '8787',
  rendererMode: 'desktop',
});
