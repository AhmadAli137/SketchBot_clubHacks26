## Cursor Cloud specific instructions

### Architecture overview
SketchBot is an npm workspaces monorepo with two Python FastAPI backends and several JS/TS frontend apps. See `README.md` for the full layout and `docs/` for architecture details.

### Services

| Service | Port | Start command (from repo root) |
|---|---|---|
| Local Runtime (FastAPI) | 8787 | `npm run local-runtime:dev` |
| Cloud Backend (FastAPI) | 8010 | `npm run cloud-backend:dev` |
| Desktop Renderer (Next.js) | 3001 | `cd apps/desktop/renderer && npx next dev --port 3001` |
| Admin Web (Next.js) | 3002 | `npm run admin:dev` |

### Known issues
- The desktop renderer (`apps/desktop/renderer`) imports `@/components/auth-screen` and `@/components/home-screen` which do not exist yet. The Next.js dev server starts but the root page returns a 500. This is a pre-existing repo issue, not an environment problem.
- The Electron desktop app (`npm run desktop:dev`) requires a display and spawns the local-runtime automatically; it is not suitable for headless Cloud Agent use. Start the renderer and local-runtime separately instead.

### Lint
```
cd apps/desktop/renderer && npx next lint
```
Note: `next lint` is deprecated in Next.js 15.x and will print a deprecation notice — this is expected.

### Python `python` command
The environment needs `python` to point to `python3`. A symlink at `/usr/local/bin/python -> /usr/bin/python3` is set up by the update script.

### Environment files
Copy `.env.example` to `.env` (or `.env.local` for Next.js apps) in each service before starting:
- `services/local-runtime/.env`
- `services/cloud-backend/.env`
- `apps/admin-web/.env.local`

### No automated tests
The repository has no test scripts or test files yet. Verification is done via health endpoints and API calls.
