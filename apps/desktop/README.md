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

## Structure

- `electron/` - Electron main/preload processes
- `renderer/` - Next.js operator UI rendered inside the desktop shell
