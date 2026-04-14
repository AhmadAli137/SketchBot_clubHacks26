# SketchBot

Monorepo for the ESP32-based drawing robot system.

## Structure

- `firmware/` - ESP-IDF project for the ESP32-C5 robot controller
- `backend/` - FastAPI backend for supervision, vision, localization, planning, and robot coordination
- `webapp/` - Next.js operator UI for visualization, approval, and control
- `companion-app/` - Expo mobile app for same-network camera streaming from a phone or tablet

## Deployment model

This repository is intended to stay as a single monorepo.

- GitHub: one repo containing firmware, backend, and webapp
- Vercel: deploy the frontend from `webapp/`
- Backend hosting: deploy `backend/` separately to a Python-friendly host such as Render, Railway, Fly.io, or a VPS
- Firmware: build and flash locally with ESP-IDF from `firmware/`

Deployment guide:

- [`docs/deployment/vercel-render.md`](docs/deployment/vercel-render.md)

## Planned stack

- Firmware: ESP-IDF on ESP32-C5
- Backend: Python + FastAPI
- Frontend: React + Next.js
- Companion capture: Expo + React Native
- Robot transport: WebSocket
- Vision/localization: OpenCV + AprilTags

## Camera modes

- `Companion App` for same-network phone/tablet streaming without TURN or VPS relay infrastructure
- `This Device / USB` for webcams, tablets, or capture cards attached directly to the operator machine
- `External Feed` for MJPEG/image URLs that already exist elsewhere
- `Certified Kit WebRTC` reserved for future higher-end hardware bundles

## Responsibilities

### firmware/

- Motor and pen control
- Low-level motion primitives
- Telemetry and acknowledgements
- Local safety timeouts and stop behavior

### backend/

- ESP32 WebSocket server/client coordination
- Frontend API + WebSocket state streaming
- Camera ingest and AprilTag detection
- Coordinate transforms and localization
- Workflow state machine and supervision
- Planning and execution validation

### webapp/

- Operator dashboard
- Camera overlays
- Plan preview
- Approvals and execution controls
- Diagnostics and logs

## Initial development order

1. Repository structure and docs
2. Backend FastAPI skeleton
3. Webapp Next.js skeleton
4. Backend <-> webapp live connectivity
5. Backend <-> ESP32 protocol
6. Vision and localization
7. Supervised execution flow
