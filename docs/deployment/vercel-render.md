# SketchBot Deployment

The repository deploys as two hosted products plus local apps:

- `apps/admin-web/` on Vercel — marketing site, pricing page, teacher portal, admin console
- `services/cloud-backend/` on Render — accounts, releases, classroom management
- `apps/desktop/` distributed as a desktop app
- `services/local-runtime/` bundled or launched locally with the desktop app
- `apps/companion/` used on the same network as the desktop app

## Hosted admin site on Vercel

The Vercel project at `sketch-bot-club-hacks26.vercel.app` was previously wired to the old `webapp/` folder (a browser-only operator UI that has since been replaced by `apps/desktop`). The folder has been removed from the repo. To repurpose the same Vercel project for the new admin site, do the following **once** in the Vercel dashboard.

### 1. Repoint the existing Vercel project

Open the project in Vercel, then:

1. **Settings → General → Root Directory** — change from `webapp` (or whatever it currently is) to `apps/admin-web`. Check "Include source files outside of the Root Directory" so Vercel still sees the monorepo lockfile and workspaces.
2. **Settings → General → Framework Preset** — confirm it is `Next.js` (auto-detected once Root Directory is correct).
3. **Settings → General → Build & Output** — leave all fields blank so Vercel uses the Next.js defaults (`next build`, `.next`).
4. **Settings → General → Node.js Version** — `20.x` or later.

No `vercel.json` is needed. The `apps/admin-web/package.json` scripts and the Next.js preset cover the build.

### 2. Configure environment variables

In **Settings → Environment Variables**, add the following for the `Production`, `Preview`, and `Development` environments. Use [`apps/admin-web/.env.example`](../../apps/admin-web/.env.example) as the template.

| Variable                             | Value                                                             |
| ------------------------------------ | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_CLOUD_BACKEND_URL`      | `https://sketchbot-backend.onrender.com` (or your Render URL)     |
| `NEXT_PUBLIC_SITE_URL`               | `https://sketch-bot-club-hacks26.vercel.app` (or your final domain) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | Clerk publishable key                                             |
| `CLERK_SECRET_KEY`                   | Clerk secret key                                                  |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`      | `/sign-in`                                                        |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`      | `/sign-up`                                                        |

Leave the Clerk keys blank during a first deploy if you want the site to render without auth — the layout has an `OptionalClerkProvider` guard and the site header will show an "Auth setup pending" note instead of the sign-in/up links.

### 3. Trigger a redeploy

After the settings change, push any commit to the default branch or click **Deployments → Redeploy → Use existing build cache: No**. The first successful build will replace the old operator UI with the new admin site.

### 4. Verify in production

Once the deploy is green, sanity-check each route:

- `/` — marketing home with the "See pricing" CTA
- `/pricing` — five-tier plan grid (Explorer, Home, Classroom, School, District)
- `/portal` — teacher portal (may show "Using local placeholder data" until the cloud backend is reachable)
- `/sign-in`, `/sign-up` — Clerk flows, only if auth env vars are set

### 5. Custom domain (optional)

Once the Vercel project is serving the new site, attach a production domain in **Settings → Domains** (for example `app.sketchbot.app` or `www.sketchbot.app`). Update `NEXT_PUBLIC_SITE_URL` and the Clerk allowed origins to match.

## Hosted cloud backend on Render

The Render service at `sketchbot-backend.onrender.com` was previously running the legacy browser-era backend (its root endpoint still returns the old `version: "0.1.0"` with a `robot_connected` field). It needs to be repointed at the new `services/cloud-backend` so the hosted admin site can fetch site, summary, release, and support data.

### 1. Repoint the existing Render service

The [`render.yaml`](../../render.yaml) blueprint is now aligned with the existing service slug `sketchbot-backend`, so a blueprint re-sync will adopt the existing service rather than create a new one.

1. In Render, open the **sketchbot-backend** service.
2. **Settings → Build & Deploy**:
   - **Repository** — point at this monorepo.
   - **Root Directory** — `services/cloud-backend`.
   - **Runtime** — `Python 3`.
   - **Build Command** — `pip install -r requirements.txt`.
   - **Start Command** — `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
   - **Health Check Path** — `/health`.
3. **Settings → Environment**: remove any `PORT` override (Render assigns `$PORT` automatically; setting it breaks the deploy). Keep or add:

   | Key                        | Value                                                    |
   | -------------------------- | -------------------------------------------------------- |
   | `CLOUD_CORS_ORIGIN_REGEX`  | `^https://.*\.vercel\.app$`                              |
   | `CLOUD_CORS_ORIGINS`       | `https://sketch-bot-club-hacks26.vercel.app` (or custom) |
   | `SKETCHBOT_CLOUD_DATA_FILE`| *blank* — defaults to the bundled `data/platform.json`   |

4. **Manual Deploy → Deploy latest commit**, selecting **Clear build cache & deploy**. The first successful deploy replaces the old backend with v0.2.0.

> Prefer Blueprints? In Render, **Blueprints → New Blueprint Instance** against this repo will re-sync the service from `render.yaml`. Because the blueprint service name matches the existing slug, Render attaches to it instead of creating a duplicate.

### 2. Validate the backend

After the deploy turns green, hit these URLs (they replace what the old backend exposed):

- `https://sketchbot-backend.onrender.com/` — should return `{"name":"SketchBot Cloud Backend","version":"0.2.0","mode":"administrative", ...}` (if you still see `"version":"0.1.0"` with `robot_connected`, the old service is still live — redeploy).
- `https://sketchbot-backend.onrender.com/health` — `{"status":"ok", ...}`.
- `https://sketchbot-backend.onrender.com/api/admin/summary`.
- `https://sketchbot-backend.onrender.com/api/admin/releases`.
- `https://sketchbot-backend.onrender.com/api/admin/support`.

### 3. CORS

`CLOUD_CORS_ORIGIN_REGEX` (`^https://.*\.vercel\.app$`) already covers the existing Vercel deployment and all preview URLs. When you attach a production custom domain (e.g. `app.sketchbot.app`), broaden the regex or list the exact origin in `CLOUD_CORS_ORIGINS` before the admin site's `/portal` will load live data instead of falling back to local placeholders.

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
