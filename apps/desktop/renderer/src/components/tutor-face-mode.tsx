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
import { useSparkBehavior } from '@/lib/use-spark-behavior';
import type { TutorMessage, TutorTtsHighlight } from './tutor-panel';

// ─── State derivation ─────────────────────────────────────────────────────────
//
// Maps each tutor message → one of 24 SparkRobot scenes via a small set of
// regex tests. Order matters — the first match wins, so put the most
// specific patterns at the top.

type ClassifiedScene = number;

function classifyScene(text: string): ClassifiedScene {
  const t = text.toLowerCase();
  const trimmed = t.trim();

  // Robotics workspace states — keep these before generic guide/explaining cues.
  if (/(maze|wall segments?|build(?:ing)? walls?|course walls?|corridor)/.test(t))
    return SPARK_SCENES.MAZE_BUILDING;
  if (/(cones?|traffic cones?|marker cones?|place(?:ing)? cones?|set(?:ting)? cones?)/.test(t))
    return SPARK_SCENES.PLACING_CONES;
  if (/(obstacles?|blocks?|hurdles?|barriers?|course pieces?)/.test(t))
    return SPARK_SCENES.PLACING_OBSTACLES;
  if (/(work window|workspace|work area|canvas).*(left|left side)|(?:peek|peer|look).*left/.test(t))
    return SPARK_SCENES.PEEK_LEFT_WINDOW;
  if (/(work window|workspace|work area|canvas).*(right|right side)|(?:peek|peer|look).*right/.test(t))
    return SPARK_SCENES.PEEK_RIGHT_WINDOW;
  if (/(blueprint|plan the route|route plan|mission plan|path plan)/.test(t))
    return SPARK_SCENES.BLUEPRINT_PLANNING;
  if (/(calibrat|sensor|scan|lidar|camera check)/.test(t))
    return SPARK_SCENES.SENSOR_CALIBRATING;
  if (/(juggling ideas|many ideas|puzzle pieces|code blocks|brainstorm)/.test(t))
    return SPARK_SCENES.JUGGLING_IDEAS;
  if (/(trace the route|draw the route|route line|waypoints?|path on the floor)/.test(t))
    return SPARK_SCENES.ROUTE_TRACING;
  if (/(finish flag|checkered flag|finish line|successful run|completed run)/.test(t))
    return SPARK_SCENES.FINISH_FLAG;
  if (/(debug|bug|inspect|magnifying|find the problem|diagnos)/.test(t))
    return SPARK_SCENES.DEBUGGING;
  if (/(dance|rover dance|happy rover|little rover|victory dance)/.test(t))
    return SPARK_SCENES.ROVER_DANCE;

  // ── Emoji-driven hits (fastest signal, highest specificity) ────────────
  // The personas are encouraged to use emoji freely, so these fire often.
  if (/[🎉🥳🎊🍾]/u.test(text))                                      return SPARK_SCENES.CHEERING;
  if (/[👏🙌]/u.test(text))                                          return SPARK_SCENES.CLAPPING;
  if (/[💡✨]/u.test(text))                                          return SPARK_SCENES.AHA;
  if (/[❓🤔]/u.test(text))                                          return SPARK_SCENES.QUESTIONING;
  if (/[👋]/u.test(text))                                            return SPARK_SCENES.WAVE;
  if (/[👍✅]/u.test(text))                                          return SPARK_SCENES.NODDING;
  if (/[💙❤️🥰🤗]/u.test(text))                                     return SPARK_SCENES.ENCOURAGING;
  if (/[⚡‼️]/u.test(text))                                          return SPARK_SCENES.EMPHASIZING;
  if (/[😮😲😯]/u.test(text))                                        return SPARK_SCENES.SURPRISED;
  if (/[🤷]/u.test(text))                                            return SPARK_SCENES.SHRUG;
  if (/[🥺😢]/u.test(text))                                          return SPARK_SCENES.SAD;
  if (/[👈]/u.test(text))                                            return SPARK_SCENES.POINT_LEFT;
  if (/[👉]/u.test(text))                                            return SPARK_SCENES.POINT_RIGHT;
  if (/[👇]/u.test(text))                                            return SPARK_SCENES.POINT_DOWN;
  if (/[☝️👆]/u.test(text))                                         return SPARK_SCENES.POINT_UP;

  // ── Strong reactions ───────────────────────────────────────────────────
  if (/\b(wow|whoa|woah|oh my|holy|gosh)\b/.test(t))
    return SPARK_SCENES.SURPRISED;
  if (/^(oh!|wait,?\s*what)/.test(trimmed))
    return SPARK_SCENES.SURPRISED;
  if (/(aha|eureka|i see|i got it|got it!|oh,? of course|that makes sense)/.test(t))
    return SPARK_SCENES.AHA;

  // ── Celebration / cheering ─────────────────────────────────────────────
  if (/(amazing|incredible|fantastic|brilliant|love it|spectacular|stunning|epic)/.test(t))
    return SPARK_SCENES.CHEERING;
  if (/(great job|well done|nailed it|perfect|nice work|good job)/.test(t))
    return SPARK_SCENES.CLAPPING;
  if (/\b(great|awesome|excellent|wonderful|terrific|super|sweet|fun|favourite|favorite)\b/.test(t))
    return SPARK_SCENES.CELEBRATE;

  // ── Agreement / encouragement ──────────────────────────────────────────
  if (/(thumbs up|keep it up|keep going|you got it|that'?s it|nice one)/.test(t))
    return SPARK_SCENES.ADAPT;
  if (/^(yes|yep|yeah|right|correct|exactly|true|absolutely|sure|of course)/.test(trimmed)
   || /\b(that'?s right|exactly right|good thinking|spot on)\b/.test(t))
    return SPARK_SCENES.NODDING;
  if (/(don'?t worry|you can do this|i believe|believe in you|come on|let'?s go|you'?ll get it)/.test(t))
    return SPARK_SCENES.ENCOURAGING;

  // ── Spatial / pointing (text cues — emoji handled above) ───────────────
  if (/(left side|on your left|to the left|over (?:there )?to the left)/.test(t))
    return SPARK_SCENES.POINT_LEFT;
  if (/(right side|on your right|to the right|over (?:there )?to the right)/.test(t))
    return SPARK_SCENES.POINT_RIGHT;
  if (/(down (?:here|there|below)|on the floor|in the sandbox|on the canvas|right below)/.test(t))
    return SPARK_SCENES.POINT_DOWN;
  if (/(up (?:here|there|above)|the sky|overhead|the camera|right above)/.test(t))
    return SPARK_SCENES.POINT_UP;

  // ── Questions ──────────────────────────────────────────────────────────
  if (/\?\s*$/.test(trimmed)
   || /\b(what do you think|what about|can you|why|how come|do you know|wanna|want to|sound good)\b/.test(t))
    return SPARK_SCENES.QUESTIONING;

  // ── Confusion / sympathy ───────────────────────────────────────────────
  if (/(hmm+|not quite|let me think|that'?s tricky|tough one|tricky)/.test(t))
    return SPARK_SCENES.CONFUSED;
  if (/(that'?s ok|no worries|that happens|sorry|oh no|tough|been there)/.test(t))
    return SPARK_SCENES.SAD;
  if (/(i'?m not sure|maybe|could be|might be|hard to say|kind of|sort of)/.test(t))
    return SPARK_SCENES.SHRUG;

  // ── Suggestion / guide ─────────────────────────────────────────────────
  if (/(here'?s how|step (?:one|1)|first,|step by step|start by|let me show you)/.test(t))
    return SPARK_SCENES.EXPLAINING;
  if (/(let'?s|try|imagine|notice|look at|consider|what if|think about|how about|picture (?:this|that))/.test(t))
    return SPARK_SCENES.GUIDE;

  // ── Curiosity / exploration cues ───────────────────────────────────────
  if (/(curious|explore|discover|idea|ideas|imagine|wonder|wondering)/.test(t))
    return SPARK_SCENES.EXPLAINING;

  // ── Emphasis / serious teaching ───────────────────────────────────────
  if (/(important|the key|the main thing|always|never|remember|crucial|the trick)/.test(t))
    return SPARK_SCENES.EMPHASIZING;

  // ── Greeting ───────────────────────────────────────────────────────────
  if (/^(hi|hey|hello|welcome|greetings|howdy)/.test(trimmed))
    return SPARK_SCENES.WAVE;

  // ── Punctuation-driven fallbacks ──────────────────────────────────────
  if (/!\s*$/.test(trimmed))                                  return SPARK_SCENES.CELEBRATE;
  if (/(?:…|\.{3,})\s*$/.test(trimmed))                       return SPARK_SCENES.THINKING;

  // ── Default talking ────────────────────────────────────────────────────
  return SPARK_SCENES.TALKING;
}

/** Return the full speakable body of a tutor message — everything TTS reads.
 *  Removes the literal `---` separator line (which is markup, not speech) but
 *  KEEPS any written content after it. Earlier we stripped post-`---`, but
 *  TTS was still reading it, so face mode fell out of sync with the audio.
 *  Now face mode and chat show the same content; TTS reads the same content;
 *  everything stays in lockstep. */
function spokenSection(text: string): string {
  return text
    .replace(/\n\s*-{3,}\s*\n/g, '\n')   // drop the markup separator
    .replace(/^\s*-{3,}\s*$/gm, '')      // drop a leading/trailing one too
    .trim();
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
  [SPARK_SCENES.MAZE_BUILDING]:      { label: 'Building maze',   color: 'rgba(125,211,252,0.95)' },
  [SPARK_SCENES.PLACING_CONES]:      { label: 'Placing cones',   color: 'rgba(255,200,90,0.95)' },
  [SPARK_SCENES.PLACING_OBSTACLES]:  { label: 'Setting course',  color: 'rgba(216,180,254,0.95)' },
  [SPARK_SCENES.PEEK_LEFT_WINDOW]:   { label: 'Peeking left',    color: 'rgba(125,211,252,0.95)' },
  [SPARK_SCENES.PEEK_RIGHT_WINDOW]:  { label: 'Peeking right',   color: 'rgba(125,211,252,0.95)' },
  [SPARK_SCENES.BLUEPRINT_PLANNING]: { label: 'Planning route',  color: 'rgba(165,180,252,0.95)' },
  [SPARK_SCENES.SENSOR_CALIBRATING]: { label: 'Calibrating',     color: 'rgba(110,231,183,0.95)' },
  [SPARK_SCENES.JUGGLING_IDEAS]:     { label: 'Juggling ideas',  color: 'rgba(255,150,210,0.95)' },
  [SPARK_SCENES.ROUTE_TRACING]:      { label: 'Tracing route',   color: 'rgba(125,211,252,0.95)' },
  [SPARK_SCENES.FINISH_FLAG]:        { label: 'Run complete',    color: 'rgba(255,215,116,0.95)' },
  [SPARK_SCENES.DEBUGGING]:          { label: 'Debugging',       color: 'rgba(255,200,90,0.95)' },
  [SPARK_SCENES.ROVER_DANCE]:        { label: 'Victory dance',   color: 'rgba(255,150,210,0.95)' },
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
  /** True while the WS agent is reasoning (between MSG_THINKING and MSG_SPEAK).
   *  When true and there's nothing currently being spoken, face mode shows
   *  a "Sketch is thinking…" caption with animated dots so the kid sees the
   *  wait instead of dead air. */
  tutorThinking?: boolean;
  onExit: () => void;
};

export function TutorFaceMode({ messages, ttsSpeaking, ttsHighlight, sparkVariant = 'mark', tutorThinking = false, onExit }: Props) {
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

  // Behavior coordinator — drives the scene whenever there's no active speech
  // (between messages, before the first message, after a tutor reply finishes).
  // Layered as: TTS > streaming > behavior coordinator (reactive / ambient / idle).
  const behavior = useSparkBehavior();

  // Resolve current scene + caption.
  const { scene, meta } = useMemo(() => {
    // Streaming a tutor reply but no sentence text yet → "thinking".
    if (latest && latest.role === 'tutor' && sentences.length === 0 && isStreaming) {
      return { scene: SPARK_SCENES.THINKING, meta: metaFor(SPARK_SCENES.THINKING) };
    }
    // Active speech → TTS-driven sentence classifier wins.
    const speechActive = latest?.role === 'tutor' && sentences.length > 0 && (ttsSpeaking || isStreaming);
    if (speechActive) {
      const active = sentences[activeIdx] ?? sentences.at(-1) ?? '';
      const s = classifyScene(active);
      return { scene: s, meta: metaFor(s) };
    }
    // Otherwise the behavior coordinator is in charge — reactive override
    // (sandbox actions, sim outcomes, milestones) or ambient idle cycling.
    return { scene: behavior.scene, meta: metaFor(behavior.scene) };
  }, [latest, sentences, activeIdx, isStreaming, ttsSpeaking, behavior.scene]);

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

      {/* Caption — ONE sentence at a time, crossfading as TTS advances.
          Keeps Spark big and visible; chunks are bite-sized. */}
      <AnimatePresence mode="wait">
        {fullSpoken && sentences.length > 0 ? (
          <motion.div
            key={`sent-${latest?.id ?? 'none'}-${activeIdx}`}
            className="tutor-face-caption tutor-face-caption--single"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {sentences[activeIdx] ?? sentences.at(-1) ?? ''}
            {sentences.length > 1 && (
              <div className="tutor-face-caption-progress">
                {sentences.map((_, i) => (
                  <span
                    key={i}
                    className={`tutor-face-caption-dot${
                      i === activeIdx ? ' active' : i < activeIdx ? ' past' : ''
                    }`}
                  />
                ))}
              </div>
            )}
          </motion.div>
        ) : tutorThinking ? (
          <motion.div
            key="cap-thinking"
            className="tutor-face-caption tutor-face-caption--thinking"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            aria-live="polite"
          >
            <span className="tutor-thinking-label">Sketch is thinking</span>
            <span className="tutor-thinking-dots" aria-hidden>
              <span /><span /><span />
            </span>
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
