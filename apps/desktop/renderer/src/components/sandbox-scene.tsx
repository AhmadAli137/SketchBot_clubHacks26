'use client';

import { motion } from 'motion/react';
import { SparkRobot } from '@/components/spark-robot';

/**
 * Sandbox hero scene for the guest home screen.
 * Spark waves from a sandy pit while two mini bots peek out of the sand.
 */
export function SandboxHeroScene() {
  return (
    <div className="sandbox-hero" aria-hidden>
      {/* Starfield / ambient glow */}
      <div className="sandbox-hero-sky" />

      {/* Floating sparkle particles */}
      {([
        { x: '12%', y: '18%', size: 5, dur: 2.8, delay: 0.2, color: 'var(--cyan)' },
        { x: '82%', y: '12%', size: 4, dur: 3.3, delay: 0.7, color: '#a855f7' },
        { x: '68%', y: '30%', size: 3, dur: 2.5, delay: 1.1, color: 'var(--cyan)' },
        { x: '22%', y: '38%', size: 3, dur: 3.0, delay: 0.4, color: '#fbbf24' },
        { x: '91%', y: '44%', size: 5, dur: 2.2, delay: 0.9, color: '#4dffb8' },
      ] as const).map((p, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute', left: p.x, top: p.y,
            width: p.size, height: p.size, borderRadius: '50%',
            background: p.color, pointerEvents: 'none',
          }}
          animate={{ y: [0, -10, 0], opacity: [0.2, 0.9, 0.2], scale: [1, 1.6, 1] }}
          transition={{ duration: p.dur, repeat: Infinity, ease: 'easeInOut', delay: p.delay }}
        />
      ))}

      {/* ── Buried mini Sparks – only their heads poke above the sand ── */}

      {/* Left bot */}
      <motion.div
        className="sandbox-buried-wrap"
        style={{ position: 'absolute', bottom: 'var(--sand-h)', left: '12%' }}
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      >
        <div className="sandbox-buried-clip">
          <SparkRobot mode="2d" pose="surprised" size="xs" />
        </div>
      </motion.div>

      {/* Right bot */}
      <motion.div
        className="sandbox-buried-wrap"
        style={{ position: 'absolute', bottom: 'var(--sand-h)', right: '10%' }}
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
      >
        <div className="sandbox-buried-clip">
          <SparkRobot mode="2d" pose="think" size="xs" />
        </div>
      </motion.div>

      {/* ── Sandy ground ── */}
      <div className="sandbox-hero-ground" />

      {/* ── Main Spark — waves and floats ── */}
      <div className="sandbox-main-bot">
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3.0, repeat: Infinity, ease: 'easeInOut' }}
        >
          <SparkRobot mode="2d" pose="wave" size="md" />
        </motion.div>
      </div>

      {/* Shovel stuck in the sand */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) - 2px)', left: 'calc(50% + 68px)', fontSize: 20, transformOrigin: 'bottom center' }}
        animate={{ rotate: [-3, 4, -3] }}
        transition={{ duration: 4.0, repeat: Infinity, ease: 'easeInOut' }}
      >
        ⛏️
      </motion.div>
    </div>
  );
}
