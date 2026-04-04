# State Model Contract

## Purpose

Defines shared conceptual state between frontend, backend, and supervisory workflow.

For firmware integration, this contract must separate:

- transport connection state
- robot runtime state
- workflow/task state
- UI/operator presentation state

Those layers should not be collapsed into a single status string.

## Major state areas

- robot connection / robot status
- workflow state
- camera state
- overlay state
- canvas state
- robot pose
- active job
- operator summary
- recent events

## Canonical top-level model

Recommended canonical state shape:

```json
{
  "robot": {
    "connection_state": "connected",
    "runtime_state": "ready",
    "motion_state": "idle",
    "pen_state": "up",
    "is_homed": true,
    "pose": {
      "x_mm": 0,
      "y_mm": 0,
      "z_mm": 0
    },
    "active_command_id": null,
    "fault": null,
    "last_telemetry_ts": "2026-04-02T21:00:05Z"
  },
  "workflow": {
    "task_state": "ready",
    "active_job_id": null,
    "is_mock_mode": false
  },
  "camera": {
    "state": "live",
    "last_frame_ts": "2026-04-02T21:00:05Z"
  },
  "overlay": {
    "visible": true,
    "source_task_state": "ready"
  },
  "operator": {
    "mock_mode": false,
    "connection_mode": "hardware"
  },
  "recent_events": []
}
```

## State domains

### `robot.connection_state`

Transport/session health only:

- `disconnected`
- `connecting`
- `connected`

### `robot.runtime_state`

Firmware execution state:

- `idle`
- `homing`
- `ready`
- `executing`
- `paused`
- `stopping`
- `fault`

### `robot.motion_state`

Optional but useful derived motion detail:

- `idle`
- `moving`
- `paused`
- `stopping`

### `workflow.task_state`

Supervisory/app task lifecycle, not firmware state:

- `draft`
- `planned`
- `ready`
- `running`
- `paused`
- `completed`
- `failed`
- `aborted`

Important rule:

- `workflow.task_state` and `robot.runtime_state` are related but not interchangeable.
- Example: a task may be `ready` while the robot is still `idle` and not yet homed.

## Mock mode

Mock mode is explicit.
A mock bot may still be connected while remaining in mock mode.
`operator.mock_mode` and `operator.connection_mode` are authoritative for this distinction.

Additional rule:

- mock mode must never be inferred solely from `robot.connection_state`
- firmware telemetry should not overwrite operator-selected mock mode

## Dashboard rule

When a task is ready (`draft`, `planned`, or `ready`), overlay should appear on the dashboard camera feed.

Refined interpretation:

- overlay visibility is driven by workflow/task readiness, not by firmware execution state alone
- loss of robot connectivity should not silently clear a ready overlay unless the task itself is invalidated

## Firmware-facing state rules

1. `robot.is_homed = true` is required before `robot.runtime_state = ready`
2. `robot.runtime_state = fault` should always carry a non-null `robot.fault` object when available
3. `robot.active_command_id` should reflect the currently executing command, not the last completed one
4. `workflow.active_job_id` may be non-null while `robot.runtime_state` is `paused`
5. `robot.pose` may be partial/unknown, but unknown values must be explicit rather than fabricated

## Recommended fault object

```json
{
  "code": "limit_switch_timeout",
  "message": "Homing did not complete before timeout",
  "recoverable": true,
  "since": "2026-04-02T21:00:03Z"
}
```

## Implementation-critical state-model gaps

These gaps still need explicit agreement across backend/UI/firmware:

1. **Authoritative state writer during reconnects**  
   Need a rule for whether backend caches last robot state, waits for a fresh firmware snapshot, or marks fields stale.

2. **Fresh snapshot vs incremental events**  
   Firmware implementation is cleaner if reconnect starts with a full state snapshot followed by deltas/events.

3. **Staleness semantics**  
   Need UI/backend behavior when `last_telemetry_ts` ages out but transport is technically still connected.

4. **Job ownership boundary**  
   Need a crisp decision on whether firmware only executes primitive commands or also owns job/chunk progress reporting.

5. **Pause/abort mapping between workflow and runtime**  
   Current docs do not define whether `stop` implies `workflow.task_state = aborted` or `failed`.
