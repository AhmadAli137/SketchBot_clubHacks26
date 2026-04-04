# Validation Checklist

Actionable validation plan derived from `docs/implementation-roadmap.md`.

## Scope

This checklist is organized around the contract surfaces called out in the roadmap:
- canonical backend state shape
- websocket state event shape
- overlay object schema
- camera feed/frame semantics
- robot command request/result shape

It also maps those surfaces to the two primary product workflows:
- Dashboard
- Create Task

## How to use this checklist

For each item:
- mark **Pass / Fail / Blocked / Not Implemented**
- capture the endpoint, event name, payload, or UI state that was validated
- attach screenshots or payload samples for regressions
- note whether the behavior was tested in **mock** or **live** mode

---

# 1) Contract-surface validation

## 1. Backend state shape

### 1.1 State payload availability
- [ ] Confirm there is one canonical backend state payload used as the source of truth.
- [ ] Confirm the webapp can fetch or hydrate initial state without relying on UI-only defaults.
- [ ] Confirm the state payload is valid when the robot is disconnected / idle / unavailable.
- [ ] Confirm the state payload is valid when no active task exists.

### 1.2 Required state domains
- [ ] Verify state includes robot status information needed by Dashboard.
- [ ] Verify state includes camera/feed information needed by Dashboard.
- [ ] Verify state includes overlay/task information needed by Dashboard.
- [ ] Verify state includes mode information needed to distinguish mock vs live behavior.
- [ ] Verify state includes enough task metadata for Create Task to transition back to Dashboard after submit.

### 1.3 Shape stability
- [ ] Confirm required fields are always present or explicitly nullable.
- [ ] Confirm optional fields are documented by absence/null semantics, not ad hoc frontend guesses.
- [ ] Confirm enum-like fields use stable values and casing.
- [ ] Confirm numeric/string/boolean field types are consistent across empty, idle, and active states.

### 1.4 Failure handling
- [ ] Confirm invalid state payloads fail loudly in logs/tests instead of silently rendering partial UI.
- [ ] Confirm backward-incompatible shape changes are caught by schema or contract tests.

## 2. WebSocket state event shape

### 2.1 Event contract
- [ ] Confirm the event name(s) for state updates are documented and stable.
- [ ] Confirm event payload shape matches the canonical backend state contract or a documented delta contract.
- [ ] Confirm event payloads include enough information for the Dashboard to update without a full refresh.

### 2.2 Delivery behavior
- [ ] Confirm initial page load plus subsequent websocket updates do not conflict.
- [ ] Confirm reconnect behavior restores current state correctly.
- [ ] Confirm duplicate websocket events do not corrupt UI state.
- [ ] Confirm out-of-order or delayed events do not leave stale overlays/task status visible.

### 2.3 Workflow-triggered updates
- [ ] Confirm Create Task submission triggers a websocket-visible state transition.
- [ ] Confirm robot status changes appear on Dashboard via websocket without manual refresh.
- [ ] Confirm overlay changes appear on Dashboard via websocket when applicable.

## 3. Overlay object schema

### 3.1 Schema validity
- [ ] Confirm overlay objects have a stable type/discriminator if multiple overlay kinds exist.
- [ ] Confirm required geometry/position fields are present.
- [ ] Confirm style/display fields are either provided by backend or intentionally frontend-derived.
- [ ] Confirm overlay identifiers are stable enough for list/render reconciliation.

### 3.2 Rendering readiness
- [ ] Confirm Dashboard can render an empty overlay list.
- [ ] Confirm Dashboard can render one overlay object.
- [ ] Confirm Dashboard can render multiple overlay objects in a stable order.
- [ ] Confirm malformed overlay objects are rejected or surfaced clearly.

### 3.3 Coordinate semantics
- [ ] Confirm overlay coordinate space is documented relative to the camera frame/canvas.
- [ ] Confirm overlay positions remain correct if the displayed camera viewport is resized.
- [ ] Confirm any normalization rules (pixels vs normalized coordinates) are consistent.

## 4. Camera feed/frame semantics

### 4.1 Feed contract
- [ ] Confirm Dashboard knows where to obtain the active camera feed/frame.
- [ ] Confirm camera metadata needed for rendering is present.
- [ ] Confirm the app behavior is defined when camera is unavailable.

### 4.2 Display correctness
- [ ] Confirm the camera feed renders without stretching/distorting overlay alignment.
- [ ] Confirm frame refresh behavior is documented enough for test reproducibility.
- [ ] Confirm stale or missing frames show an explicit fallback state.

### 4.3 Overlay coupling
- [ ] Confirm overlay alignment is correct on the rendered camera frame.
- [ ] Confirm camera aspect ratio changes do not break overlay placement.
- [ ] Confirm mock camera data and live camera data follow the same display assumptions.

## 5. Robot command request/result shape

### 5.1 Request contract
- [ ] Confirm each robot command uses a stable request shape.
- [ ] Confirm required request fields are explicit and validated.
- [ ] Confirm unsupported commands fail with a defined error shape.

### 5.2 Result contract
- [ ] Confirm each robot command returns a stable result shape.
- [ ] Confirm success/failure is machine-readable, not inferred from message text.
- [ ] Confirm error states include enough detail for UI handling and debugging.

### 5.3 State integration
- [ ] Confirm robot command results reconcile into backend state and Dashboard status.
- [ ] Confirm command failures do not leave Dashboard in a false-success state.
- [ ] Confirm command completion/failure is reflected in websocket updates.

---

# 2) Workflow validation

## A. Dashboard workflow

### A.1 Initial load
- [ ] Open Dashboard with no active task and verify the page renders from backend state.
- [ ] Verify camera panel/feed fallback renders correctly.
- [ ] Verify robot/system status is visible and derived from backend state.
- [ ] Verify overlays are absent when no overlay data exists.

### A.2 Active task display
- [ ] Open Dashboard with an active task and verify task summary/status is visible.
- [ ] Verify related overlays are shown on the camera view when expected.
- [ ] Verify overlay positioning matches the intended area on the frame.
- [ ] Verify task/robot status changes update live without page reload.

### A.3 State transitions
- [ ] Verify idle → queued → active → completed transitions appear correctly on Dashboard.
- [ ] Verify failure/error transitions appear clearly and do not masquerade as completed.
- [ ] Verify disconnect/reconnect states are visible and recover cleanly.

### A.4 Mock mode
- [ ] Verify Dashboard can run entirely in mock mode with valid state, camera, and overlay data.
- [ ] Verify mock mode is clearly distinguishable from live mode.
- [ ] Verify mock websocket/state updates behave the same as live from the UI’s perspective.

## B. Create Task workflow

### B.1 Entry state
- [ ] Open Create Task and verify the form initializes without relying on stale local state.
- [ ] Verify the UI clearly supports the intended inputs from the contract (prompt, upload, or both).
- [ ] Verify submission is blocked when required fields are missing.

### B.2 Prompt flow
- [ ] Submit a prompt-only task if supported.
- [ ] Verify request payload matches documented contract fields.
- [ ] Verify success response includes enough information to identify the created task.
- [ ] Verify UI transitions back to Dashboard or task view with correct state.

### B.3 Upload flow
- [ ] Submit an upload-only task if supported.
- [ ] Verify upload/request payload shape matches contract expectations.
- [ ] Verify invalid file types/sizes fail predictably.
- [ ] Verify successful upload updates task state and relevant Dashboard data.

### B.4 Combined prompt + upload flow
- [ ] Submit a task that includes both prompt and upload if supported.
- [ ] Verify backend accepts and normalizes both inputs consistently.
- [ ] Verify resulting task appears on Dashboard with the correct status and overlays.

### B.5 Submission lifecycle
- [ ] Verify loading/submitting state prevents duplicate submissions.
- [ ] Verify backend validation errors surface clearly in UI.
- [ ] Verify transport/server errors surface clearly in UI.
- [ ] Verify successful submission produces the expected websocket/state transition.

---

# 3) End-to-end regression matrix

## Core scenarios
- [ ] No task, no overlay, camera available.
- [ ] No task, camera unavailable.
- [ ] Active task with overlay and live status updates.
- [ ] Task creation success from prompt-only flow.
- [ ] Task creation success from upload flow.
- [ ] Task creation validation failure.
- [ ] Robot command success updates Dashboard state.
- [ ] Robot command failure updates Dashboard state.
- [ ] Websocket reconnect preserves correct current state.
- [ ] Mock mode mirrors live-mode contracts closely enough for frontend confidence.

## Contract regression checks
- [ ] Snapshot or schema-test canonical backend state payloads.
- [ ] Snapshot or schema-test websocket event payloads.
- [ ] Snapshot or schema-test overlay objects.
- [ ] Snapshot or schema-test camera metadata/frame descriptors.
- [ ] Snapshot or schema-test robot command request/result payloads.

---

# 4) Recommended test ownership split

## Backend/API contract tests
- [ ] State shape schema validation
- [ ] Task creation request/response validation
- [ ] Robot command request/result validation
- [ ] Error-shape validation

## Frontend integration tests
- [ ] Dashboard renders from canonical state
- [ ] Dashboard updates from websocket events
- [ ] Overlay rendering/alignment against camera view assumptions
- [ ] Create Task form submission and error handling
- [ ] Mock/live mode parity

## Manual validation / QA
- [ ] Visual overlay alignment checks
- [ ] Camera unavailable/stale feed behavior
- [ ] Live robot state transition observation
- [ ] Reconnect/resume behavior under realistic timing

---

# 5) Open items to resolve against the actual contract docs

These items must be checked against the concrete files in `docs/contracts/` before this checklist is considered locked:
- exact file names and contract ownership boundaries
- canonical endpoint names and websocket event names
- precise field names/types/enums for each payload
- whether websocket messages are full-state or delta updates
- whether overlays use pixel coordinates, normalized coordinates, or another reference frame
- exact Create Task request/response contract
- exact robot command catalog and result/error shape

Until those are confirmed, this checklist should be treated as the validation skeleton rather than the final locked test spec.
