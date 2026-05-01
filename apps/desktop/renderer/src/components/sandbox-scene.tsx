'use client';

import { motion } from 'motion/react';
import { SparkRobot } from '@/components/spark-robot';

function ShovelSvg() {
  return (
    <svg width="20" height="50" viewBox="0 0 20 50" fill="none">
      <rect x="8" y="0" width="4" height="30" rx="2" fill="#92400e" />
      <rect x="9" y="0" width="2" height="28" rx="1" fill="#b45309" opacity="0.4" />
      <rect x="5.5" y="28" width="9" height="5" rx="2" fill="#6b7280" />
      <path d="M2 33 Q10 29 18 33 L16 47 Q10 50 4 47 Z" fill="#9ca3af" />
      <path d="M3 33 Q10 30 17 33" stroke="#d1d5db" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

/* Sand puff burst — physics-arc trajectory */
function SandPuff({ dx, upY, sideX, size, delay }: {
  dx: number; upY: number; sideX: number; size: number; delay: number;
}) {
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `calc(50% + ${dx}px)`,
        bottom: 'var(--sand-h)',
        width: size, height: size,
        borderRadius: '50%',
        background: `hsl(${36 + size * 2}, 80%, ${52 + size}%)`,
        pointerEvents: 'none',
        zIndex: 4,
      }}
      animate={{
        y: [0, upY * 0.6, upY, upY * 0.7, 0],
        x: [0, sideX * 0.4, sideX, sideX * 1.1, sideX * 0.5],
        opacity: [0, 1, 0.7, 0.3, 0],
        scale: [0.2, 1.3, 1, 0.6, 0],
      }}
      transition={{
        duration: 1.6,
        repeat: Infinity,
        ease: [0.2, 0.8, 0.4, 1],
        delay,
        times: [0, 0.2, 0.5, 0.75, 1],
      }}
    />
  );
}

const PUFF_CONFIG = [
  { dx: 18, upY: -28, sideX: -8,  size: 6, delay: 0.7 },
  { dx: 26, upY: -44, sideX: 14,  size: 9, delay: 0.75 },
  { dx: 34, upY: -36, sideX: 22,  size: 7, delay: 0.8 },
  { dx: 12, upY: -20, sideX: -16, size: 5, delay: 0.72 },
  { dx: 40, upY: -24, sideX: 28,  size: 5, delay: 0.85 },
];

const PEBBLES_CX = [80, 190, 310, 430, 540, 640];

export function SandboxHeroScene() {
  return (
    <div className="sandbox-hero" aria-hidden>
      <div className="sandbox-hero-sky" />

      {/* Ambient sparkle particles */}
      {([
        { x: '7%',  y: '12%', s: 5, dur: 2.8, d: 0.2, c: 'var(--cyan)' },
        { x: '84%', y: '9%',  s: 4, dur: 3.4, d: 0.7, c: '#a855f7' },
        { x: '64%', y: '26%', s: 3, dur: 2.6, d: 1.1, c: 'var(--cyan)' },
        { x: '19%', y: '35%', s: 3, dur: 3.1, d: 0.4, c: '#fbbf24' },
        { x: '92%', y: '38%', s: 5, dur: 2.3, d: 0.9, c: '#4dffb8' },
        { x: '51%', y: '7%',  s: 3, dur: 3.7, d: 1.6, c: '#ff79b0' },
        { x: '38%', y: '18%', s: 2, dur: 4.2, d: 0.6, c: '#fbbf24' },
      ] as const).map((p, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute', left: p.x, top: p.y,
            width: p.s, height: p.s, borderRadius: '50%',
            background: p.c, pointerEvents: 'none',
          }}
          animate={{ y: [0, -12, 0], opacity: [0.12, 1, 0.12], scale: [1, 1.8, 1] }}
          transition={{ duration: p.dur, repeat: Infinity, ease: 'easeInOut', delay: p.d }}
        />
      ))}

      {/* ── Far-left: sad tilted bucket ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 3px)', left: '5%', fontSize: 28, zIndex: 3, lineHeight: 1 }}
        animate={{ rotate: [-10, 7, -10] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
      >
        🪣
      </motion.div>

      {/* ── Left: mini Spark — surprised, buried ── */}
      <motion.div
        className="sandbox-buried-wrap"
        style={{ position: 'absolute', bottom: 'var(--sand-h)', left: '14%' }}
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2.7, repeat: Infinity, ease: [0.4, 0, 0.6, 1], delay: 0.5 }}
      >
        <div className="sandbox-buried-clip">
          <SparkRobot mode="2d" pose="surprised" size="xs" />
        </div>
      </motion.div>

      {/* ── Traffic cone — Cone Ring Gauntlet ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 5px)', left: '26%', fontSize: 24, zIndex: 3, lineHeight: 1 }}
        animate={{ rotate: [-14, 12, -14], y: [0, -2, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.9 }}
      >
        🔺
      </motion.div>

      {/* ── Glowing XP star ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 13px)', left: '37%', fontSize: 18, filter: 'drop-shadow(0 0 8px #fbbf24)', zIndex: 3 }}
        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5], rotate: [0, 22, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}
      >
        ⭐
      </motion.div>

      {/* ── Maze wall block ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 2px)', left: '42%', fontSize: 24, zIndex: 3, lineHeight: 1 }}
        animate={{ y: [0, -4, 0], rotate: [-4, 4, -4] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: 1.9 }}
      >
        🧱
      </motion.div>

      {/* ── MAIN SPARK — shoveling IN the sand ──
           The outer div uses .sandbox-main-bot CSS (position:absolute, bottom:sand-h, z-index:3).
           The inner div is position:relative so the shovel can be absolutely positioned to it. ── */}
      <div className="sandbox-main-bot">
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'flex-end' }}>

          {/* Spark body: forward-leaning dig motion with organic ease */}
          <motion.div
            style={{ transformOrigin: 'bottom center', display: 'inline-block' }}
            animate={{ rotate: [-7, 4, -7], y: [0, 5, 0] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: [0.4, 0, 0.2, 1],
              times: [0, 0.45, 1],
            }}
          >
            <SparkRobot mode="2d" pose="wave" size="md" />
          </motion.div>

          {/* Shovel: reach back → plunge down → scoop → lift */}
          <motion.div
            style={{
              position: 'absolute',
              right: -14,
              bottom: 8,
              transformOrigin: '10px 4px',
            }}
            animate={{ rotate: [-55, -55, 22, 18, -55] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
              times: [0, 0.12, 0.52, 0.65, 1.0],
            }}
          >
            <ShovelSvg />
          </motion.div>
        </div>
      </div>

      {/* Sand puff particles — launch with dig phase offset */}
      {PUFF_CONFIG.map((p, i) => <SandPuff key={i} {...p} />)}

      {/* ── Bezier wavy path — Path Planning ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 14px)', right: '30%', zIndex: 3 }}
        animate={{ scaleX: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2.7, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
      >
        <svg width="36" height="22" viewBox="0 0 36 22">
          <path d="M2 17 C8 3, 14 20, 20 9 C26 -1, 32 15, 34 10" stroke="#818cf8" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </svg>
      </motion.div>

      {/* ── Geometry diamond — Geometry lesson ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 8px)', right: '23%', fontSize: 20, zIndex: 3, lineHeight: 1, filter: 'drop-shadow(0 0 6px #a855f7)' }}
        animate={{ y: [0, -6, 0], opacity: [0.6, 1, 0.6], scale: [1, 1.2, 1] }}
        transition={{ duration: 2.9, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      >
        💎
      </motion.div>

      {/* ── Sumo wrestling — Sumo Arena ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 4px)', right: '16%', fontSize: 22, zIndex: 3 }}
        animate={{ rotate: [6, -6, 6], y: [0, -3, 0] }}
        transition={{ duration: 2.3, repeat: Infinity, ease: 'easeInOut', delay: 1.0 }}
      >
        🤼
      </motion.div>

      {/* ── Right-buried mini Spark — thinking ── */}
      <motion.div
        className="sandbox-buried-wrap"
        style={{ position: 'absolute', bottom: 'var(--sand-h)', right: '16%' }}
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: [0.4, 0, 0.6, 1], delay: 1.4 }}
      >
        <div className="sandbox-buried-clip">
          <SparkRobot mode="2d" pose="think" size="xs" />
        </div>
      </motion.div>

      {/* ── Far-right: sad bucket ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 2px)', right: '5%', fontSize: 26, zIndex: 3, lineHeight: 1 }}
        animate={{ rotate: [8, -6, 8] }}
        transition={{ duration: 2.9, repeat: Infinity, ease: 'easeInOut', delay: 1.3 }}
      >
        🪣
      </motion.div>

      {/* ── Sandy ground: SVG with organic bumpy top + texture ── */}
      <svg
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', height: 90, display: 'block', zIndex: 2 }}
        viewBox="0 0 720 90"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="sandGrad2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d4952a" />
            <stop offset="38%" stopColor="#c07820" />
            <stop offset="100%" stopColor="#8b5e1a" />
          </linearGradient>
          <radialGradient id="sandShine" cx="50%" cy="0%" r="80%">
            <stop offset="0%" stopColor="#f0c040" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#d4952a" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Primary bumpy sand surface */}
        <path
          d="M0,22 C14,14 32,30 58,18 C80,8 102,24 130,14 C156,5 178,20 208,11 C234,3 258,18 286,8 C310,0 336,15 362,6 C386,-1 410,14 438,5 C464,-3 488,12 516,4 C542,-3 566,10 594,3 C620,-3 646,12 672,4 C696,-2 712,10 720,7 L720,90 L0,90 Z"
          fill="url(#sandGrad2)"
        />
        {/* Shine layer */}
        <path
          d="M0,22 C14,14 32,30 58,18 C80,8 102,24 130,14 C156,5 178,20 208,11 C234,3 258,18 286,8 C310,0 336,15 362,6 C386,-1 410,14 438,5 C464,-3 488,12 516,4 C542,-3 566,10 594,3 C620,-3 646,12 672,4 C696,-2 712,10 720,7 L720,90 L0,90 Z"
          fill="url(#sandShine)"
        />
        {/* Highlight rim */}
        <path
          d="M0,22 C14,14 32,30 58,18 C80,8 102,24 130,14 C156,5 178,20 208,11 C234,3 258,18 286,8 C310,0 336,15 362,6 C386,-1 410,14 438,5 C464,-3 488,12 516,4 C542,-3 566,10 594,3 C620,-3 646,12 672,4 C696,-2 712,10 720,7"
          fill="none"
          stroke="rgba(255,196,70,0.42)"
          strokeWidth="2"
        />

        {/* Organic sand piles at item spots */}
        <ellipse cx="52"  cy="18" rx="34" ry="14" fill="#e8aa30" opacity="0.55" />
        <ellipse cx="130" cy="12" rx="26" ry="11" fill="#e8aa30" opacity="0.48" />
        <ellipse cx="250" cy="10" rx="22" ry="10" fill="#e8aa30" opacity="0.52" />
        <ellipse cx="370" cy="8"  rx="28" ry="11" fill="#e8aa30" opacity="0.44" />
        <ellipse cx="476" cy="6"  rx="24" ry="10" fill="#e8aa30" opacity="0.5"  />
        <ellipse cx="572" cy="8"  rx="22" ry="9"  fill="#e8aa30" opacity="0.48" />
        <ellipse cx="654" cy="6"  rx="30" ry="12" fill="#e8aa30" opacity="0.56" />

        {/* Texture dots */}
        {Array.from({ length: 60 }, (_, i) => (
          <circle
            key={i}
            cx={10 + ((i * 29 + i * i * 2) % 700)}
            cy={28 + (i % 5) * 7 + (i % 7) * 3}
            r={0.6 + (i % 3) * 0.5}
            fill={`rgba(120,65,10,${0.13 + (i % 4) * 0.05})`}
          />
        ))}

        {/* Embedded pebbles */}
        {PEBBLES_CX.map((cx, i) => (
          <ellipse key={i} cx={cx} cy={42 + (i % 3) * 8} rx={2.5 + (i % 2)} ry={1.5} fill="rgba(100,52,8,0.28)" />
        ))}
      </svg>
    </div>
  );
}
