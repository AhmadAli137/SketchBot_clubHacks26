# Initial Multi-Agent Implementation Roadmap

## Synthesis of worker plans

All workers converged on the same priority:

1. lock the missing contracts
2. build implementation against those contracts
3. validate behavior with tests/regression checks

## Priority 1 — Contract locking

Must define clearly:
- canonical backend state shape
- websocket event/update shape
- overlay object schema
- camera feed/frame semantics
- robot command request/result shape

This is the key blocker for clean multi-agent parallelism.

## Priority 2 — Backend as source of truth

Backend should formalize:
- normalized state model
- overlay object model
- camera feed metadata model
- upload flow model
- robot command model cleanup

## Priority 3 — Webapp against contract

Webapp should then implement:
- state store based on canonical state + websocket
- Dashboard using camera + overlay contract
- Create Task flow using prompt/upload contracts
- explicit mock/live behavior in UI

## Priority 4 — Firmware alignment

Firmware should align its runtime/state-machine and telemetry assumptions with:
- robot command contract
- telemetry/state model expectations
- safety and state transition model

## Priority 5 — Test coverage

Test bot should validate:
- prompt → task flow
- dashboard overlay visibility
- mock mode correctness
- backend route/schema compliance
- robot command regressions

## First implementation task set

### Backend worker
Draft and/or implement the contract documents for:
- backend state shape
- websocket state event shape
- overlay schema
- camera feed/frame contract
- robot command request/result contract

### Webapp worker
Using current contracts and roadmap, prepare a concrete frontend integration plan tied to:
- Dashboard data flow
- Create Task data flow
- overlay rendering dependencies
- camera feed consumption assumptions
No contract invention.

### Firmware worker
Refine firmware runtime/state-machine expectations against the current robot protocol and identify any protocol gaps that block implementation.

#### Refined firmware runtime plan

Recommended implementation order:

1. **Transport/session layer**
   - connect/disconnect lifecycle
   - heartbeat or periodic status publication
   - initial full status snapshot on connect
   - command envelope parsing and validation

2. **Command dispatcher**
   - validate command by current runtime state
   - emit `command_ack` immediately
   - bind `active_command_id`
   - route into motion/servo primitives

3. **Explicit runtime state machine**
   - states: `idle`, `homing`, `ready`, `executing`, `paused`, `stopping`, `fault`
   - all transitions publish `robot_status`
   - `stop` preempts queued/non-critical work

4. **Telemetry layer**
   - coarse `robot_status` on every state change
   - periodic `robot_status` heartbeat while connected
   - separate `robot_pose` stream if pose exists
   - stable fault object/code reporting

5. **Recovery rules**
   - reconnect should publish a fresh snapshot before accepting new commands
   - incomplete prior commands should resolve as `aborted` or `superseded`, never remain ambiguous
   - backend must be able to detect stale telemetry through timestamps/sequence numbers

#### Current blockers for clean firmware implementation

- no canonical command envelope with correlation id
- no required split between command ack and final result
- no shared runtime-state enum across backend/UI/firmware
- no fault code taxonomy
- no defined reconnect snapshot policy
- no explicit stop/pause semantics for workflow/job state

### Test worker
Turn the testing plan into an actionable validation checklist mapped to the above contracts and flows.
