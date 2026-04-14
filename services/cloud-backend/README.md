# SketchBot Cloud Backend

Hosted administrative backend for SketchBot.

## Responsibilities

- Release metadata for the desktop and companion apps
- Administrative summaries for the hosted portal
- Account-adjacent and support-oriented cloud workflows
- Future sync endpoints for saved projects and classroom settings
- Site and release metadata loaded from `data/platform.json`
- Environment-driven CORS for hosted admin surfaces

## Development

```powershell
cd services/cloud-backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

## Environment

Use `.env.example` as the starting point:

- `CLOUD_CORS_ORIGINS`
- `CLOUD_CORS_ORIGIN_REGEX`
- `SKETCHBOT_CLOUD_DATA_FILE`

The default data source is `data/platform.json`, which can be swapped out later for a database-backed implementation.
