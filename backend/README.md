# SketchBot Backend

FastAPI backend for:
- robot supervision
- ESP32 communication
- state management
- planning
- vision and localization

## Initial layout

- `app/main.py` — FastAPI app entrypoint
- `app/api/` — REST and WebSocket routes
- `app/core/` — config and shared app state
- `app/models/` — Pydantic models
- `app/services/` — robot, vision, planner, supervisor services

## Next steps

- Add Python virtual environment
- Install FastAPI + Uvicorn
- Add `/health` endpoint
- Add WebSocket endpoint for live state
