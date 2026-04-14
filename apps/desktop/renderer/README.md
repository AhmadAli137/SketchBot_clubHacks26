# SketchBot Desktop Renderer

Next.js operator dashboard rendered inside the Electron desktop shell.

## What It Includes

- guided camera source selection
- Camera Buddy same-network workflow
- local device / USB camera workflow
- external feed preview support
- future reserved `kit-webrtc` seam

## Environment Variables

Create `.env.local` with:

```env
NEXT_PUBLIC_LOCAL_RUNTIME_URL=http://127.0.0.1:8787
NEXT_PUBLIC_LOCAL_RUNTIME_WS=ws://127.0.0.1:8787/ws/state
```

## Development

```bash
cd apps/desktop/renderer
npm install
npm run dev
```

Open `http://127.0.0.1:3001`.

## Camera Recommendations

- `Companion App` is the default recommendation for same-network phone/tablet use.
- `This Device / USB` is best for webcams and capture cards attached to the operator machine.
- `External Feed` is best when another service already exposes a URL.
