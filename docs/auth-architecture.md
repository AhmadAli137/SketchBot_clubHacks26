# Authentication & Security Architecture

This document covers how Aibotics handles identity, session management, and API key security across every surface: the desktop app, web app, mobile companion, and the cloud backend.

---

## The Core Principle

**No API key ever lives in a client application.**

Anthropic, ElevenLabs, and OpenAI keys exist in exactly one place: the Aibotics cloud backend, running on a server we control. Every client — desktop, web, or mobile — must authenticate with *us* first before any AI feature works. We validate that identity on the server before forwarding anything to a third-party API.

A kid installing the desktop app, a teacher opening the web dashboard, or a parent using the mobile companion never has access to the underlying AI credentials. If an account is suspended, the backend stops serving requests — no key rotation required.

---

## Identity Provider: Supabase Auth

All user accounts live in Supabase. Supabase issues a **JWT access token** on sign-in. That token is the single credential that flows through every platform.

```
User signs in → Supabase issues JWT
JWT goes into:
  - Desktop: localStorage (Electron renderer) + auto-refreshed by Supabase client
  - Web: browser localStorage + auto-refreshed
  - Mobile: SecureStore (Expo) + auto-refreshed

Every AI request: Authorization: Bearer <jwt>
Cloud backend validates: supabase.auth.get_user(token) → accept or 401
```

Supabase handles:
- Password hashing and storage
- Email verification
- Token refresh (access tokens expire; Supabase silently refreshes using the refresh token)
- Session revocation (sign-out instantly invalidates)

We never store or transmit passwords ourselves.

---

## Request Flow: User to AI

```
┌─────────────────────────────────────────────────────────────────┐
│  Client App (Desktop / Web / Mobile)                            │
│                                                                 │
│  1. User logs in → Supabase returns JWT                         │
│  2. App calls: POST /api/tutor/message                          │
│               Authorization: Bearer <jwt>                       │
│               Body: { concept_id, student_name, trigger, ... }  │
└─────────────────────┬───────────────────────────────────────────┘
                      │  HTTPS
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  Aibotics Cloud Backend  (sketchbot-backend.onrender.com)       │
│                                                                 │
│  3. require_auth() calls supabase.auth.get_user(jwt)            │
│     → 401 if invalid, expired, or from a suspended account      │
│  4. Route handler runs with verified user context               │
│  5. Builds Anthropic / ElevenLabs request using server-side key │
│  6. Streams response back to client                             │
└─────────────────────┬───────────────────────────────────────────┘
                      │  HTTPS (server-to-server)
                      ▼
         Anthropic API / ElevenLabs API / OpenAI API
```

The client never sees the AI provider URL, key, or raw response format — only our shaped SSE stream or audio blob.

---

## Platform by Platform

### Desktop App (Electron + Next.js)

**Sign-in:** `auth-screen.tsx` calls `supabase.auth.signInWithPassword()`. On success, Supabase persists the session in `localStorage` under `sketchbot-account-v1`. The Supabase client auto-refreshes the access token in the background.

**Getting the token:** `useCloudAuthToken()` (`lib/cloud-api.ts`) subscribes to `supabase.auth.onAuthStateChange`. Any component that needs to make an AI call reads from this hook — the token is always fresh.

**AI calls:** `tutor-panel.tsx` and `use-lesson-audio.ts` call `https://sketchbot-backend.onrender.com/api/tutor/*` with `Authorization: Bearer <token>`. The local Python runtime at `localhost:8787` handles only hardware: robot serial commands, camera, and local Whisper transcription.

**Local runtime security:** The local runtime has no AI provider keys. It cannot make Anthropic or ElevenLabs calls. If someone inspects the installed app files, they find no secrets — only the Supabase URL and anon key, both of which are public by design (Supabase Row Level Security governs what each user can read).

**What ships in the installer:**
- Renderer bundle: `NEXT_PUBLIC_CLOUD_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — none of these are secrets
- Local Python runtime: hardware bridge only, no AI keys
- No `.env` file is bundled

---

### Web App (Next.js, future)

Identical auth flow to the desktop renderer. The Supabase client runs in the browser. All AI calls go to the cloud backend with the same `Authorization: Bearer <jwt>` header. No AI keys are ever in the Next.js build output or environment variables prefixed `NEXT_PUBLIC_`.

Server-side Next.js routes (if used) may read the Supabase service role key from a true server environment variable — this key never reaches the browser.

---

### Mobile Companion (React Native / Expo, future)

The Supabase React Native client handles sign-in and stores the session in **Expo SecureStore** (iOS Keychain / Android Keystore equivalent) rather than localStorage. SecureStore is encrypted at rest and inaccessible to other apps.

The token is retrieved and attached to cloud backend requests using the same `cloudHeaders(token)` pattern. No AI keys exist in the app bundle or in any `.env` file included in the build.

---

### Cloud Backend (FastAPI on Render)

All AI provider keys (`ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`) and the Supabase service role key exist **only as Render environment variables** — set through the Render dashboard, never committed to the repository.

Every endpoint under `/api/tutor/*` requires auth via the `require_auth` FastAPI dependency (`app/auth.py`). This calls `supabase.auth.get_user(token)` on every request. If the token is missing, expired, or from a revoked session, the request gets a `401` before any AI call is made.

For local development only, `SKIP_AUTH=true` bypasses JWT validation. This variable is never set on the production Render service.

---

## What Happens When a Session Expires

Supabase access tokens expire after one hour. The Supabase client (on all platforms) silently fetches a new access token using the refresh token before expiry. If the refresh token is also expired (or the user signed out), `getSession()` returns null, the auth hook clears the token, and subsequent AI requests get a `401` from the backend — which the app handles by redirecting to sign-in.

No user interaction is needed for normal session refresh.

---

## Key Rotation

If an AI provider key is compromised:

1. Go to the Render dashboard → `sketchbot-backend` → Environment → update the key value
2. Render redeploys automatically (zero-downtime rolling restart on Starter+)
3. Done. No app update needed, no installer rebuild, no user action required.

Because keys live only on the server, rotation is a 30-second operation.

---

## Adding a New Platform

Any new client (web, mobile, TV, embedded dashboard) follows the same pattern:

1. Integrate the Supabase client for that platform
2. Retrieve the JWT access token after sign-in
3. Attach it as `Authorization: Bearer <token>` on every request to `sketchbot-backend.onrender.com`
4. Never ask for or store any AI provider credential on the client

The cloud backend already accepts any valid Supabase JWT — no backend changes needed for a new client.

---

## Enforcement Summary

| Threat | Mitigation |
|--------|-----------|
| Key extracted from installer | No keys in installer — impossible |
| Key extracted from local runtime files | No keys in local runtime — impossible |
| Key found in git history | `.gitignore` covers all `.env*` files; history scan is clean |
| Stolen user JWT used to burn API quota | JWT validated per-request; rate limiting can be added per `user.id` |
| Disgruntled employee leaks a key | Rotate in Render dashboard — 30 seconds, no release needed |
| Account suspended but app still works | Backend checks Supabase on every request; suspended sessions return 401 |
| MITM on client-to-backend traffic | All traffic over HTTPS (Render enforces TLS) |
