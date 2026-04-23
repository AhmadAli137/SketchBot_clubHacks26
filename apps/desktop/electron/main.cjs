const { app, BrowserWindow, ipcMain, net, protocol, session } = require('electron');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { setupAutoUpdater } = require('./updater.cjs');

// Custom protocol — serves the static Next.js export as app://localhost/
// This avoids file:// limitations (broken /_next/ absolute paths, missing CORS, no fetch API).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } },
]);

// Allow Web Audio API to start without a prior user gesture
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

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
  message: 'Starting...',
  detail: '',
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

function rendererOutDir() {
  return path.join(__dirname, '..', 'renderer', 'out');
}

function rendererEntryTarget() {
  if (isDev) {
    return DEV_RENDERER_URL;
  }
  return 'app://localhost/index.html';
}

function splashFilePath() {
  return path.join(__dirname, 'splash.html');
}

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

/** @param {'light' | 'dark'} theme */
function writeThemeToDisk(theme) {
  try {
    fs.writeFileSync(themePrefPath(), JSON.stringify({ theme, savedAt: Date.now() }), 'utf8');
  } catch {
    /* ignore */
  }
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

  // Writable data dir — never inside the install folder (may be Program Files)
  const runtimeDataDir = path.join(app.getPath('userData'), 'runtime-data');
  fs.mkdirSync(runtimeDataDir, { recursive: true });

  runtimeCrashDetail = null;
  runtimeProcess = spawn(command, runtimeArgs(command), {
    cwd: runtimeWorkingDirectory(),
    env: {
      ...process.env,
      PORT: String(RUNTIME_PORT),
      BACKEND_CORS_ORIGINS: 'http://127.0.0.1:3001,http://localhost:3001,null,app://localhost',
      BACKEND_CORS_ORIGIN_REGEX: '^(file|app)://.*$',
      SKETCHBOT_DATA_DIR: runtimeDataDir,
      // Keep HuggingFace model downloads in userData, not the install dir
      HF_HOME: path.join(app.getPath('userData'), 'hf-cache'),
      TRANSFORMERS_CACHE: path.join(app.getPath('userData'), 'hf-cache'),
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

async function waitForRuntime(timeoutMs = 120000) {
  await waitForUrl(localRuntimeUrl('/health'), timeoutMs);
}

async function waitForRenderer(timeoutMs = 30000) {
  if (!isDev) {
    return;
  }
  await waitForUrl(DEV_RENDERER_URL, timeoutMs);
}

// Trigger Next.js page compilation in the background; awaiting this means
// the page is already compiled before Electron navigates to it → no blank frame.
async function prewarmRenderer(timeoutMs = 60000) {
  if (!isDev) return;
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const probe = () => {
      const req = http.get(`${DEV_RENDERER_URL}/`, (res) => {
        res.resume();
        resolve();
      });
      req.setTimeout(8000, () => req.destroy());
      req.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) { resolve(); return; }
        setTimeout(probe, 800);
      });
    };
    probe();
  });
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
        message: 'Starting...',
        detail: '',
      });

      startLocalRuntime();

      setLaunchState({
        phase: 'starting',
        message: 'Waking up the robot runtime...',
        detail: '',
      });
      await waitForRuntime();

      if (isDev) {
        setLaunchState({
          phase: 'starting',
          message: 'Loading the workspace...',
          detail: '',
        });
        await waitForRenderer();
      }

      setLaunchState({
        phase: 'ready',
        message: "You're in.",
        detail: localPairingTargets().length
          ? `Camera Buddy: ${localPairingTargets()[0]}`
          : '',
      });

      // Renderer is already loaded; just emit the ready state above.
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
    backgroundColor: '#060a12',
    title: 'Aibotics',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Show the native splash instantly — eliminates the blank frame while
  // Next.js compiles or Electron initialises the renderer process.
  await mainWindow.loadFile(splashFilePath());
  emitLaunchState();

  // Kick off runtime bootstrap in parallel (doesn't need the renderer ready).
  void bootstrapDesktop();

  // In dev: wait for Next.js dev server, then pre-warm the page compilation
  // so the first navigation to the renderer URL is instant (no blank frame).
  if (isDev) {
    await waitForRenderer();
    await prewarmRenderer();
  }

  // Switch from splash to the live React renderer — page is already compiled.
  await loadDesktopRenderer();
  emitLaunchState();

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Auto-update: only check in packaged builds, never during dev
  if (app.isPackaged) {
    setupAutoUpdater(mainWindow);
  }
}

ipcMain.handle('desktop:get-launch-state', () => launchState);
ipcMain.handle('desktop:retry-launch', async () => {
  await bootstrapDesktop({ forceRestart: true });
  return launchState;
});
ipcMain.handle('desktop:get-pairing-targets', () => localPairingTargets());
ipcMain.handle('desktop:set-theme', (_event, theme) => {
  if (theme === 'light' || theme === 'dark') {
    writeThemeToDisk(theme);
    return theme;
  }
  return readThemeFromDisk() ?? 'dark';
});

app.whenReady().then(async () => {
  // Serve the production static export via app://localhost/ so that Next.js's
  // default /_next/... absolute paths resolve correctly (file:// can't do this).
  if (!isDev) {
    const outDir = rendererOutDir();
    protocol.handle('app', (req) => {
      const { pathname } = new URL(req.url);
      const filePath = path.join(outDir, pathname === '/' ? 'index.html' : pathname);
      return net.fetch(pathToFileURL(filePath).toString());
    });
  }

  // Grant microphone (and camera) access so Web Speech API and camera features work.
  // Electron denies all permission requests by default.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'camera', 'audioCapture', 'videoCapture'];
    callback(allowed.includes(permission));
  });

  // Also required in newer Electron versions to pass the synchronous permission check.
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'microphone', 'camera', 'audioCapture', 'videoCapture'];
    return allowed.includes(permission);
  });

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
