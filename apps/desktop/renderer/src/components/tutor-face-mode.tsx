'use client';

/**
 * TutorFaceMode — "video-call with Spark" view.
 *
 * Replaces the chat scrollback with a large animated Spark + a karaoke
 * caption strip. Drives Spark's animation scene from the latest message's
 * content + streaming state, so users feel they're talking to a character
 * rather than reading a transcript.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

import { SPARK_SCENES } from '@/components/spark-robot';
import { SparkStateImage } from '@/components/spark-state-image';
import type { TutorMessage, TutorTtsHighlight } from './tutor-panel';

// ─── State derivation ─────────────────────────────────────────────────────────
//
// Maps each tutor message → one of 24 SparkRobot scenes via a small set of
// regex tests. Order matters — the first match wins, so put the most
// specific patterns at the top.

type ClassifiedScene = number;

function classifyScene(text: string): ClassifiedScene {
  const t = text.toLowerCase();

  // ── Strong reactions first ─────────────────────────────────────────────
  if (/\b(wow|whoa|woah|oh!|oh my|holy)\b/.test(t))
    return SPARK_SCENES.SURPRISED;
  if (/(aha|eureka|i see|i got it|got it!|oh, of course)/.test(t))
    return SPARK_SCENES.AHA;

  // ── Celebration / cheering ─────────────────────────────────────────────
  if (/(amazing|incredible|fantastic|brilliant|love it|spectacular|stunning)/.test(t))
    return SPARK_SCENES.CHEERING;
  if (/(great job|well done|nailed it|perfect|nice work)/.test(t))
    return SPARK_SCENES.CLAPPING;
  if (/\b(great|awesome|excellent|wonderful|terrific|super)\b/.test(t))
    return SPARK_SCENES.CELEBRATE;

  // ── Agreement / encouragement ──────────────────────────────────────────
  if (/(thumbs up|nice|sweet|cool!|keep it up|keep going|you got it|that'?s it)/.test(t))
    return SPARK_SCENES.ADAPT;
  if (/^(yes|yep|yeah|right|correct|exactly|true|absolutely|sure|of course)/.test(t.trim())
   || /\b(that'?s right|exactly right|good thinking)\b/.test(t))
    return SPARK_SCENES.NODDING;
  if (/(don'?t worry|you can do this|i believe|believe in you|come on|let'?s go)/.test(t))
    return SPARK_SCENES.ENCOURAGING;

  // ── Spatial / pointing ─────────────────────────────────────────────────
  if (/(left side|on your left|to the left)/.test(t))
    return SPARK_SCENES.POINT_LEFT;
  if (/(right side|on your right|to the right)/.test(t))
    return SPARK_SCENES.POINT_RIGHT;
  if (/(down (here|there|below)|on the floor|in the sandbox|on the canvas)/.test(t))
    return SPARK_SCENES.POINT_DOWN;
  if (/(up (here|there|above)|the sky|overhead|the camera)/.test(t))
    return SPARK_SCENES.POINT_UP;

  // ── Questions ──────────────────────────────────────────────────────────
  if (/\?\s*$/.test(t.trim()) || /\b(what do you think|can you|why|how come|do you know)\b/.test(t))
    return SPARK_SCENES.QUESTIONING;

  // ── Confusion / sympathy ───────────────────────────────────────────────
  if (/(hmm|hmmm|not quite|let me think|that'?s tricky|tough one)/.test(t))
    return SPARK_SCENES.CONFUSED;
  if (/(that'?s ok|no worries|that happens|don'?t worry|sorry|oh no)/.test(t))
    return SPARK_SCENES.SAD;
  if (/(i'?m not sure|maybe|could be|might be|hard to say)/.test(t))
    return SPARK_SCENES.SHRUG;

  // ── Suggestion / guide ─────────────────────────────────────────────────
  if (/(here'?s how|step (one|1)|first,|step by step)/.test(t))
    return SPARK_SCENES.EXPLAINING;
  if (/(let'?s|try|imagine|notice|look at|consider|what if|think about|how about)/.test(t))
    return SPARK_SCENES.GUIDE;

  // ── Emphasis / serious explanation ─────────────────────────────────────
  if (/(important|the key|the main thing|always|never|remember)/.test(t))
    return SPARK_SCENES.EMPHASIZING;

  // ── Greeting ───────────────────────────────────────────────────────────
  if (/^(hi|hey|hello|welcome|greetings)/.test(t.trim()))
    return SPARK_SCENES.WAVE;

  // ── Default talking ────────────────────────────────────────────────────
  return SPARK_SCENES.TALKING;
}

/** Strip the post-`---` written-only section so face-mode shows just the
 *  voice-friendly part the student is hearing. */
function spokenSection(text: string): string {
  const dashIdx = text.indexOf('\n---');
  if (dashIdx === -1) return text.trim();
  return text.slice(0, dashIdx).trim();
}

/** Split spoken text into sentences. Basic but works for typical English —
 *  splits on . / ! / ? followed by whitespace, preserves the punctuation. */
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const matches = trimmed.match(/[^.!?]+[.!?]+(?:\s|$)|\S[^.!?]*$/g);
  if (!matches) return [trimmed];
  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** UI labels + colors for each scene — drives the floating state chip. */
type FaceStateMeta = { label: string; color: string };

const SCENE_META: Record<number, FaceStateMeta> = {
  [SPARK_SCENES.IDLE]:        { label: '🤖 Listening',    color: 'rgba(140,140,180,0.7)' },
  [SPARK_SCENES.LISTENING]:   { label: '👂 Listening',    color: 'rgba(125,211,252,0.9)' },
  [SPARK_SCENES.THINKING]:    { label: '🤔 Thinking…',    color: 'rgba(216,180,254,0.95)' },
  [SPARK_SCENES.TALKING]:     { label: '🗣️ Speaking',      color: 'rgba(125,211,252,0.95)' },
  [SPARK_SCENES.EXPLAINING]:  { label: '✨ Explaining',    color: 'rgba(165,180,252,0.95)' },
  [SPARK_SCENES.GUIDE]:       { label: '🧭 Guiding',       color: 'rgba(165,180,252,0.95)' },
  [SPARK_SCENES.QUESTIONING]: { label: '❓ Asking',        color: 'rgba(216,180,254,0.95)' },
  [SPARK_SCENES.WAVE]:        { label: '👋 Hi there',      color: 'rgba(125,211,252,0.95)' },
  [SPARK_SCENES.CELEBRATE]:   { label: '🎉 Excited!',      color: 'rgba(255,215,116,0.95)' },
  [SPARK_SCENES.CHEERING]:    { label: '🥳 Cheering',      color: 'rgba(255,150,210,0.95)' },
  [SPARK_SCENES.CLAPPING]:    { label: '👏 Applauding',    color: 'rgba(255,200,90,0.95)' },
  [SPARK_SCENES.ADAPT]:       { label: '👍 Right on',      color: 'rgba(110,231,183,0.95)' },
  [SPARK_SCENES.NODDING]:     { label: '✅ Yes',           color: 'rgba(110,231,183,0.95)' },
  [SPARK_SCENES.ENCOURAGING]: { label: '💙 Encouraging',   color: 'rgba(125,211,252,0.95)' },
  [SPARK_SCENES.AHA]:         { label: '💡 Aha!',          color: 'rgba(255,215,116,0.95)' },
  [SPARK_SCENES.SURPRISED]:   { label: '❗ Whoa!',          color: 'rgba(255,150,210,0.95)' },
  [SPARK_SCENES.CONFUSED]:    { label: '🤨 Hmm…',          color: 'rgba(216,180,254,0.95)' },
  [SPARK_SCENES.SHRUG]:       { label: '🤷 Not sure',      color: 'rgba(180,180,200,0.95)' },
  [SPARK_SCENES.SAD]:         { label: '🥺 Sympathetic',    color: 'rgba(165,180,252,0.95)' },
  [SPARK_SCENES.EMPHASIZING]: { label: '⚡ Important',      color: 'rgba(255,200,90,0.95)' },
  [SPARK_SCENES.POINT_LEFT]:  { label: '👈 Look left',     color: 'rgba(165,180,252,0.95)' },
  [SPARK_SCENES.POINT_RIGHT]: { label: '👉 Look right',    color: 'rgba(165,180,252,0.95)' },
  [SPARK_SCENES.POINT_DOWN]:  { label: '👇 Down here',     color: 'rgba(125,211,252,0.95)' },
  [SPARK_SCENES.POINT_UP]:    { label: '☝️ Up there',       color: 'rgba(255,200,90,0.95)' },
};

/**
 * Per-sentence classification. Returns the array of sentences in the message's
 * spoken section so the face-mode component can advance through them and
 * reflect each one's emotional beat with its own scene.
 */
function deriveSentences(latest: TutorMessage | undefined): string[] {
  if (!latest || latest.role !== 'tutor') return [];
  return splitSentences(spokenSection(latest.content));
}

function metaFor(scene: number): FaceStateMeta {
  return SCENE_META[scene] ?? SCENE_META[SPARK_SCENES.TALKING]!;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  messages: TutorMessage[];
  ttsSpeaking: boolean;
  /** Word-level karaoke highlight from useTTS — drives sentence sync. */
  ttsHighlight?: TutorTtsHighlight;
  sparkVariant?: 'mark' | 'lori';
  onExit: () => void;
};

export function TutorFaceMode({ messages, ttsSpeaking, ttsHighlight, sparkVariant = 'mark', onExit }: Props) {
  const latest = messages.at(-1);
  const isStreaming = Boolean(latest?.isStreaming);

  // Split the spoken section into sentences (matches what TTS chunks for playback).
  const sentences = useMemo(() => deriveSentences(latest), [latest?.id, latest?.content, latest?.role]);

  // Word-count ranges per sentence — used to map TTS's whitespace word index
  // to a sentence index, so the face state advances in sync with the audio.
  const sentenceWordRanges = useMemo(() => {
    const ranges: Array<{ start: number; end: number }> = [];
    let offset = 0;
    for (const s of sentences) {
      const words = s.split(/\s+/).filter(Boolean).length;
      ranges.push({ start: offset, end: offset + words });
      offset += words;
    }
    return ranges;
  }, [sentences]);

  /** TTS-driven sentence index — −1 if TTS isn't currently tracking this message. */
  const ttsActiveIdx = useMemo(() => {
    if (!ttsHighlight || !latest || ttsHighlight.messageId !== latest.id) return -1;
    if (sentenceWordRanges.length === 0) return -1;
    const w = ttsHighlight.activeWordIndex;
    for (let i = 0; i < sentenceWordRanges.length; i++) {
      if (w < sentenceWordRanges[i]!.end) return i;
    }
    return sentenceWordRanges.length - 1;
  }, [ttsHighlight, latest?.id, sentenceWordRanges]);

  // Fallback timer-cycle for when TTS isn't running (TTS off, or post-completion idle).
  const [fallbackIdx, setFallbackIdx] = useState(0);
  useEffect(() => {
    if (sentences.length === 0) { setFallbackIdx(0); return; }
    if (isStreaming) {
      setFallbackIdx(sentences.length - 1);
      return;
    }
    // Don't run the fallback cycle when TTS is actively speaking — it would
    // double-drive activeIdx and fight with the real audio sync.
    if (ttsSpeaking) return;

    setFallbackIdx(0);
    if (sentences.length === 1) return;
    const charsPerSec = 14;
    const minHoldMs   = 1500;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 1; i < sentences.length; i++) {
      const prev = sentences[i - 1] ?? '';
      const dur = Math.max(minHoldMs, (prev.length / charsPerSec) * 1000);
      elapsed += dur;
      const idx = i;
      timers.push(setTimeout(() => setFallbackIdx(idx), elapsed));
    }
    return () => timers.forEach(clearTimeout);
  }, [sentences, isStreaming, ttsSpeaking]);

  /** Final active sentence: TTS-driven when available, else timer fallback. */
  const activeIdx = ttsActiveIdx >= 0 ? ttsActiveIdx : fallbackIdx;

  // Resolve current scene + caption.
  const { scene, meta } = useMemo(() => {
    if (!latest) {
      return { scene: SPARK_SCENES.IDLE, meta: metaFor(SPARK_SCENES.IDLE) };
    }
    if (latest.role !== 'tutor') {
      return { scene: SPARK_SCENES.LISTENING, meta: metaFor(SPARK_SCENES.LISTENING) };
    }
    if (sentences.length === 0 && isStreaming) {
      return { scene: SPARK_SCENES.THINKING, meta: metaFor(SPARK_SCENES.THINKING) };
    }
    const active = sentences[activeIdx] ?? sentences.at(-1) ?? '';
    const s = classifyScene(active);
    return { scene: s, meta: metaFor(s) };
  }, [latest, sentences, activeIdx, isStreaming]);

  // Caption: show the FULL spoken section (matches chat) but visually
  // emphasise the currently-being-spoken sentence so face + text stay
  // tied to the audio.
  const fullSpoken = useMemo(
    () => (latest && latest.role === 'tutor' ? spokenSection(latest.content) : ''),
    [latest?.id, latest?.role, latest?.content],
  );

  // Single string for change-detection / fallbacks (used by the speech key bump below)
  const caption = sentences[activeIdx] ?? '';

  // Bump the speech key whenever the caption changes so SparkRobot replays the
  // entrance animation for the new line.
  const speechKeyRef = useRef(0);
  const lastCaptionRef = useRef('');
  if (caption && caption !== lastCaptionRef.current) {
    speechKeyRef.current += 1;
    lastCaptionRef.current = caption;
  }

  // Subtle "talking" pulse on the avatar while TTS is playing
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!ttsSpeaking) { setPulse(false); return; }
    setPulse(true);
    const id = setInterval(() => setPulse((p) => !p), 380);
    return () => clearInterval(id);
  }, [ttsSpeaking]);

  return (
    <div className="tutor-face">
      {/* Back-to-chat pill */}
      <button
        type="button"
        className="tutor-face-back"
        onClick={onExit}
        title="Back to chat"
      >
        ← Chat
      </button>

      {/* State chip — what Spark is doing right now */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`state-${scene}`}
          className="tutor-face-state"
          style={{ color: meta.color, borderColor: meta.color.replace(/0\.95\)/, '0.45)') }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {meta.label}
        </motion.div>
      </AnimatePresence>

      {/* Big Spark — keyed on scene so the rig swaps cleanly */}
      <div className={`tutor-face-stage${pulse ? ' pulsing' : ''}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`scene-${scene}`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          >
            <SparkStateImage
              scene={scene}
              variant={sparkVariant}
              size={320}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Caption — full spoken section (matches chat). The active sentence is
          highlighted; already-spoken sentences fade; upcoming sentences sit
          dimmer. Stays in lockstep with TTS playback (and with the face state). */}
      <AnimatePresence mode="wait">
        {fullSpoken ? (
          <motion.div
            key={`cap-${latest?.id ?? 'none'}`}
            className="tutor-face-caption"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {sentences.length > 0 ? (
              sentences.map((s, i) => {
                const cls =
                  i < activeIdx ? 'tutor-face-caption-sentence past'
                  : i === activeIdx ? 'tutor-face-caption-sentence active'
                  : 'tutor-face-caption-sentence next';
                return (
                  <span key={i} className={cls}>
                    {i > 0 ? ' ' : ''}
                    {s}
                  </span>
                );
              })
            ) : (
              fullSpoken
            )}
          </motion.div>
        ) : (
          <motion.div
            key="cap-idle"
            className="tutor-face-caption tutor-face-caption--idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            Say something to Spark, or use the mic below.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
