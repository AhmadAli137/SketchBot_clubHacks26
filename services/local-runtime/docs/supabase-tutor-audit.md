# Supabase: tutor audit & sync

This documents how **SketchBot local-runtime** mirrors tutor audit data (chat turns, evaluations, session events) to **Supabase**, and how that fits with **Row Level Security**.

## Project setup (Supabase dashboard)

When creating the project:

- **Enable Data API** — keep on (PostgREST is what the backend uses).
- **Enable automatic RLS** — we use this. New tables in `public` get RLS enabled by default so they are not exposed via the anon key until you add policies. The **service role** used only on the server still bypasses RLS for inserts.

If you only ever access these tables from **local-runtime** with the **service role** key, RLS does not block inserts. If you later read from the **browser** with the **anon** key, you must add explicit RLS policies or use a server proxy.

## One-time: create tables

1. Open **SQL** → new query in the Supabase dashboard.
2. Paste and run the contents of:

   `services/local-runtime/scripts/supabase_tutor_audit.sql`

That creates:

- `public.tutor_chat_turns` (note column `tutor_trigger` — `trigger` is reserved in PostgreSQL)
- `public.tutor_evaluation_turns` (`result_json` as `jsonb`)
- `public.tutor_session_events`

## Environment variables (local-runtime `.env`)

```env
# Required for cloud sync (get URL + service role from Supabase → Project Settings → API)
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Optional: disable all Supabase HTTP calls (local SQLite audit only)
# SUPABASE_SYNC_DISABLE=1
```

**Security:** Never put the service role key in the desktop app, frontend env, or a public repo. It bypasses RLS and must stay on the machine running **local-runtime** only.

## How sync works

1. Every audit row is written to **local** SQLite first (`data/tutor_audit.sqlite`).
2. If Supabase is configured, the same payload is **POST**ed to PostgREST (`/rest/v1/<table>`).
3. If the network fails, the row is queued in **`supabase_sync_outbox`** in the same SQLite file.
4. A background thread retries the outbox every **~45 seconds** (and shortly after startup).

Tuning (optional):

- `TUTOR_RESPONSE_CACHE_*` — LLM response **cache** (separate from audit; JSON files under `data/`).
- `TUTOR_AUDIT_DISABLE=1` — disables **all** local audit writes (and thus cloud sync).

## Related files

| File | Purpose |
|------|---------|
| `scripts/supabase_tutor_audit.sql` | Tables to run in Supabase SQL editor |
| `app/services/tutor_audit_log.py` | Local SQLite + outbox + cloud hook |
| `app/services/tutor_supabase_sync.py` | httpx PostgREST client |
| `app/main.py` | Starts outbox worker when Supabase env is set |

## Quick checklist

- [ ] Project created (auto RLS enabled per above).
- [ ] SQL script applied in Supabase.
- [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `local-runtime/.env`.
- [ ] Restart local-runtime; check logs if inserts fail (wrong URL/key or table names).

## Troubleshooting (tables not updating in Supabase)

1. **Confirm the backend sees your env** (after any `.env` edit, restart the API — `uvicorn --reload` does not always reload env from disk the way you expect):

   ```http
   GET http://127.0.0.1:8787/api/tutor/status
   ```

   Under `supabase_sync`:

   - **`configured`: `false`** — `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` missing, wrong names, or `SUPABASE_SYNC_DISABLE=1`. Fix `.env` and restart.
   - **`configured`: `true`** and **`outbox_pending` greater than 0** — inserts are **failing** (wrong table/column, RLS misconfiguration, or bad key). Rows pile up in the local outbox until they succeed or hit the retry limit.

2. **Watch the terminal** running local-runtime for log lines from `sketchbot.supabase` (HTTP status and Supabase error body). Typical fixes:

   - Tables not created → run `scripts/supabase_tutor_audit.sql` in the Supabase SQL editor.
   - **401 / JWT** → you’re using the **anon** key; use the **service role** key for the backend.
   - **404 / PGRST205** → table not in `public` or name mismatch (must match `tutor_chat_turns`, etc.).
   - **400 / column** → schema drift (e.g. column renamed); align with the SQL script.

3. **Confirm chat hits this backend** — the desktop app must use the same base URL as the process that has Supabase in `.env` (usually `services/local-runtime/.env` when using `npm run local-runtime:dev` from the repo).

4. **`TUTOR_AUDIT_DISABLE=1`** — disables **all** audit writes (local + cloud). Leave unset for sync to run.
