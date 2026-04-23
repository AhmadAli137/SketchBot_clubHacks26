# AGENTS.md

## Cursor Cloud specific instructions

### Overview

SketchBot is a monorepo with four runnable services and two mobile/hardware targets (companion app, firmware) that cannot run in a headless VM. See `README.md` for the full product architecture and development entry points.

### Services

| Service | Command | Port | Notes |
|---|---|---|---|
| Local Runtime (FastAPI) | `npm run local-runtime:dev` | 8787 | Core robotics API; runs in mock mode without hardware |
| Desktop Renderer (Next.js) | `npm run --prefix apps/desktop/renderer dev` | 3001 | Electron renderer; run standalone for UI work |
| Cloud Backend (FastAPI) | `npm run cloud-backend:dev` | 8010 | Admin/release API |
| Admin Web (Next.js) | `npm run admin:dev` | 3002 | Requires Clerk keys for auth; loads without them but sign-in won't work |

### Gotchas

- **`python` vs `python3`**: The npm scripts use `python` (not `python3`). A symlink `ln -sf $(which python3) /usr/local/bin/python` is needed on systems where only `python3` exists. The update script handles this.
- **ESLint not hoisted**: The renderer's `eslint` and `eslint-config-next` are declared in `apps/desktop/renderer/package.json` but locked to its local `node_modules` in the renderer's own lockfile. After `npm install` at the root, the simplest fix is `npm install --no-save eslint eslint-config-next` at the root so hoisted resolution works. The update script handles this.
- **Desktop Electron**: `npm run desktop:dev` launches Electron + renderer together, but requires a display. In headless environments, run the renderer standalone with `npm run --prefix apps/desktop/renderer dev`.
- **Missing components**: `apps/desktop/renderer/src/app/page.tsx` imports `@/components/auth-screen` and `@/components/home-screen` which do not exist yet. The desktop renderer dev server starts and serves other routes, but the root page returns a 500 until these components are created.
- **`.env` files**: Copy `.env.example` to `.env` in `services/local-runtime/`, `services/cloud-backend/`, and `apps/admin-web/`. No secrets are required for basic dev — the local runtime runs in mock mode, and the cloud backend uses a local JSON data file.
- **Lint**: `npm run --prefix apps/desktop/renderer lint` runs ESLint via `next lint`. Only the renderer has a lint script.
- **Python deps PATH**: `pip install --user` puts binaries in `~/.local/bin` which may not be on PATH. The update script adds it.
