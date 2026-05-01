# Privacy posture — agentic tutor observe loop

**Owner:** Ahmad / SaySpark
**Last reviewed:** 2026-04-30
**Code references:** [`spark-context.ts`](../apps/desktop/renderer/src/lib/spark-context.ts), [`use-spark-tick.ts`](../apps/desktop/renderer/src/lib/use-spark-tick.ts), [`tutor_service.observe`](../services/local-runtime/app/services/tutor_service.py)

This doc covers the data-handling posture for the *situational-awareness*
context payload introduced with the agentic tutor loop. It's the basis for
parent-facing privacy disclosures and a checklist for any future audit.

## What is collected per tutor observation tick

Every ~30 seconds (adaptive — see `use-spark-tick.ts`), if the user has been
active, the renderer assembles a context payload and posts it to
`/api/tutor/observe`. The payload contains:

- **Identity.** Child's first name + age group (`explorer` / `builder` /
  `engineer`). No last names, no addresses, no email addresses, no birthdates.
- **Session metadata.** Mode (`sandbox` or `concept`), active concept id +
  layer if applicable, session duration in seconds.
- **Scene state.** Up to 30 recent SceneObjects from the canvas, each
  represented as `{ type, x, y, z, rotation }` in metres. Raw positions —
  no images, no rendered screenshots.
- **Recent activity.** Up to 15 recent in-app actions with relative
  timestamps (e.g., "12s ago: placed cone").
- **Streaks.** Counts of consecutive failures or successes from the current
  session. No identifiers tied to past sessions.

Trigger-driven calls (`/api/tutor/message` for greetings, hints, evaluations)
include the same payload as part of an *uncached* system block.

## What is **not** collected

- No screenshots or rendered images of the canvas
- No video, audio, or voice recordings beyond what the existing TTS / STT
  flows already use (those are governed separately)
- No persistent identifiers tied to advertising or tracking networks
- No chat content beyond the cached message thread already used by the
  existing tutor flow
- No data tied to any third-party analytics or marketing service

## Where the data goes

1. Renderer (Electron desktop app) → cloud backend over HTTPS.
2. Cloud backend → Anthropic API for inference.
3. Anthropic returns the `{ speak, message }` judgment.
4. Backend returns to the renderer.

**No server-side persistence of context payloads.** The cloud backend
processes the payload for the single tutor turn and discards it. There is no
log, database write, or file write of the payload contents. The only thing
persisted server-side is aggregate telemetry counters (e.g., "tutor was
invoked", no payload content). See *Telemetry* below.

## Anthropic data handling

- Inference is via the standard Anthropic API. Inputs and outputs are
  governed by [Anthropic's commercial terms and privacy policy](https://www.anthropic.com/legal/privacy).
- For production rollout to children, SaySpark **should** be on Anthropic's
  Zero Data Retention (ZDR) agreement, which is configured at the
  organisation level (not a per-request header). The code comment at
  `tutor_service.observe` tracks this as a follow-up.
- Until ZDR is in place, Anthropic may temporarily retain prompts/responses
  for abuse detection (per their standard terms). They do not train on
  customer data.

## Compliance posture

- **PIPEDA (Canada).** Personal information is limited to first name + age
  range, both collected with parental consent at signup. Behavioural data
  (canvas positions, in-app actions) is not personally identifying on its
  own and is processed only for the purpose of delivering the tutoring
  service the family signed up for. Right of access, correction, and
  deletion are exercised through the existing parent dashboard / "delete
  data" flow on `sayspark.ca`.
- **COPPA (US).** Same data minimisation applies. Parental consent is
  obtained at account creation. No advertising, no third-party data sharing,
  no behavioural targeting.
- **GDPR (EU).** Out of scope for v1 launch (Canada / US only). Add an
  EU-specific posture before any EU rollout.

## Operational controls

- **Hard rate limit.** The renderer's tick scheduler will not call
  `/api/tutor/observe` more often than once per 10 seconds, enforced
  client-side (`use-spark-tick.ts` constant `RATE_LIMIT_MS`).
- **Idle skip.** If the child has not interacted for >2 minutes, ticks
  are skipped entirely — no payload is built, no API call is made.
- **Bounded payload.** Hard caps in `spark-context.ts`:
  `MAX_OBJECTS_IN_CONTEXT = 30`, `MAX_EVENTS_IN_CONTEXT = 15`.
- **Most ticks are silent.** Target: ~1 in 5 ticks results in an audible /
  visible Spark utterance. The other 4 are billed against the API but
  produce no user-facing artefact and no log entry.

## Telemetry we do keep

Aggregate counters only, no payload contents:

- `tutor_observe_total` — number of `/observe` calls
- `tutor_observe_spoken_total` — number that returned `speak: true`
- `tutor_observe_silent_total` — number that returned `speak: false`
- `tutor_observe_error_total` — failed calls (network / parse)

These exist for cost monitoring and quality-of-service tracking only. They
are not tied to a child identifier.

## Parent-facing privacy update

The privacy policy on `sayspark.ca` should be updated to mention:

1. The agentic tutor periodically observes session activity to provide
   contextual coaching.
2. Behavioural data (canvas positions, recent actions) is sent to Anthropic
   for inference only and is not stored server-side beyond aggregate counters.
3. Parents can disable the agentic tutor at any time. The toggle is in the
   account panel (top-right avatar → "Spark observes & coaches"). When off,
   no `/api/tutor/observe` calls are made.
4. Right to delete: parents can clear all data at any time via the existing
   "delete account" flow.

## Re-evaluation triggers

Revisit this doc when any of the following change:

- New PII added to the payload (e.g., last name, address, email)
- Server-side persistence of payloads is introduced
- A new third-party service receives the payload
- The audience expands to EU students (GDPR)
- The product ships to a customer with a contractual data-handling clause
  (district, school board) that requires stricter controls
