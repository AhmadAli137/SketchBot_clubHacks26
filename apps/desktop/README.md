# SketchBot Desktop

Electron shell for the local operator experience.

## Responsibilities

- Launch the local runtime on the operator machine
- Host the operator renderer UI
- Keep vision, teleoperation, and robot supervision local

## Development

From the repository root:

```powershell
npm run desktop:dev
```

That starts:

- the Next.js desktop renderer on `http://127.0.0.1:3001`
- the Electron shell
- the local runtime on `http://127.0.0.1:8787`

## Production Packaging

The desktop package is built around a local-first runtime:

- Electron hosts the operator window
- the renderer is exported as a static desktop UI
- the FastAPI local runtime is bundled as an extra resource

From the repository root:

```powershell
npm run desktop:dist
```

Notes:

- SketchBot Desktop still expects a working Python 3.11+ interpreter on the operator machine unless you later bundle Python as part of your installer strategy.
- If Python lives outside the normal PATH, set `SKETCHBOT_PYTHON` before launching the app.
- The packaged app exposes same-network Camera Buddy addresses so the companion device can join the room without guessing ports.

## Structure

- `electron/` - Electron main/preload processes
- `renderer/` - Next.js operator UI rendered inside the desktop shell
