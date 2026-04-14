const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const RENDERER_URL = process.env.SKETCHBOT_RENDERER_URL || 'http://127.0.0.1:3001';
const RUNTIME_PORT = process.env.SKETCHBOT_LOCAL_RUNTIME_PORT || '8787';
const isDev = !app.isPackaged;

let mainWindow = null;
let runtimeProcess = null;

function runtimeWorkingDirectory() {
  return path.join(__dirname, '..', '..', '..', 'services', 'local-runtime');
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
  return candidates[0];
}

function runtimeArgs(command) {
  if (path.basename(command).toLowerCase() === 'py') {
    return ['-3', '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(RUNTIME_PORT)];
  }
  return ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(RUNTIME_PORT)];
}

function startLocalRuntime() {
  if (runtimeProcess) {
    return;
  }

  const command = resolvePythonCommand();
  runtimeProcess = spawn(command, runtimeArgs(command), {
    cwd: runtimeWorkingDirectory(),
    env: {
      ...process.env,
      PORT: String(RUNTIME_PORT),
      BACKEND_CORS_ORIGINS: 'http://127.0.0.1:3001,http://localhost:3001',
    },
    stdio: 'pipe',
    shell: false,
  });

  runtimeProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[local-runtime] ${chunk}`);
  });

  runtimeProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[local-runtime] ${chunk}`);
  });

  runtimeProcess.on('exit', () => {
    runtimeProcess = null;
  });
}

function stopLocalRuntime() {
  if (!runtimeProcess) {
    return;
  }
  runtimeProcess.kill();
  runtimeProcess = null;
}

function waitForRenderer(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for renderer at ${url}`));
          return;
        }
        setTimeout(probe, 500);
      });
    };

    probe();
  });
}

async function createMainWindow() {
  startLocalRuntime();
  if (isDev) {
    await waitForRenderer(RENDERER_URL);
  }

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

  await mainWindow.loadURL(RENDERER_URL);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

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
  stopLocalRuntime();
});
