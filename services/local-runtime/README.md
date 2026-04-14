# SketchBot Local Runtime

FastAPI local runtime for the desktop operator app.

## Responsibilities

- robot supervision and teleoperation
- ESP32 communication
- same-network camera ingest from the companion app
- vision and localization
- workflow state for the local operator session

## Layout

- `app/main.py` - FastAPI app entrypoint
- `app/api/` - REST and WebSocket routes
- `app/core/` - config and shared app state
- `app/models/` - Pydantic models
- `app/services/` - robot, vision, planner, and supervision services

## Local development

```powershell
cd services/local-runtime
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8787
```

The Electron desktop app starts this service automatically during desktop development.
