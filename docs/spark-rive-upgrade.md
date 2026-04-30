# Spark Avatar — Rive Upgrade Path

**Status today (April 2026):** Spark is rendered with a hand-tuned CSS / Framer Motion rig
([`spark-robot/index.tsx`](../apps/desktop/renderer/src/components/spark-robot/index.tsx))
with **24 named scenes** that drive Face Mode's animation states. It looks
"friendly character rig" good — round white body, glowing cyan eyes,
antenna ears, kinematic arms.

This document captures the upgrade path to **Rive** for production-grade
character animation: smooth state-machine transitions, lip sync, eye tracking,
secondary motion, and a ceiling that's basically Pixar-level if a designer
wants to push it.

The integration is already plumbed in. **Only the asset is missing.** Once a
`.riv` file lands at `public/assets/sketch-bot.riv`, swapping Face Mode to
Rive is roughly a one-line change.

---

## Why Rive (not Lottie / GIF / sprite sheet)

| Tool | State machines | Runtime control | File size | Designer ergonomics |
|------|---------------|-----------------|-----------|---------------------|
| **Rive**   | ✅ First-class | ✅ Numeric/bool/trigger inputs | ~30–80 KB per character | Excellent |
| Lottie     | ❌ Linear timelines only | Limited | ~80–200 KB | Good |
| Sprite sheet | ❌ | Manual frame swap | 1–10 MB | Poor |
| GIF/MP4    | ❌ | None  | 2–20 MB | Poor |

For a tutor character that has to *react* to message content (24+ states with
smooth blending between them), only Rive's state-machine model maps cleanly.

---

## What's already in the codebase

### 1. Runtime integration
[`apps/desktop/renderer/src/components/lesson-player/rive-bot-avatar.tsx`](../apps/desktop/renderer/src/components/lesson-player/rive-bot-avatar.tsx)

```tsx
const RIVE_FILE_PATH = '/assets/sketch-bot.riv';
const STATE_MACHINE_NAME = 'BotEmotions';
const EMOTION_INPUT_NAME = 'emotion';
```

`<RiveBotAvatar emotion="celebrating" />` is a working component that:
- Lazy-loads `@rive-app/react-canvas` (already in `package.json`)
- Falls back to `null` if Rive fails to load (caller renders the emoji avatar)
- Drives a `Number` input on the state machine to switch states

Currently used by the lesson player with 6 emotions
(`idle / curious / excited / thinking / celebrating / encouraging`).

### 2. The 24-scene contract Face Mode expects
Defined in [`spark-robot/index.tsx`](../apps/desktop/renderer/src/components/spark-robot/index.tsx)
as `SPARK_SCENES`:

```ts
export const SPARK_SCENES = {
  WAVE: 0, GUIDE: 1, CELEBRATE: 2, ADAPT: 3,
  IDLE: 4, LISTENING: 5, THINKING: 6, TALKING: 7,
  EXPLAINING: 8, QUESTIONING: 9, ENCOURAGING: 10, NODDING: 11,
  CLAPPING: 12, CHEERING: 13, POINT_LEFT: 14, POINT_RIGHT: 15,
  POINT_DOWN: 16, POINT_UP: 17, SURPRISED: 18, CONFUSED: 19,
  SHRUG: 20, AHA: 21, EMPHASIZING: 22, SAD: 23,
};
```

Face Mode classifies each tutor message → one of these IDs and passes
`scene={N}` to the renderer. **The Rive file should expose the same 24 IDs as
state-machine inputs** so the swap is mechanical.

---

## What the designer needs to deliver

### Asset
A single file: **`sketch-bot.riv`** (placed at `public/assets/sketch-bot.riv`)

### Visual reference
The current CSS rig — same proportions, same palette:
- Round white head + body (slightly oversized head)
- Big glowing **cyan/blue eyes** (#5de4ff)
- **Antenna ears** with small pulsing dots
- Subtle visor/mouth area below the eyes
- Soft glow / specular highlights in white
- Particle accents (cyan, purple #a855f7, sometimes amber #ffc96b)

A reference render is in `apps/desktop/renderer/src/components/spark-robot/index.tsx`
(the live CSS rig itself).

### State machine
Name: **`BotEmotions`** (matches the existing constant)

Inputs:
- `emotion` — Number (0–23). Drives state selection. Mapping in `SPARK_SCENES`
  above.
- `talking` — Boolean (optional, v2). When true, layered mouth animation plays
  on top of the current emotion. Lets us trigger lip-sync independently of
  the base pose.
- `tts_amplitude` — Number 0–1 (optional, v3). Real-time mouth opening driven
  by TTS audio amplitude — read from the `<audio>` element's analyzer node.

States (24, one per `emotion` value):

| ID | Name | Mood / motion sketch |
|----|------|----------------------|
| 0  | Wave | Greeting, left arm waves big |
| 1  | Guide | Right arm points off-screen, head pans |
| 2  | Celebrate | Both arms fist-pump, eyes happy arcs |
| 3  | Adapt / Thumbs-up | Right arm bent, thumbs-up pose |
| 4  | Idle | Gentle breathing bob, occasional blink |
| 5  | Listening | Slight forward lean, ear-twitch |
| 6  | Thinking | Right hand to chin, head tilt, thought-bubble accent |
| 7  | Talking | Mouth/eye animation, mild gestures, head bob |
| 8  | Explaining | Both hands gesture, head pans |
| 9  | Questioning | One finger up, head tilt, '?' particle |
| 10 | Encouraging | Both arms forward (welcoming), warm glow |
| 11 | Nodding | Head pitches forward = yes |
| 12 | Clapping | Hands clap up and down, fast |
| 13 | Cheering | Both arms up, vertical bouncing |
| 14 | Point Left | Left arm extended sideways, head looks left |
| 15 | Point Right | Right arm extended sideways, head looks right |
| 16 | Point Down | Right arm down + index finger, head down |
| 17 | Point Up | One arm straight up, head up |
| 18 | Surprised | Arms flung up, eyes wide, jolt back |
| 19 | Confused | Hand on head, head tilts sideways |
| 20 | Shrug | Both arms up palms out, slight side tilt |
| 21 | Aha! | Lightbulb above head, brief arms-up jolt |
| 22 | Emphasizing | Karate-chop motion, both hands |
| 23 | Sad / Sympathetic | Head down, slumped, gentle |

### Transitions
- **Default state** is Idle (4). All other states transition back to Idle when
  `emotion` returns to 4.
- Use **Rive's "Any State"** so the rig can interrupt mid-animation when the
  user changes context fast (e.g. mid-celebration → asked a question).
- Blend duration: ~150 ms feels natural for most transitions; 300 ms for
  bigger pose shifts (idle → cheering).
- Some states are looping (idle, listening, talking, sad), others are
  oneshots that should play through and return (clapping, aha, surprised).
  Use `Loop` vs `OneShot` per state.

---

## Swapping Face Mode to Rive (when asset is ready)

Three steps, ~10 lines of code:

### 1. Drop the asset
```
public/assets/sketch-bot.riv
```

### 2. Update `RiveBotAvatar`'s emotion map
[`rive-bot-avatar.tsx`](../apps/desktop/renderer/src/components/lesson-player/rive-bot-avatar.tsx)
currently has only 6 emotions. Replace with the full 24:

```ts
const EMOTION_TO_NUMBER: Record<SparkSceneName, number> = {
  WAVE: 0, GUIDE: 1, CELEBRATE: 2, ADAPT: 3,
  IDLE: 4, LISTENING: 5, THINKING: 6, TALKING: 7,
  /* …all 24… */
};
```

### 3. Swap the renderer in Face Mode
[`tutor-face-mode.tsx`](../apps/desktop/renderer/src/components/tutor-face-mode.tsx):

```diff
- import { SparkRobot, SPARK_SCENES } from '@/components/spark-robot';
+ import { SparkRobot, SPARK_SCENES } from '@/components/spark-robot';
+ import { RiveBotAvatar } from '@/components/lesson-player/rive-bot-avatar';

  // …in the JSX where <SparkRobot mode="3d" scene={scene} /> is rendered:
- <SparkRobot mode="3d" size="xl" scene={scene} … />
+ <RiveBotAvatar emotion={scene} size={360} />
```

(Keep `<SparkRobot>` as the fallback when Rive isn't loaded — it already
returns `null` so the branch is `useRive ? <RiveBotAvatar/> : <SparkRobot/>`.)

That's it.

---

## v2 / v3 nice-to-haves

### TTS-driven lip sync (v2)
The desktop app already plays tutor speech via ElevenLabs / OpenAI TTS in
[`tutor-panel.tsx`](../apps/desktop/renderer/src/components/tutor-panel.tsx).
Adding lip sync:

1. In Face Mode, attach an `AnalyserNode` to the `<audio>` playback element
   already used by `useTutorTTS`.
2. Sample `getByteFrequencyData()` at ~20 Hz; compute amplitude in the
   speech band (200–4000 Hz).
3. Pass the normalised value to the Rive `tts_amplitude` input each frame.

Rive's mouth animation should then track audio amplitude → realistic
talking. ~1 day of work once the Rive file exposes the input.

### Per-personality variants (v3)
The current persona system has explorer / builder / engineer ages. A
single Rive file can host multiple **artboards** (one per persona) sharing
the same state machine name — letting Spark visually shift maturity with
the student's age group without code changes.

### Layered animation (v3)
Rive supports layered state machines. Suggestion:
- **Layer 0:** Body pose (24 emotions)
- **Layer 1:** Eyes (open / wide / closed / wink-l / wink-r / sleepy)
- **Layer 2:** Mouth (closed / smile / open / frown / talking)
- **Layer 3:** Hands (idle / pointing / chin / clapping)

Each layer driven independently by a different state-machine input, so the
runtime can compose nuanced expressions (e.g. *thinking pose* with *winking
eye* + *closed mouth*) from a small number of base assets.

---

## Cost / timeline expectations

| Phase | Effort | Outcome |
|-------|--------|---------|
| **Asset only** (24 states, single artboard, no lip sync) | 1–2 weeks for an experienced Rive designer | Drop-in replacement for the CSS rig. Already-perfect transitions. |
| **+ TTS lip sync** | +2–3 days (designer) + 1 day (engineering) | Mouth tracks Spark's voice realistically. |
| **+ Persona variants** | +1 week per extra artboard | Spark looks younger / older with age group. |
| **+ Layered states** | +1 week | Composable expressions, much wider character range. |

Recommended: ship the **24-state single-artboard** version first. Everything
else is additive.

---

## Where to find a Rive designer

- **Rive Community** marketplace ([rive.app/community](https://rive.app/community)) — many free character rigs adaptable for ~$200–500 of customisation work
- **Dribbble / ArtStation** — search "rive animator" or "rive character"
- **Upwork / Toptal** — Rive specialists in the $50–120/hr range
- **In-house** — if a teammate is comfortable in After Effects + Figma,
  the Rive learning curve is ~2 weekends

## Files involved in this upgrade

- `public/assets/sketch-bot.riv` *(asset to deliver)*
- `apps/desktop/renderer/src/components/lesson-player/rive-bot-avatar.tsx`
  *(extend `EMOTION_TO_NUMBER` to 24 states)*
- `apps/desktop/renderer/src/components/tutor-face-mode.tsx`
  *(swap `<SparkRobot>` → `<RiveBotAvatar>` with `<SparkRobot>` fallback)*
- `apps/desktop/renderer/src/components/spark-robot/index.tsx`
  *(stays as the fallback — no changes needed)*
