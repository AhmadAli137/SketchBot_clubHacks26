# SketchBot

Monorepo for the SketchBot classroom robotics platform.

## Product architecture

SketchBot is now organized as three products plus firmware:

1. `apps/desktop`
   - Electron desktop operator app
   - launches the local runtime
   - runs camera vision and teleoperation locally

2. `apps/admin-web`
   - hosted marketing and administrative website
   - account, release, and classroom management surface

3. `apps/companion`
   - Expo `Camera Buddy` app
   - same-network phone or tablet camera companion for the desktop app

4. `services/local-runtime`
   - FastAPI runtime that stays on the operator machine
   - robot supervision, local vision, camera ingest, and teleoperation state

5. `services/cloud-backend`
   - hosted backend for administrative and cloud workflows

6. `firmware`
   - ESP-IDF project for the ESP32-C5 robot controller

## Why this split

The robotics-critical path now runs locally:

- camera ingest
- AprilTag localization
- teleoperation
- robot supervision

The hosted side is now for:

- accounts and authentication
- updates and releases
- saved projects and administrative workflows
- marketing and onboarding

## Repository layout

- `apps/desktop/renderer` - Next.js renderer used inside Electron
- `apps/desktop/electron` - Electron main and preload processes
- `apps/admin-web` - hosted corporate/admin web app
- `apps/companion` - Expo Camera Buddy app
- `services/local-runtime` - local FastAPI runtime
- `services/cloud-backend` - hosted FastAPI cloud backend
- `firmware` - ESP32 firmware
- `docs` - architecture and deployment notes

## Development entry points

From the repository root:

```powershell
npm run desktop:dev
npm run desktop:dist
npm run admin:dev
npm run companion:dev
npm run local-runtime:dev
npm run cloud-backend:dev
```

## Deployment model

- `apps/desktop` is distributed as a local desktop app
- `services/local-runtime` runs locally with the desktop app
- `apps/companion` runs in Expo Go or as a packaged mobile app
- `apps/companion` assumes the same local network as the desktop app
- `apps/admin-web` deploys to Vercel at `sketch-bot-club-hacks26.vercel.app`
- `services/cloud-backend` deploys to Render at `sketchbot-backend.onrender.com`

The legacy `webapp/` folder (browser-only operator UI) and the legacy
robot-control backend have both been retired. Their hosted deployments
are being repurposed: Vercel now serves `apps/admin-web` and Render now
serves `services/cloud-backend`. See
[`docs/deployment/vercel-render.md`](docs/deployment/vercel-render.md)
for the exact dashboard steps to repoint each project.
