# Classroom sessions vs personal learning: product plan

This document captures a detailed plan for splitting **personal account** behavior (long-lived learner identity, progress, and sync) from **classroom / live session** behavior (teacher-led, join-code access, shared devices, aggregated outcomes). It aligns with the state-machine sources in `docs/diagrams/`.

## Diagrams and FigJam

FigJam (and Figma) store designs in proprietary **`.fig`** binaries; they cannot be authored meaningfully as plain text in the repo. What is checked in instead:

| Artifact | Path | Purpose |
|----------|------|---------|
| Editable flow (diagrams.net / draw.io) | `docs/diagrams/classroom-session-state-machine.drawio` | Open in [diagrams.net](https://app.diagrams.net/) (File → Open). Copy shapes into FigJam, or export **PNG/SVG** and paste into a FigJam board. |
| Teacher session FSM (Mermaid) | `docs/diagrams/classroom-session-teacher-fsm.mmd` | Paste into [mermaid.live](https://mermaid.live) for a clean image to paste into FigJam. |
| Student participation FSM (Mermaid) | `docs/diagrams/classroom-session-student-fsm.mmd` | Same as above. |

**Suggested FigJam board layout:** one swimlane for **Teacher / server (ClassroomSession)**, one for **Student client (SessionParticipation)**, and a short third strip for **data ownership** (what lives on the teacher account vs device-local vs optional personal account).

---

## Problem framing

- **Personal mode:** A learner uses the product over time on their own devices; progress and preferences should **persist and sync** to their account.
- **Classroom mode:** A **teacher** runs a **bounded live session** tied to a lesson plan. Students often use **shared lab machines**; they join with a **short-lived join code** on the **same network** while the teacher **keeps the session alive**. At the end, **session-level stats and progress** should **aggregate and attach to the teacher’s workspace** (and optionally be exportable), without assuming every student has a full personal account on that device.

The core design choice is to treat the classroom as a **session-scoped overlay** on top of shared lesson/content infrastructure, not as a second copy of the entire personal product.

---

## Concepts and roles

### Personal account (learner)

- **Identity:** Stable user id, authentication, profile.
- **Data:** Learning path progress, robot/customization choices, history, sync timestamps.
- **Lifetime:** Long-lived; survives across devices when the user signs in.

### Teacher account

- **Identity:** Authenticated educator (and optional org/school linkage later).
- **Data:** Created lesson plans, session history, **aggregated session outcomes** (per session and rolled up), roster metadata allowed by policy.
- **Authority:** Creates and **ends** the live session; owns the **aggregation sink** for that session.

### Classroom session (server-side entity)

- **Session id:** Opaque identifier; never reuse join codes as the only secret.
- **Join code:** Human-enterable, **rate-limited**, **TTL-bound**, invalid when the session is not `Live` (or not accepting joins).
- **Teacher heartbeat / presence:** Session remains **viable** while teacher is connected under policy (or explicit “run unattended” exception if you add it later).
- **Network policy:** “Same network” can be enforced with IP/geohints, mDNS, or institutional SSO; start strict, relax deliberately.

### Student participation (often session-scoped)

- **Minimum viable:** Pseudonymous or display-name only, **device-bound session token**, progress events attributed to **seat/session** until the session ends.
- **Optional enhancement:** Student signs in with a personal account mid-session or after; you **merge** session events into their personal history with explicit consent and conflict rules.

---

## Data ownership and sync boundaries

| Data | Personal mode | Classroom mode (during session) | After session ends |
|------|----------------|----------------------------------|---------------------|
| Lesson content | Account or catalog | Selected by teacher for session | Same; session records reference content revision ids |
| Per-step progress | User-owned | **Session buffer** + ephemeral UI state | **Aggregated** to teacher-owned session record; optional push to student personal if linked |
| Robot / avatar prefs | User-owned | Optional local only, or session default | Teacher dashboard may store “class snapshot” only if policy allows |
| Join code | N/A | Short-lived, teacher-visible | Invalid; audit log may store code *hash* only |
| Telemetry / errors | User support context | Session-scoped logs | Redacted aggregates for teacher; retention policy |

**Sync rule of thumb:** Personal sync is **continuous and user-driven**. Classroom sync is **batch-oriented at boundaries** (event stream during session, **commit at `Closed → Aggregating → SyncedToTeacher`**), so shared machines do not need persistent student credentials.

---

## Teacher session state machine (`ClassroomSession`)

Source: `docs/diagrams/classroom-session-teacher-fsm.mmd` and the top row in `classroom-session-state-machine.drawio`.

### States

| State | Meaning |
|-------|---------|
| **Drafted** | Lesson attached, session not yet started; no join surface (or preview only). |
| **Live** | Join code active (subject to TTL); students may join if policy passes. |
| **Locked** | Optional: existing participants continue; **new joins blocked** (exam mode, “eyes up” moment). |
| **Closing** | Teacher ended; server stops new work, **drains** uploads and buffered events. |
| **Closed** | Immutable session boundary on the wire; ready for aggregation. |
| **Aggregating** | Compute roster stats, merge duplicates, apply redaction. |
| **SyncedToTeacher** | Durable teacher-owned record; session archived for dashboard/export. |
| **SyncFailed** | Retry path; surface to teacher if policy requires manual resolution. |

### Transitions (teacher / server)

| From | Event / guard | To |
|------|----------------|-----|
| Drafted | `start_session` (issue code, set TTL, bind teacher channel) | Live |
| Live | `lock_joins` | Locked |
| Locked | `unlock_joins` | Live |
| Live / Locked | `end_session` | Closing |
| Closing | `drain_complete` (buffers flushed, deadlines met) | Closed |
| Closed | `begin_aggregate` | Aggregating |
| Aggregating | `persist_roster_stats` success | SyncedToTeacher |
| Aggregating | `persist_error` | SyncFailed |
| SyncFailed | `retry_policy` | Aggregating |

---

## Student participation state machine (`SessionParticipation`)

Source: `docs/diagrams/classroom-session-student-fsm.mmd` and the bottom row in `classroom-session-state-machine.drawio`.

### States

| State | Meaning |
|-------|---------|
| **Idle** | UI waiting for code; no session token. |
| **ValidatingCode** | Client/server check code + network policy + session `Live`. |
| **Joined** | Roster slot reserved; may wait for teacher start signal. |
| **Active** | Lesson interactions allowed; events streamed to session buffer. |
| **Disconnected** | Transport lost; **reconnect window** applies. |
| **Left** | Terminal; seat released or marked inactive for aggregation. |

### Transitions (student client)

| From | Event / guard | To |
|------|----------------|-----|
| Idle | `enter_code` | ValidatingCode |
| ValidatingCode | `code_ok` | Joined |
| ValidatingCode | `code_invalid` | Idle |
| Joined | `lesson_ack` (or teacher start) | Active |
| Active | `transport_lost` | Disconnected |
| Disconnected | `reconnect_in_window` | Active |
| Disconnected | `ttl_expired` | Left |
| Active | `leave_or_kick` | Left |
| Joined | `leave_before_start` | Left |

---

## Cross-cutting behaviors

### Session liveness

- If the **teacher disconnects**, choose an explicit policy: **pause** joins, **auto-end** after grace, or **promote co-host** (future). Document the default in product copy and telemetry.

### Abuse and misuse of join codes

- Rate-limit validation attempts per IP/device.
- Rotate or shorten TTL on suspicious patterns.
- Prefer **hashed** audit storage for codes in logs.

### Privacy and compliance (high level)

- Classroom flows often implicate **school obligations** (e.g., FERPA in the US): minimize **directory information** in dashboards, support **district retention** settings, and separate **teacher-facing aggregates** from **marketing** uses.
- If students can link personal accounts, require **clear consent** and show **what merges**.

### Optional later: class or org entity

- A **Class** record can own recurring rosters and default policies; **Sessions** remain instances under that class. This does not change the session FSM; it adds **defaults and reporting** scope.

---

## Implementation notes (non-binding)

- Model **session events** as an append-only stream keyed by `session_id`, with idempotent client event ids for reconnect.
- Separate **transport state** from **lesson task state** (see `docs/contracts/state-model.md` for the general pattern) so UI does not collapse “disconnected” into “lost progress” incorrectly.
- Personal account sync can reuse your existing backend; classroom aggregation should be a **distinct pipeline** with explicit **commit points** at `Closed` / `Aggregating`.

---

## File index

- `docs/diagrams/classroom-session-state-machine.drawio` — dual FSM for FigJam reference / diagrams.net.
- `docs/diagrams/classroom-session-teacher-fsm.mmd` — teacher/server Mermaid.
- `docs/diagrams/classroom-session-student-fsm.mmd` — student client Mermaid.
- This document — full product plan and transition tables.
