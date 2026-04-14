# SketchBot Deployment

The repository now deploys as two hosted products plus local apps:

- `apps/admin-web/` on Vercel
- `services/cloud-backend/` on Render
- `apps/desktop/` distributed as a desktop app
- `services/local-runtime/` bundled or launched locally with the desktop app
- `apps/companion/` used on the same network as the desktop app

## Hosted admin site on Vercel

### 1. Import the monorepo

- Import the GitHub repo in Vercel.
- Set the project `Root Directory` to `apps/admin-web`.
- Framework preset: `Next.js`.

### 2. Configure environment variables

Use [`apps/admin-web/.env.example`](../../apps/admin-web/.env.example) as the template.

Set:

- `NEXT_PUBLIC_CLOUD_BACKEND_URL=https://your-cloud-backend.onrender.com`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...`
- `CLERK_SECRET_KEY=...`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`

## Hosted cloud backend on Render

### 1. Create the web service

- Connect the GitHub repo to Render.
- Use the repository root and the included [`render.yaml`](../../render.yaml).
- Render now targets `services/cloud-backend`.

### 2. Validate the backend

After deploy, confirm:

- `GET /`
- `GET /api/public/site`
- `GET /api/admin/summary`

## Local desktop + runtime

- `apps/desktop` is the Electron shell.
- `apps/desktop/renderer` is the operator UI.
- `services/local-runtime` is the FastAPI runtime launched on the operator machine, usually on `127.0.0.1:8787`.

During local development:

```powershell
npm run desktop:dev
```

## Same-network companion app

- Use `apps/companion` on a phone or tablet.
- Pair it with the desktop app over the same Wi-Fi.
- Point the app at the desktop machine runtime URL, for example:

```text
http://192.168.2.16:8787
```
