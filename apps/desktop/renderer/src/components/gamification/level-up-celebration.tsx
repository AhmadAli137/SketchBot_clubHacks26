'use client';

// ─── Level-Up Celebration ────────────────────────────────────────────────────
// Full-screen "big & splashy" overlay shown when a student levels up. Renders
// a confetti burst, an animated level badge, and an XP counter animation.

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';

export type LevelUpCelebrationProps = {
  show: boolean;
  newLevel: number;
  levelName: string;
  levelEmoji: string;
  previousXP: number;
  newXP: number;
  xpAwarded: number;
  onDismiss: () => void;
  autoDismissMs?: number;
};

const CONFETTI_COLORS = [
  '#ff3d71',
  '#ffb000',
  '#36d399',
  '#22d3ee',
  '#a855f7',
  '#f472b6',
  '#facc15',
];

function ConfettiBurst({ count = 80 }: { count?: number }) {
  const pieces = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 280 + Math.random() * 320;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      return {
        id: i,
        x,
        y,
        rotate: Math.random() * 720 - 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 8,
        delay: Math.random() * 0.25,
        duration: 1.6 + Math.random() * 1.1,
      };
    });
  }, [count]);

  return (
    <div className="levelup-confetti-layer" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="levelup-confetti-piece"
          style={{
            background: p.color,
            width: p.size,
            height: p.size * 0.4,
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

function useCountUp(from: number, to: number, durationMs: number) {
  const [value, setValue] = useState(from);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const delta = to - from;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + delta * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [from, to, durationMs]);

  return value;
}

export function LevelUpCelebration({
  show,
  newLevel,
  levelName,
  levelEmoji,
  previousXP,
  newXP,
  xpAwarded,
  onDismiss,
  autoDismissMs = 4200,
}: LevelUpCelebrationProps) {
  useEffect(() => {
    if (!show) return;
    const id = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(id);
  }, [show, autoDismissMs, onDismiss]);

  const xpValue = useCountUp(previousXP, newXP, 1400);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="levelup-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onDismiss}
          role="dialog"
          aria-modal="true"
          aria-label={`Level up! You are now level ${newLevel}, ${levelName}.`}
        >
          <ConfettiBurst />
          <motion.div
            className="levelup-card"
            initial={{ scale: 0.4, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="levelup-headline">LEVEL UP!</div>
            <motion.div
              className="levelup-badge"
              initial={{ scale: 0.2, rotate: -25 }}
              animate={{ scale: [0.2, 1.25, 1], rotate: [-25, 8, 0] }}
              transition={{ duration: 0.9, times: [0, 0.6, 1], ease: 'easeOut' }}
            >
              <span className="levelup-emoji" aria-hidden>{levelEmoji}</span>
              <span className="levelup-level-number">Lv {newLevel}</span>
            </motion.div>
            <div className="levelup-title">{levelName}</div>
            <div className="levelup-xp-row">
              <span className="levelup-xp-counter">{xpValue.toLocaleString()} XP</span>
              <span className="levelup-xp-delta">+{xpAwarded}</span>
            </div>
            <button type="button" className="levelup-dismiss" onClick={onDismiss}>
              Keep drawing →
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
