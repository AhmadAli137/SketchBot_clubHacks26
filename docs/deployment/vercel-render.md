# SketchBot Deployment

This repo is set up for a split deployment:

- `webapp/` on Vercel
- `backend/` on Render using Docker

## Architecture

- Vercel serves the Next.js operator dashboard and the phone publisher page.
- Render serves the FastAPI backend, WebSocket state stream, and camera/session APIs.
- Phone camera publishing requires `https`, so the deployed frontend URL is the right place to use `/camera/remote`.

## Backend on Render

### 1. Create the web service

- Connect the GitHub repo to Render.
- Use the repository root and the included [`render.yaml`](../../render.yaml).
- Render will build from [`backend/Dockerfile`](../../backend/Dockerfile).

### 2. Configure backend environment variables

Use [`backend/.env.example`](../../backend/.env.example) as the template.

Required:

- `BACKEND_CORS_ORIGINS=https://your-app.vercel.app`

Optional:

- `BACKEND_CORS_ORIGIN_REGEX=^https://.*\\.vercel\\.app$`
- `OPENAI_API_KEY=...`
- `WEBRTC_ICE_PROVIDER=static` or `twilio`
- `WEBRTC_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302`
- `WEBRTC_TURN_URLS=turn:your-turn-host:3478?transport=udp,turn:your-turn-host:3478?transport=tcp`
- `WEBRTC_TURN_USERNAME=...`
- `WEBRTC_TURN_CREDENTIAL=...`
- `WEBRTC_ICE_SERVERS_JSON=[{\"urls\":[\"stun:...\",\"turn:...\"],\"username\":\"...\",\"credential\":\"...\"}]`
- `TWILIO_ACCOUNT_SID=...`
- `TWILIO_API_KEY=...`
- `TWILIO_API_SECRET=...`
- `TWILIO_TOKEN_TTL=3600`

If you use both a production Vercel domain and preview deployments, set both:

- `BACKEND_CORS_ORIGINS=https://your-app.vercel.app`
- `BACKEND_CORS_ORIGIN_REGEX=^https://.*\\.vercel\\.app$`

### 3. Validate the backend

After deploy, confirm:

- `GET /`
- `GET /api/state`
- `WebSocket /ws/state`

## Frontend on Vercel

### 1. Import the monorepo

- Import the GitHub repo in Vercel.
- Set the project `Root Directory` to `webapp`.
- Framework preset: `Next.js`.

### 2. Configure frontend environment variables

Use [`webapp/.env.example`](../../webapp/.env.example) as the template.

Set:

- `NEXT_PUBLIC_BACKEND_URL=https://your-render-service.onrender.com`
- `NEXT_PUBLIC_BACKEND_WS=wss://your-render-service.onrender.com/ws/state`

### 3. Validate the frontend

After deploy:

- Open the dashboard.
- Choose `Phone WebRTC`.
- Provision a session.
- Open `/camera/remote` on a phone over the Vercel `https` URL.
- Start camera and publishing.

## Important limitations

The current production transport is:

- direct browser-to-browser WebRTC negotiation
- STUN only
- backend signaling
- sampled JPEG analysis frames sent back to the backend

That works well for same-network testing and lightweight internet demos, but it is not yet the final media architecture.

For more reliable internet deployment, the next step is:

- add TURN
- then move toward the WHIP/SFU architecture in [`docs/webrtc-video-architecture.md`](../webrtc-video-architecture.md)

## TURN support

The app now advertises ICE servers from the backend to both:

- the phone publisher
- the dashboard viewer
- the legacy Pi WebRTC viewer config endpoint

Recommended production setup:

1. Start with `WEBRTC_TURN_URLS`, `WEBRTC_TURN_USERNAME`, and `WEBRTC_TURN_CREDENTIAL`.
2. Keep `WEBRTC_STUN_URLS` set as well.
3. Use `WEBRTC_ICE_SERVERS_JSON` only if you need a more customized ICE list than the simple env vars support.

For Twilio-backed ephemeral credentials instead of static TURN credentials:

1. Set `WEBRTC_ICE_PROVIDER=twilio`.
2. Set `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, and `TWILIO_API_SECRET`.
3. Optionally tune `TWILIO_TOKEN_TTL`.
4. Re-provision a phone session if an older session was created before the provider change.

## Recommended next production steps

1. Add TURN credentials and pass them into both publisher and viewer.
2. Move signaling/session state out of memory if you want multiple backend instances.
3. Replace direct peer negotiation with WHIP ingest plus a media server/SFU.
4. Add backend ingest for `external-camera` if you want full analysis on external sources.
