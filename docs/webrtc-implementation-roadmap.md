# SketchBot WebRTC Implementation Roadmap

## Purpose

Turn the current camera prototype into a standards-aligned low-latency media system for operator viewing and robot localization.

This roadmap follows the architecture in [webrtc-video-architecture.md](C:/Users/Ahmad/OneDrive/Desktop/RoboticsPro/SketchBot_clubHacks26/docs/webrtc-video-architecture.md) and is intentionally sequenced so each phase leaves the repo in a usable state.

## Guiding principles

- keep operator viewing and vision analysis on separate paths
- avoid binding the long-term design to the current JPEG upload prototype
- preserve backend ownership of canonical state and overlay logic
- make every phase observable in the dashboard
- prefer standards-aligned interfaces over one-off transport hacks

## Milestone 0: Stabilize the current prototype

### Goal

Keep the existing source-selection flow usable while we add the next architecture layer.

### Scope

- Pi source remains supported
- phone JPEG upload remains available as a temporary fallback
- dashboard can switch sources without destabilizing the backend

### Deliverables

- source-aware backend camera state
- phone camera fallback page
- explicit operator status around camera source and health

### Exit criteria

- operator can switch camera sources reliably
- backend state remains the source of truth for camera source selection

## Milestone 1: Introduce media session state

### Goal

Stop modeling "camera transport" as if it were just a frame producer.

### Scope

- add explicit media session metadata to backend state
- introduce a backend service that provisions phone WebRTC session metadata
- define a clear `phone-webrtc` source mode in the backend contract

### Deliverables

- `MediaSessionSummary` in backend state
- `media_session_service.py`
- `phone-webrtc` contract document
- first provisioning endpoint for phone WebRTC session metadata

### Exit criteria

- backend can describe a media session independently from frame transport

## Milestone 2: Phone publisher page becomes a WebRTC publisher

### Goal

Replace JPEG upload with standards-aligned publish behavior.

### Scope

- rebuild `/camera/remote` as a real publisher page
- device selection
- preview
- publish start/stop
- connection diagnostics

### Deliverables

- publisher session bootstrap from backend
- phone UI that uses WebRTC publish flow
- operator-visible publish status

### Exit criteria

- phone no longer relies on per-frame HTTP uploads for the primary path

## Milestone 3: Dashboard becomes a WebRTC viewer

### Goal

Move the operator preview path onto low-latency media transport.

### Scope

- replace phone-source preview fallback with a viewer path
- keep overlays rendered in the webapp, not burned into the stream

### Deliverables

- viewer hook / player abstraction
- camera panel integration for `phone-webrtc`
- stream health and reconnect indicators

### Exit criteria

- operator sees a smooth live phone stream through WebRTC

## Milestone 4: Vision analysis path is decoupled

### Goal

Run AprilTag detection from sampled analysis frames rather than the display stream cadence.

### Scope

- sampled frame subscription from the media layer
- lower-resolution or lower-rate analysis feed
- independent backend state updates for localization

### Deliverables

- analysis frame adapter
- refactored invocation path for `apriltag_service.py`
- clear state timestamps for video health vs localization freshness

### Exit criteria

- live video remains smooth even under AprilTag processing load

## Milestone 5: Production deployment and connectivity hardening

### Goal

Make phone camera publishing reliable over real networks.

### Scope

- frontend deployment over HTTPS
- backend deployment separate from frontend
- TURN/STUN configuration
- media deployment and diagnostics

### Deliverables

- production env var contract
- deployment docs
- public source URLs and session diagnostics

### Exit criteria

- phone publishing works outside localhost / LAN assumptions

## Workstreams

### Backend workstream

- introduce media session state and contracts
- keep canonical state ownership in FastAPI
- expose session provisioning endpoints
- separate analysis concerns from display concerns

### Frontend workstream

- move camera transport logic out of the main dashboard page
- add a dedicated publisher hook/page
- add a dedicated viewer hook/component
- preserve overlay rendering in UI space

### Vision workstream

- create an analysis input boundary
- tune frame sampling policy
- track localization freshness independently

### Deployment workstream

- containerize backend where useful
- define frontend/backend/media public URLs
- add TURN/STUN and session diagnostics

## Suggested implementation order inside the repo

1. backend media session state + service
2. backend camera/media contracts
3. frontend camera source contract alignment
4. phone publisher page refactor
5. dashboard viewer refactor
6. vision analysis decoupling
7. deployment hardening

## Risks to watch

- mixing old and new camera source semantics in state
- accidentally coupling WebRTC viewer logic to backend fallback MJPEG assumptions
- running CV on display cadence instead of analysis cadence
- underestimating HTTPS / TURN requirements for phone publishing

## Definition of done for the migration

The migration is complete when:

- phone source uses WebRTC as the primary transport
- operator viewing is smooth and low-latency
- AprilTag detection runs from a separate analysis path
- backend remains the canonical source of state and overlays
- deployment works over HTTPS with appropriate connectivity infrastructure
