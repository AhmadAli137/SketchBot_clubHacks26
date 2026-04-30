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

import { SparkRobot } from '@/components/spark-robot';
import type { TutorMessage } from './tutor-panel';

// ─── State derivation ─────────────────────────────────────────────────────────

/** Scene picked for the SparkRobot 3D rig:
 *    0 = welcome / wave  · 1 = guide / point  · 2 = celebrate · 3 = adapt / thumbs-up
 */
function classifyScene(text: string): 0 | 1 | 2 | 3 {
  const t = text.toLowerCase();

  // Celebration: explicit positive feedback
  if (/(great|awesome|amazing|brilliant|perfect|love it|fantastic|incredible|well done|exactly right|nailed it|wonderful)/.test(t)) {
    return 2;
  }
  // Suggestion / guide: hint words, looking-forward verbs
  if (/(let'?s|here'?s how|here is how|try|imagine|notice|look at|consider|what if|think about|how about|first,)/.test(t)) {
    return 1;
  }
  // Encouragement / agreement
  if (/(yes|right|good|nice job|keep going|you got it|that'?s it|correct)/.test(t)) {
    return 3;
  }
  return 0;
}

/** Strip the post-`---` written-only section so face-mode shows just the
 *  voice-friendly part the student is hearing. */
function spokenSection(text: string): string {
  const dashIdx = text.indexOf('\n---');
  if (dashIdx === -1) return text.trim();
  return text.slice(0, dashIdx).trim();
}

type FaceState = 'idle' | 'thinking' | 'talking' | 'celebrating' | 'guiding' | 'agreeing';

function deriveState(latest: TutorMessage | undefined, isStreaming: boolean): {
  state: FaceState;
  scene: 0 | 1 | 2 | 3;
  caption: string;
} {
  if (!latest) return { state: 'idle', scene: 0, caption: '' };
  if (latest.role !== 'tutor') return { state: 'listening' as FaceState, scene: 1, caption: '' };

  const spoken = spokenSection(latest.content);
  if (latest.isStreaming && spoken.length === 0) {
    return { state: 'thinking', scene: 1, caption: '…' };
  }
  const scene = classifyScene(spoken);
  const stateByScene: Record<0 | 1 | 2 | 3, FaceState> = {
    0: 'talking',
    1: 'guiding',
    2: 'celebrating',
    3: 'agreeing',
  };
  return {
    state: latest.isStreaming ? 'talking' : stateByScene[scene],
    scene,
    caption: spoken,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  messages: TutorMessage[];
  ttsSpeaking: boolean;
  onExit: () => void;
};

export function TutorFaceMode({ messages, ttsSpeaking, onExit }: Props) {
  const latest = messages.at(-1);
  const isStreaming = Boolean(latest?.isStreaming);

  const { state, scene, caption } = useMemo(
    () => deriveState(latest, isStreaming),
    [latest, isStreaming],
  );

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
          key={state}
          className={`tutor-face-state tutor-face-state--${state}`}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {state === 'thinking'    && '🤔 Thinking…'}
          {state === 'talking'     && '🗣️ Speaking'}
          {state === 'celebrating' && '🎉 Excited!'}
          {state === 'guiding'     && '✨ Guiding'}
          {state === 'agreeing'    && '👍 Right on'}
          {state === 'idle'        && '🤖 Listening'}
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
            <SparkRobot
              mode="3d"
              size="xl"
              scene={scene}
              speechKey={speechKeyRef.current}
              showSpeech={null /* caption rendered separately, larger */}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Caption strip — what Spark just said */}
      <AnimatePresence mode="wait">
        {caption ? (
          <motion.div
            key={`cap-${speechKeyRef.current}`}
            className="tutor-face-caption"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {caption}
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
