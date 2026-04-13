# SketchBot Backend

FastAPI backend for:
- robot supervision
- ESP32 communication
- state management
- planning
- vision and localization

## Layout

- `app/main.py` - FastAPI app entrypoint
- `app/api/` - REST and WebSocket routes
- `app/core/` - config and shared app state
- `app/models/` - Pydantic models
- `app/services/` - robot, vision, planner, supervisor services

## Deployment

- Docker image: [`Dockerfile`](Dockerfile)
- Environment template: [`.env.example`](.env.example)
- Render blueprint: [`../render.yaml`](../render.yaml)
- Full guide: [`../docs/deployment/vercel-render.md`](../docs/deployment/vercel-render.md)
