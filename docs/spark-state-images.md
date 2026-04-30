# Spark State Images — Generation Spec

This is the spec for the **24 polished pre-rendered illustrations** that
power Spark's Face Mode in the desktop app. One image per conversational
state, all sharing a single character design and lighting style so the set
feels unified.

When all 24 PNGs land at `apps/desktop/renderer/public/assets/spark-states/`,
the [`<SparkStateImage>`](../apps/desktop/renderer/src/components/spark-state-image.tsx)
component picks them up automatically and Face Mode shows the polished art
instead of the CSS-rig fallback.

---

## Character — keep this consistent across every image

> **A small, friendly white robot with rounded shapes, glowing cyan-blue
> eyes, two short antennae with little glowing dots, soft pearl-white
> matte body, subtle blue rim light, gentle drop shadow on a dark
> empty floor. Three-quarter view, slight upward camera tilt for a
> "look up to" feeling. Big chest core that softly glows cyan. The
> overall vibe is "Pixar-meets-Disney robot mascot" — warm, simple,
> approachable. Soft studio lighting with a hint of purple/cyan rim
> light. Background fades to deep navy/black. No text, no logo,
> no watermark.**

Reuse this paragraph as the **prefix** of every per-state prompt below.

### Style guards (include in every prompt)
- *Character only — no background scene props beyond particles.*
- *Transparent background, PNG.*
- *Center-framed, robot ~70% of canvas height, full body visible.*
- *Same character design as previous images in the set — consistent
  proportions, same eye color, same chest core position.*

### Negative prompt (if your tool supports it)
> text, logo, watermark, jpeg artifacts, multiple robots, weapons,
> realistic human, photorealism, low-quality, deformed limbs,
> extra fingers, cluttered background

### Output spec
| Field | Value |
|---|---|
| Format | PNG (RGBA, transparent background) |
| Resolution | 1024 × 1024 |
| Aspect | 1:1 square |
| Robot height | ~70% of canvas |
| Framing | Full body visible, slight bottom padding for the shadow |
| Color profile | sRGB |
| File name | `{slug}.png` (table below) |
| Path | `apps/desktop/renderer/public/assets/spark-states/` |

After generating, you can convert PNG → WebP for a ~50% size win:
```sh
cwebp -q 85 wave.png -o wave.webp
```
(then update `IMAGE_EXT` in `spark-state-image.tsx` to `'webp'`).

---

## The 24 states

Each row: file name, what Spark is feeling/doing, and the *suffix* to append
to the character paragraph above. The full prompt is `{character}` +
`{suffix}` + `{style guards}`.

### 0–3: Hero scenes (existing)

| File | When it shows | Pose suffix |
|------|---------------|-------------|
| `wave.png` | Greeting, first message of a session | *Both arms raised, left arm waving energetically beside the head, eyes happy and round, smiling crescent mouth, tiny sparkles around the head, head slightly tilted in a friendly way.* |
| `guide.png` | "Let's…", "try…", "imagine…" | *Right arm extended out pointing forward and slightly down, left hand on hip, head turned in the direction of the point, focused encouraging expression, a small floating compass-like sparkle near the pointing finger.* |
| `celebrate.png` | "Great!", "awesome", "excellent" | *Both arms raised in a victory pose, mouth open in cheer, eyes squeezed into happy crescents, body leaning slightly forward, golden confetti particles around the head, a small floating star above.* |
| `adapt.png` | "Yes", "you got it", "exactly" | *Right arm bent up giving a clear thumbs-up, left arm relaxed at side, eyes smiling, mouth in a warm grin, slight side-tilt of the body for personality, a tiny lightning bolt near the thumb.* |

### 4–7: Default + listening

| File | When it shows | Pose suffix |
|------|---------------|-------------|
| `idle.png` | Default neutral state, no message | *Standing relaxed, both arms hanging gently at sides, head perfectly upright, eyes calm and round, soft neutral expression, tiny breath-like motion implied — a calm "ready" pose.* |
| `listening.png` | User is typing/speaking | *Leaning slightly forward, both hands clasped politely in front of body, head tilted down slightly toward the viewer, big attentive eyes, ear-antennae glowing a touch brighter, small sound-wave ripples emanating from the side of the head.* |
| `thinking.png` | Streaming a complex reply, "let me think" | *Right hand brought up to the side of the head as if scratching its chin, head tilted up and to the side, eyes looking up-left in contemplation, a small floating thought-bubble cloud above the head.* |
| `talking.png` | Mid-stream of a normal response | *Both hands gesturing in a "explaining" position about chest-height, mouth slightly open in mid-speech, eyes engaged and warm, head turned slightly toward viewer, small motion lines suggesting movement.* |

### 8–11: Explaining + agreement

| File | When it shows | Pose suffix |
|------|---------------|-------------|
| `explaining.png` | "Here's how…", "step 1…", structured teaching | *Both arms held wide apart in an open "presenting" gesture, palms slightly forward, head looking directly at viewer with confident smile, a few floating geometry particles (triangle, circle, square) suggesting ideas around the figure.* |
| `questioning.png` | Spark is asking the user a question back | *Right index finger held up beside the head as if asking, head tilted to the right with curious eyes, mouth in a gentle "hmm" shape, a small floating question mark just above the antenna.* |
| `encouraging.png` | "You can do this", "don't give up" | *Both arms held out forward and slightly up, palms open in an inviting/welcoming gesture, head tilted warmly, big kind eyes with happy crescents, a soft heart-shaped glow at the chest core.* |
| `nodding.png` | "Yes", "exactly right", "correct" | *Head pitched forward in mid-nod, both eyes squeezed into happy crescents, slight forward body lean, both hands held loosely at sides palms forward, a small green checkmark floating beside the head.* |

### 12–13: Big positive reactions

| File | When it shows | Pose suffix |
|------|---------------|-------------|
| `clapping.png` | "Well done!", "nailed it" | *Both hands meeting in a clap in front of the chest, mouth open in a delighted laugh, eyes squeezed shut into happy lines, body bouncing slightly, motion blur on the hands, a few "👏"-style impact lines around the hands.* |
| `cheering.png` | "Amazing!", "incredible!" | *Both arms thrown up overhead in unrestrained joy, body leaping mid-air with feet off the ground, mouth wide in an open happy yell, big sparkle starburst around the entire figure, multicolor confetti raining down (cyan, pink, gold, purple).* |

### 14–17: Pointing in directions

| File | When it shows | Pose suffix |
|------|---------------|-------------|
| `point-left.png` | "Look on your left…" | *Left arm fully extended out to the figure's left (viewer's right), index finger pointing, head turned to look that direction, eyes focused that way, right arm relaxed, slight forward lean.* |
| `point-right.png` | "On the right…" | *Right arm fully extended out to the figure's right (viewer's left), index finger pointing, head turned that direction, eyes focused that way, left arm relaxed, slight forward lean.* |
| `point-down.png` | "Down here in the sandbox" | *Right arm extended down and forward, index finger pointing toward the floor in front of the figure, head tilted down to look at the same spot, focused expression.* |
| `point-up.png` | "Up there", "look above" | *Right arm extended straight up overhead, index finger pointing skyward, head tilted up to look at the same spot, eyes wide in amazement, mouth slightly open in awe, a small floating star above the finger.* |

### 18–21: Reactions

| File | When it shows | Pose suffix |
|------|---------------|-------------|
| `surprised.png` | "Whoa!", "oh!", unexpected event | *Both arms flung outward in surprise (hands open, palms forward), body leaning back slightly, eyes wide and round in shock, mouth in a small "o" shape, a few exclamation-mark sparks around the head.* |
| `confused.png` | "Hmm…", "not quite", puzzled | *Right hand on top of head as if scratching, head tilted heavily to one side, one eye slightly squinted in puzzlement, mouth in a small uncertain frown, a few floating "❓" question-mark particles around the head.* |
| `shrug.png` | "I'm not sure", "maybe" | *Both arms raised at the elbows, palms turned upward in a classic shrug, shoulders slightly hunched, head tilted to one side, eyebrows-equivalent (if any) raised, mouth in a small uncertain grimace.* |
| `aha.png` | "Aha!", "I get it!", "lightbulb moment" | *A bright lightbulb hovering directly above the antennae, both arms raised in a "Eureka!" jolt, eyes wide and bright with realization, mouth in a delighted open smile, body slightly elevated as if jumping, sparkle particles radiating outward.* |

### 22–23: Emphasis + gentle

| File | When it shows | Pose suffix |
|------|---------------|-------------|
| `emphasizing.png` | "This is important", "always remember" | *Both hands held together in front of the chest in a karate-chop motion (mid-chop), serious-but-warm focused expression, eyes intensely engaged, slight forward lean, a small subtle yellow burst behind the figure to suggest emphasis.* |
| `sad.png` | "That's ok", "no worries", sympathetic | *Body slumped slightly with shoulders drooped, head tilted down a little, eyes soft and gentle (not sad-sad, just empathetic), mouth in a small caring smile, both hands held softly in front of the body, a tiny blue glow at the chest core suggesting compassion.* |

---

## Recommended generation workflow

### If using ChatGPT (or similar conversational image gen)
1. Generate `idle.png` first as your **anchor image**. Spend more time on it
   to get the character design exactly right — rounded shapes, eye glow,
   antenna proportions, chest core.
2. For each subsequent state, paste the anchor image into the chat and say:
   *"Same robot character, same style, same proportions, same lighting.
   Now show this exact character in the following pose: {pose suffix}"*.
   This keeps the design consistent.
3. Save each result as `{slug}.png` in
   `apps/desktop/renderer/public/assets/spark-states/`.

### If using Midjourney / SDXL / Flux
1. Generate `idle.png` with the full character description.
2. Use that image as an **image-to-image reference** (img2img, ControlNet
   reference-only, or Midjourney `--cref`) for all 23 follow-ups, varying
   only the pose suffix in the prompt.
3. Aim for `--seed` consistency where possible.

### If using a designer
Hand them this doc + 1–2 reference images they've seen of the existing
Spark waving / celebrating that you've already approved. ~20–40 min per
illustration is typical for a competent character illustrator.

---

## Verifying a state works in the app

1. Drop the file into `apps/desktop/renderer/public/assets/spark-states/`.
2. Restart `npm run dev` (Next dev server picks up new public files
   immediately, but a hard refresh of the Electron window may be needed).
3. Open Face Mode in the tutor panel.
4. Trigger a message that should classify to that state. The classifier
   patterns are in [`tutor-face-mode.tsx`](../apps/desktop/renderer/src/components/tutor-face-mode.tsx).
   Easy ways to trigger each:
   - **celebrate** → ask Spark for praise: *"did I do well?"*
   - **clapping** → "great job, didn't I?"
   - **cheering** → "I'm amazing, right?"
   - **thinking** → ask a tough question and watch the streaming pause
   - **point-left** → ask *"what's on the left?"*
   - **aha** → ask *"oh, I see — that's how it works!"*
   - **questioning** → wait for Spark to ask you a follow-up question
   - **idle** → just stop typing and don't send a message

If the image doesn't load (404 or CORS), the component silently falls back
to the CSS rig — no errors. Open the browser dev tools → Network tab to
confirm the request resolved.

---

## Tips for staying consistent

- **Lock the eye color.** They're a glowing cyan/blue (`#5de4ff`-ish) on
  every image. Drift here breaks unity fast.
- **Lock the chest core.** A small soft cyan glow at the centre of the
  chest, ~10% of body height in size.
- **Antennae always have small dots.** Keep the dots the same color across
  the set (cyan or pink works).
- **Background = transparent.** Don't generate floors or props in the
  image itself — the app provides the panel/lighting.
- **Avoid text in the image.** No floating words, no UI overlays. Particles
  and emojis are fine.
- **Avoid extreme poses.** The character should always look balanced, never
  off-canvas. Each pose is "expressive but contained."

---

## Updating this doc

If you want different states (or fewer), update:
1. `SPARK_SCENES` in [`spark-robot/index.tsx`](../apps/desktop/renderer/src/components/spark-robot/index.tsx)
2. The classifier in [`tutor-face-mode.tsx`](../apps/desktop/renderer/src/components/tutor-face-mode.tsx)
3. This doc

Keep the three in sync. The slug (lowercased, hyphenated SPARK_SCENES name)
is the contract.
