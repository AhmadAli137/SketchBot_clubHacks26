const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const DEV_RENDERER_URL = process.env.SKETCHBOT_RENDERER_URL || 'http://127.0.0.1:3001';
const RUNTIME_CONNECT_HOST = '127.0.0.1';
const RUNTIME_BIND_HOST = process.env.SKETCHBOT_LOCAL_RUNTIME_BIND_HOST || '0.0.0.0';
const RUNTIME_PORT = process.env.SKETCHBOT_LOCAL_RUNTIME_PORT || '8787';
const isDev = !app.isPackaged;

let mainWindow = null;
let runtimeProcess = null;
let runtimeCrashDetail = null;
let isQuitting = false;
let bootstrapPromise = null;

let launchState = {
  phase: 'starting',
  message: 'Booting SketchBot Desktop...',
  detail: 'Preparing the local robot runtime.',
};

function localRuntimeUrl(pathname = '') {
  return `http://${RUNTIME_CONNECT_HOST}:${RUNTIME_PORT}${pathname}`;
}

function runtimeWorkingDirectory() {
  if (isDev) {
    return path.join(__dirname, '..', '..', '..', 'services', 'local-runtime');
  }
  return path.join(process.resourcesPath, 'local-runtime');
}

function rendererEntryTarget() {
  if (isDev) {
    return DEV_RENDERER_URL;
  }
  const exportedIndex = path.join(__dirname, '..', 'renderer', 'out', 'index.html');
  return pathToFileURL(exportedIndex).toString();
}

function splashFilePath() {
  return path.join(__dirname, 'splash.html');
}

function probeCommand(command, args) {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      windowsHide: true,
    });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

function resolvePythonCommand() {
  const runtimeDir = runtimeWorkingDirectory();
  const candidates = [
    process.env.SKETCHBOT_PYTHON,
    path.join(runtimeDir, '.venv', 'Scripts', 'python.exe'),
    path.join(runtimeDir, '.venv', 'bin', 'python'),
    'python',
    'py',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const args = path.basename(candidate).toLowerCase() === 'py' ? ['-3', '--version'] : ['--version'];
    if (probeCommand(candidate, args)) {
      return candidate;
    }
  }

  return null;
}

function runtimeArgs(command) {
  if (path.basename(command).toLowerCase() === 'py') {
    return ['-3', '-m', 'uvicorn', 'app.main:app', '--host', RUNTIME_BIND_HOST, '--port', String(RUNTIME_PORT)];
  }
  return ['-m', 'uvicorn', 'app.main:app', '--host', RUNTIME_BIND_HOST, '--port', String(RUNTIME_PORT)];
}

function emitLaunchState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop:launch-state', launchState);
  }
}

function setLaunchState(nextState) {
  launchState = {
    ...launchState,
    ...nextState,
  };
  emitLaunchState();
}

function localPairingTargets() {
  const interfaces = os.networkInterfaces();
  const preferred = [];
  const fallback = [];

  for (const [name, values] of Object.entries(interfaces)) {
    for (const item of values ?? []) {
      if (!item || item.family !== 'IPv4' || item.internal) {
        continue;
      }

      if (item.address.startsWith('169.254.')) {
        continue;
      }

      const url = `http://${item.address}:${RUNTIME_PORT}`;
      const normalizedName = name.toLowerCase();
      const looksVirtual =
        normalizedName.includes('vethernet') ||
        normalizedName.includes('hyper-v') ||
        normalizedName.includes('wsl') ||
        normalizedName.includes('vmware') ||
        normalizedName.includes('virtual') ||
        normalizedName.includes('loopback');

      if (looksVirtual) {
        fallback.push(url);
      } else {
        preferred.push(url);
      }
    }
  }

  return Array.from(new Set([...preferred, ...fallback]));
}

function startLocalRuntime() {
  if (runtimeProcess) {
    return;
  }

  const command = resolvePythonCommand();
  if (!command) {
    throw new Error(
      'SketchBot Desktop could not find Python 3. Install Python 3.11+ or set SKETCHBOT_PYTHON to a working interpreter.',
    );
  }

  runtimeCrashDetail = null;
  runtimeProcess = spawn(command, runtimeArgs(command), {
    cwd: runtimeWorkingDirectory(),
    env: {
      ...process.env,
      PORT: String(RUNTIME_PORT),
      BACKEND_CORS_ORIGINS: 'http://127.0.0.1:3001,http://localhost:3001,null',
      BACKEND_CORS_ORIGIN_REGEX: '^file://.*$',
    },
    stdio: 'pipe',
    shell: false,
    windowsHide: true,
  });

  runtimeProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[local-runtime] ${chunk}`);
  });

  runtimeProcess.stderr?.on('data', (chunk) => {
    const text = String(chunk);
    runtimeCrashDetail = text.trim() || runtimeCrashDetail;
    process.stderr.write(`[local-runtime] ${chunk}`);
  });

  runtimeProcess.on('exit', (code, signal) => {
    runtimeProcess = null;
    if (isQuitting) {
      return;
    }
    setLaunchState({
      phase: 'error',
      message: 'The local robot runtime stopped unexpectedly.',
      detail: runtimeCrashDetail || `Process exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}.`,
    });
  });
}

function stopLocalRuntime() {
  if (!runtimeProcess) {
    return;
  }
  runtimeProcess.kill();
  runtimeProcess = null;
}

function waitForUrl(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.setTimeout(4000, () => {
        request.destroy(new Error(`Timed out waiting for ${url}`));
      });

      request.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(probe, 500);
      });
    };

    probe();
  });
}

async function waitForRuntime(timeoutMs = 45000) {
  await waitForUrl(localRuntimeUrl('/health'), timeoutMs);
}

async function waitForRenderer(timeoutMs = 30000) {
  if (!isDev) {
    return;
  }
  await waitForUrl(DEV_RENDERER_URL, timeoutMs);
}

async function loadDesktopRenderer() {
  const target = rendererEntryTarget();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (target.startsWith('file:')) {
    await mainWindow.loadURL(target);
    return;
  }

  await mainWindow.loadURL(target);
}

async function bootstrapDesktop({ forceRestart = false } = {}) {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    try {
      if (forceRestart) {
        stopLocalRuntime();
      }

      setLaunchState({
        phase: 'starting',
        message: 'Booting SketchBot Desktop...',
        detail: 'Preparing the local robot runtime and operator workspace.',
      });

      startLocalRuntime();

      setLaunchState({
        phase: 'starting',
        message: 'Starting the local robot runtime...',
        detail: `Waiting for ${localRuntimeUrl('/health')}.`,
      });
      await waitForRuntime();

      if (isDev) {
        setLaunchState({
          phase: 'starting',
          message: 'Waiting for the operator UI...',
          detail: `Connecting to ${DEV_RENDERER_URL}.`,
        });
        await waitForRenderer();
      }

      setLaunchState({
        phase: 'ready',
        message: 'SketchBot Desktop is ready.',
        detail: localPairingTargets().length
          ? `Camera Buddy can join on ${localPairingTargets()[0]}.`
          : 'Local runtime is ready for the operator UI.',
      });

      await loadDesktopRenderer();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown startup error.';
      setLaunchState({
        phase: 'error',
        message: 'SketchBot Desktop could not finish starting.',
        detail,
      });
      if (mainWindow && !mainWindow.isDestroyed()) {
        await mainWindow.loadFile(splashFilePath());
      }
    } finally {
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#f3f7ff',
    title: 'SketchBot Desktop',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await mainWindow.loadFile(splashFilePath());
  emitLaunchState();
  void bootstrapDesktop();

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('desktop:get-launch-state', () => launchState);
ipcMain.handle('desktop:retry-launch', async () => {
  await bootstrapDesktop({ forceRestart: true });
  return launchState;
});
ipcMain.handle('desktop:get-pairing-targets', () => localPairingTargets());

app.whenReady().then(async () => {
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopLocalRuntime();
});
