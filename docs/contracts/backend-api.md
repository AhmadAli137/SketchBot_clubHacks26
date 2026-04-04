# Backend API Contract (Initial)

## Purpose

Defines frontend ↔ backend contract ownership under SketchBot supervision.

## Current major areas

- `GET /health`
- `GET /api/state`
- `GET /api/views/monitor`
- `GET /api/views/compose`
- `GET /api/views/robot`
- `GET /api/camera/feed`
- `GET /api/camera/frame`
- `POST /api/compose/draft`
- `POST /api/robot/command`
- `POST /api/upload`
- `WS /ws/state`

## Notes

- Backend is the source of truth for task state and robot-facing app state.
- Frontend should not invent state fields that are not represented here.
- Proposed API changes should be reviewed by SketchBot before becoming contract assumptions.
