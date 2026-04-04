# Robot Protocol Contract

## Purpose

Defines backend ↔ firmware command, acknowledgement, result, and telemetry expectations.

This document is intentionally firmware-facing: the backend may expose higher-level APIs, but the firmware/runtime contract should stay small, explicit, and stable.

## Command set

Current command names:

- `home`
- `pen_up`
- `pen_down`
- `pause`
- `stop`
- `connect_mock_bot` (backend/testing convenience for mock mode; not for real firmware transport)

## Recommended command envelope

Firmware implementation is much cleaner if every incoming command uses a common envelope:

```json
{
  "id": "cmd_123",
  "type": "home",
  "issued_at": "2026-04-02T21:00:00Z",
  "source": "backend",
  "payload": {}
}
```

Required fields:

- `id`: unique command id for correlation
- `type`: command name from the contract
- `payload`: command-specific object, possibly empty

Recommended optional fields:

- `issued_at`: backend timestamp
- `source`: backend / supervisor / test harness
- `deadline_ms`: optional operator expectation, not a hard realtime guarantee

## Required firmware responses

Each command should produce two different protocol signals when possible:

1. **acknowledgement** — firmware accepted or rejected the command
2. **result** — command later completed, failed, or was interrupted

### Command acknowledgement

```json
{
  "kind": "command_ack",
  "command_id": "cmd_123",
  "accepted": true,
  "robot_state": "homing",
  "reason": null,
  "ts": "2026-04-02T21:00:00Z"
}
```

If rejected:

```json
{
  "kind": "command_ack",
  "command_id": "cmd_123",
  "accepted": false,
  "robot_state": "fault",
  "reason": "busy_with_motion",
  "ts": "2026-04-02T21:00:00Z"
}
```

### Command result

```json
{
  "kind": "command_result",
  "command_id": "cmd_123",
  "status": "completed",
  "robot_state": "idle",
  "reason": null,
  "ts": "2026-04-02T21:00:03Z"
}
```

Allowed result statuses:

- `completed`
- `failed`
- `aborted`
- `superseded`

## Runtime state machine expectations

The firmware runtime should be implementable as a small explicit state machine.

### Recommended firmware states

- `disconnected` — transport not established
- `connecting` — transport/session is starting
- `idle` — connected, safe, not executing motion
- `homing` — moving to establish reference/home
- `ready` — homed and able to accept motion/job execution
- `executing` — active motion or drawing step in progress
- `paused` — motion intentionally paused, resumable only if supported later
- `stopping` — emergency or controlled stop in progress
- `fault` — unsafe/unknown/error condition requiring operator attention

Notes:

- `idle` vs `ready` should be distinct. Firmware often needs to represent “connected but not yet homed” separately from “motion-capable”.
- `paused` should not imply `pen_down`; pen state must be telemetered separately.
- `stop` should be modeled as a transition, not only an event.

## Minimum telemetry contract

Firmware should publish telemetry whenever state changes, and periodically while connected.

### Robot status telemetry

```json
{
  "kind": "robot_status",
  "connection_state": "connected",
  "runtime_state": "ready",
  "motion_state": "idle",
  "pen_state": "up",
  "is_homed": true,
  "active_command_id": null,
  "active_job_id": null,
  "fault_code": null,
  "fault_message": null,
  "seq": 42,
  "ts": "2026-04-02T21:00:05Z"
}
```

Recommended fields:

- `connection_state`: `disconnected` | `connecting` | `connected`
- `runtime_state`: one of the firmware states above
- `motion_state`: `idle` | `moving` | `paused` | `stopping`
- `pen_state`: `up` | `down` | `unknown`
- `is_homed`: boolean
- `active_command_id`: nullable correlation id
- `active_job_id`: nullable job/task id when executing a task
- `fault_code`: stable machine-readable error code
- `fault_message`: human-readable summary
- `seq`: monotonically increasing sequence number per session
- `ts`: firmware or backend-normalized timestamp

### Pose telemetry

If pose is available, it should be sent separately so UI/backend can consume it independently of coarse robot state:

```json
{
  "kind": "robot_pose",
  "x_mm": 120.5,
  "y_mm": 45.0,
  "z_mm": 0.0,
  "pen_state": "down",
  "feedrate_mm_s": 35.0,
  "seq": 314,
  "ts": "2026-04-02T21:00:05Z"
}
```

Pose fields should be omitted rather than faked if the firmware cannot measure them.

## Command semantics

### `home`

Expected behavior:

- allowed from `idle`, `ready`, and possibly `fault` after local recovery if implemented
- transitions runtime into `homing`
- on success sets `is_homed = true`
- on success ends in `ready`
- on failure ends in `fault` or `idle`, but must report which

### `pen_up`

Expected behavior:

- should be allowed in any non-fault connected state unless mechanically impossible
- should update `pen_state`
- if asynchronous, return ack immediately and later result

### `pen_down`

Expected behavior mirrors `pen_up`.

### `pause`

Expected behavior:

- only valid while active motion/execution is in progress
- transitions to `paused`
- must specify via telemetry whether pause is resumable or terminal for the current job

### `stop`

Expected behavior:

- can be issued from any active state except `disconnected`
- should be treated as higher priority than queued work
- should force motion toward a safe stopped condition
- final state must be reported explicitly (`idle`, `paused`, or `fault`)

### `connect_mock_bot`

This is backend/testing-only. It should not be required by real firmware.

## Implementation-critical protocol gaps

These gaps currently block a clean firmware runtime implementation and should be resolved before code hardening:

1. **No canonical command envelope**  
   Without `command_id` and a shared wrapper, firmware cannot safely ack/result commands or dedupe retries.

2. **No explicit ack/result split**  
   A physical robot needs “accepted” vs “finished” semantics. One-shot command responses are not enough.

3. **No canonical runtime state enum**  
   Firmware, backend, and UI can drift unless `idle` / `ready` / `executing` / `paused` / `fault` are defined centrally.

4. **No fault/error code contract**  
   Firmware needs machine-readable fault codes so backend/UI can react without string parsing.

5. **No sequence/correlation fields on telemetry**  
   Needed for ordering, reconnection recovery, and stale-update detection.

6. **No statement of command validity by state**  
   Backend cannot know when a rejection is expected unless allowed/disallowed state transitions are specified.

7. **No timeout / lost-command policy**  
   Need backend expectations for what happens when ack or result never arrives.

8. **No pause/stop distinction in job semantics**  
   Important for whether the backend should mark a task resumable, aborted, or failed.

## Notes

- Firmware agent should not rename commands unilaterally.
- Backend agent should treat protocol names as contract-controlled.
- SketchBot supervises protocol evolution.
