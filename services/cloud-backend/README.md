# SketchBot Cloud Backend

Hosted administrative backend for SketchBot.

## Responsibilities

- Release metadata for the desktop and companion apps
- Administrative summaries for the hosted portal
- Account-adjacent and support-oriented cloud workflows
- Future sync endpoints for saved projects and classroom settings

## Development

```powershell
cd services/cloud-backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```
