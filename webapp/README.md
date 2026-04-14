# SketchBot Web App

Next.js operator dashboard for SketchBot.

## What It Includes

- Clerk authentication for operator access
- guided camera source selection
- companion-app same-network workflow
- local device / USB camera workflow
- external feed preview support
- future reserved `kit-webrtc` seam

## Environment Variables

Create `.env.local` with:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_BACKEND_WS=ws://localhost:8000/ws/state

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key
CLERK_SECRET_KEY=sk_test_your_secret_key
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

## Development

```bash
cd webapp
npm install
npm run dev
```

Open `http://localhost:3000`.

## Clerk Setup

1. Create a Clerk application.
2. Copy the publishable and secret keys into `.env.local`.
3. Start the app and visit `/sign-in`.
4. The root dashboard route is protected by Clerk middleware.

## Camera Recommendations

- `Companion App` is the default recommendation for same-network phone/tablet use.
- `This Device / USB` is best for webcams and capture cards attached to the operator machine.
- `External Feed` is best when another service already exposes a URL.
