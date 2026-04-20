'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

import type { ChestDefinition } from '@/lib/game-economy';
import { CHEST_TIER_STYLE } from '@/lib/game-economy';
import { getShopItem } from '@/lib/game-economy';
import { playSfx } from '@/lib/game-audio';

type Particle = { id: number; x: number; y: number; vx: number; vy: number; color: string; size: number };

const COLORS = ['#ffd700', '#ff6eb4', '#5de4ff', '#4dffb8', '#a855f7', '#fbbf24', '#ff4f6b'];

function useParticles(active: boolean) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) { setParticles([]); return; }
    const ps: Particle[] = Array.from({ length: 32 }, (_, i) => ({
      id: i,
      x: 50,
      y: 50,
      vx: (Math.random() - 0.5) * 180,
      vy: -(40 + Math.random() * 120),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 4 + Math.random() * 8,
    }));
    setParticles(ps);
    const t = setTimeout(() => setParticles([]), 1400);
    return () => clearTimeout(t);
  }, [active]);

  return particles;
}

type ChestRewardProps = {
  chest: ChestDefinition;
  sparksAwarded: number;
  bonusItemId: string | null;
  onClose: () => void;
};

export function ChestReward({ chest, sparksAwarded, bonusItemId, onClose }: ChestRewardProps) {
  const [phase, setPhase] = useState<'closed' | 'shaking' | 'open' | 'reveal'>('closed');
  const style = CHEST_TIER_STYLE[chest.tier];
  const bonusItem = bonusItemId ? getShopItem(bonusItemId) : null;
  const particles = useParticles(phase === 'open');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t1 = setTimeout(() => { setPhase('shaking'); playSfx('beep'); }, 400);
    const t2 = setTimeout(() => { setPhase('open'); playSfx('coin'); }, 1400);
    const t3 = setTimeout(() => { setPhase('reveal'); playSfx(bonusItemId ? 'unlock' : 'success'); }, 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [bonusItemId]);

  return (
    <motion.div
      className="chest-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget && phase === 'reveal') onClose(); }}
    >
      <motion.div
        className="chest-modal"
        initial={{ scale: 0.7, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 18, stiffness: 220 }}
      >
        {/* Tier glow halo */}
        <div className="chest-halo" style={{ background: style.glow, boxShadow: `0 0 80px 30px ${style.glow}` }} />

        {/* Tier label */}
        <div className="chest-tier-label" style={{ color: style.label }}>
          {chest.tier.toUpperCase()} CHEST
        </div>

        {/* The chest graphic */}
        <div className="chest-graphic-wrap" ref={containerRef}>
          {/* Particles */}
          <AnimatePresence>
            {particles.map((p) => (
              <motion.div
                key={p.id}
                className="chest-particle"
                style={{ background: p.color, width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%` }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: p.vx, y: p.vy, opacity: 0, scale: 0.3 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            ))}
          </AnimatePresence>

          <motion.div
            className="chest-box"
            style={{ background: style.bg, boxShadow: `0 8px 40px ${style.glow}` }}
            animate={
              phase === 'shaking'
                ? { rotate: [0, -8, 8, -6, 6, -4, 4, 0], scale: [1, 1.05, 1.05, 1.05, 1.05, 1.03, 1.03, 1] }
                : phase === 'open'
                ? { scale: [1, 1.3, 0.9, 1.05, 1], rotate: 0 }
                : {}
            }
            transition={{ duration: phase === 'shaking' ? 0.9 : 0.4 }}
          >
            <motion.span
              className="chest-emoji"
              animate={phase === 'open' ? { scale: [1, 1.6, 1], rotate: [0, 15, -15, 0] } : {}}
              transition={{ duration: 0.5 }}
            >
              {phase === 'open' || phase === 'reveal' ? '🔓' : chest.emoji}
            </motion.span>
          </motion.div>
        </div>

        {/* Reveal panel */}
        <AnimatePresence>
          {phase === 'reveal' && (
            <motion.div
              className="chest-reveal"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="chest-reveal-label">{chest.label}</div>

              <motion.div
                className="chest-sparks-award"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }}
              >
                <span className="chest-spark-icon">⚡</span>
                <span className="chest-spark-amount">+{sparksAwarded}</span>
                <span className="chest-spark-label">Sparks</span>
              </motion.div>

              {bonusItem && (
                <motion.div
                  className="chest-bonus-item"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 14, stiffness: 180, delay: 0.3 }}
                >
                  <div className="chest-bonus-tag">BONUS UNLOCKED</div>
                  <div className="chest-bonus-name">
                    <span>{bonusItem.emoji}</span>
                    {bonusItem.name}
                  </div>
                  <div className="chest-bonus-desc">{bonusItem.description}</div>
                </motion.div>
              )}

              <motion.button
                type="button"
                className="chest-collect-btn"
                onClick={onClose}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
              >
                Collect!
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
