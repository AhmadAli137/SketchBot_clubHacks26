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

/* ─── Object glyphs — mirror what's actually placeable in the sandbox ────────
   Inline SVGs sized for the sandpit decoration. Each one represents a real
   sandbox object so kids see the same shapes in both places. */

function ConeGlyph() {
  return (
    <svg width="26" height="32" viewBox="0 0 26 32" fill="none">
      {/* Base disc */}
      <ellipse cx="13" cy="29" rx="11" ry="2.5" fill="#1a1a1a" />
      {/* Cone body */}
      <path d="M13 4 L22 28 L4 28 Z" fill="#ff6520" stroke="#c33d00" strokeWidth="0.6" strokeLinejoin="round" />
      {/* Reflective stripe */}
      <path d="M8 16 L18 16 L19.2 19 L7 19 Z" fill="#fff7e0" opacity="0.85" />
    </svg>
  );
}

function WallBlockGlyph() {
  return (
    <svg width="30" height="24" viewBox="0 0 30 24" fill="none">
      {/* Block face */}
      <rect x="2" y="4" width="26" height="18" rx="1.5" fill="#3654d0" stroke="#5b6cff" strokeWidth="0.6" />
      {/* Top face — perspective */}
      <path d="M2 4 L5 1 L31 1 L28 4 Z" fill="#5b6cff" />
      {/* Side face */}
      <path d="M28 4 L31 1 L31 19 L28 22 Z" fill="#28368a" />
      {/* Highlight stripe — matches hex-lug cyan accent */}
      <line x1="6" y1="13" x2="24" y2="13" stroke="#5de4ff" strokeWidth="0.7" opacity="0.6" />
    </svg>
  );
}

function RampGlyph() {
  return (
    <svg width="38" height="22" viewBox="0 0 38 22" fill="none">
      {/* Ramp body — wedge */}
      <path d="M2 20 L36 20 L36 6 Z" fill="#3548b0" stroke="#5b6cff" strokeWidth="0.6" strokeLinejoin="round" />
      {/* Top deck highlight */}
      <path d="M2 20 L36 6" stroke="#5de4ff" strokeWidth="0.8" opacity="0.85" />
      {/* Glow stripe along leading edge */}
      <line x1="2" y1="20" x2="6" y2="20" stroke="#5de4ff" strokeWidth="1.5" />
    </svg>
  );
}

function WaypointOrbGlyph() {
  return (
    <svg width="20" height="36" viewBox="0 0 20 36" fill="none">
      {/* Pole */}
      <rect x="9" y="14" width="2" height="20" rx="1" fill="#303040" />
      {/* Orb glow */}
      <circle cx="10" cy="10" r="9" fill="#5de4ff" opacity="0.18" />
      {/* Orb */}
      <circle cx="10" cy="10" r="6" fill="#5de4ff" stroke="#a8efff" strokeWidth="0.6" />
      {/* Inner highlight */}
      <circle cx="8" cy="8" r="1.6" fill="#fff" opacity="0.7" />
    </svg>
  );
}

function SumoPlowGlyph() {
  return (
    <svg width="32" height="22" viewBox="0 0 32 22" fill="none">
      {/* Chassis body */}
      <rect x="10" y="8" width="18" height="10" rx="1.5" fill="#1a1d24" stroke="#3a3f4e" strokeWidth="0.6" />
      {/* Wheels */}
      <circle cx="13" cy="18" r="3" fill="#0e0e14" />
      <circle cx="25" cy="18" r="3" fill="#0e0e14" />
      <circle cx="13" cy="18" r="1.2" fill="#bd1a1a" />
      <circle cx="25" cy="18" r="1.2" fill="#bd1a1a" />
      {/* Wedge plow up front — tilted */}
      <path d="M2 17 L11 8 L11 14 Z" fill="#454850" stroke="#1a1a1f" strokeWidth="0.5" strokeLinejoin="round" />
      {/* Sharpened leading edge */}
      <line x1="2" y1="17" x2="11" y2="14" stroke="#1a1a1f" strokeWidth="1" />
    </svg>
  );
}

function BezierPathGlyph() {
  return (
    <svg width="42" height="24" viewBox="0 0 42 24" fill="none">
      <path
        d="M2 19 C8 3, 14 22, 21 11 C28 -1, 36 17, 40 12"
        stroke="#818cf8" strokeWidth="2.5" fill="none" strokeLinecap="round"
      />
      {/* Control point dots */}
      <circle cx="2"  cy="19" r="1.6" fill="#a8b1ff" />
      <circle cx="21" cy="11" r="1.6" fill="#a8b1ff" />
      <circle cx="40" cy="12" r="1.6" fill="#a8b1ff" />
    </svg>
  );
}

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

      {/* ── Far-left: ramp half-buried in the sand ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) - 2px)', left: '4%', zIndex: 3, lineHeight: 0 }}
        animate={{ y: [0, -3, 0], rotate: [-2, 2, -2] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
      >
        <RampGlyph />
      </motion.div>

      {/* ── Left: mini Spark — surprised, buried ── */}
      <motion.div
        className="sandbox-buried-wrap"
        style={{ position: 'absolute', bottom: 'var(--sand-h)', left: '15%' }}
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2.7, repeat: Infinity, ease: [0.4, 0, 0.6, 1], delay: 0.5 }}
      >
        <div className="sandbox-buried-clip">
          <SparkRobot mode="2d" pose="surprised" size="xs" />
        </div>
      </motion.div>

      {/* ── Traffic cone ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 2px)', left: '25%', zIndex: 3, lineHeight: 0 }}
        animate={{ rotate: [-10, 8, -10], y: [0, -2, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.9 }}
      >
        <ConeGlyph />
      </motion.div>

      {/* ── Glowing waypoint orb ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 2px)', left: '34%', zIndex: 3, lineHeight: 0, filter: 'drop-shadow(0 0 8px rgba(93,228,255,0.7))' }}
        animate={{ y: [0, -4, 0], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}
      >
        <WaypointOrbGlyph />
      </motion.div>

      {/* ── Maze wall block ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 2px)', left: '42%', zIndex: 3, lineHeight: 0 }}
        animate={{ y: [0, -4, 0], rotate: [-3, 3, -3] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: 1.9 }}
      >
        <WallBlockGlyph />
      </motion.div>

      {/* ── MAIN SPARK — shoveling IN the sand ── */}
      <div className="sandbox-main-bot">
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'flex-end' }}>
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
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 14px)', right: '30%', zIndex: 3, lineHeight: 0 }}
        animate={{ scaleX: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.7, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
      >
        <BezierPathGlyph />
      </motion.div>

      {/* ── Second waypoint orb on the right ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 2px)', right: '23%', zIndex: 3, lineHeight: 0, filter: 'drop-shadow(0 0 8px rgba(168,85,247,0.7))' }}
        animate={{ y: [0, -4, 0], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      >
        <WaypointOrbGlyph />
      </motion.div>

      {/* ── Sumo bot wedge plow ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) + 2px)', right: '14%', zIndex: 3, lineHeight: 0 }}
        animate={{ rotate: [4, -4, 4], y: [0, -3, 0] }}
        transition={{ duration: 2.3, repeat: Infinity, ease: 'easeInOut', delay: 1.0 }}
      >
        <SumoPlowGlyph />
      </motion.div>

      {/* ── Right-buried mini Spark — thinking ── */}
      <motion.div
        className="sandbox-buried-wrap"
        style={{ position: 'absolute', bottom: 'var(--sand-h)', right: '18%' }}
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: [0.4, 0, 0.6, 1], delay: 1.4 }}
      >
        <div className="sandbox-buried-clip">
          <SparkRobot mode="2d" pose="think" size="xs" />
        </div>
      </motion.div>

      {/* ── Far-right: another wall block ── */}
      <motion.div
        style={{ position: 'absolute', bottom: 'calc(var(--sand-h) - 1px)', right: '5%', zIndex: 3, lineHeight: 0 }}
        animate={{ rotate: [3, -2, 3], y: [0, -2, 0] }}
        transition={{ duration: 2.9, repeat: Infinity, ease: 'easeInOut', delay: 1.3 }}
      >
        <WallBlockGlyph />
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

        <path
          d="M0,22 C14,14 32,30 58,18 C80,8 102,24 130,14 C156,5 178,20 208,11 C234,3 258,18 286,8 C310,0 336,15 362,6 C386,-1 410,14 438,5 C464,-3 488,12 516,4 C542,-3 566,10 594,3 C620,-3 646,12 672,4 C696,-2 712,10 720,7 L720,90 L0,90 Z"
          fill="url(#sandGrad2)"
        />
        <path
          d="M0,22 C14,14 32,30 58,18 C80,8 102,24 130,14 C156,5 178,20 208,11 C234,3 258,18 286,8 C310,0 336,15 362,6 C386,-1 410,14 438,5 C464,-3 488,12 516,4 C542,-3 566,10 594,3 C620,-3 646,12 672,4 C696,-2 712,10 720,7 L720,90 L0,90 Z"
          fill="url(#sandShine)"
        />
        <path
          d="M0,22 C14,14 32,30 58,18 C80,8 102,24 130,14 C156,5 178,20 208,11 C234,3 258,18 286,8 C310,0 336,15 362,6 C386,-1 410,14 438,5 C464,-3 488,12 516,4 C542,-3 566,10 594,3 C620,-3 646,12 672,4 C696,-2 712,10 720,7"
          fill="none"
          stroke="rgba(255,196,70,0.42)"
          strokeWidth="2"
        />

        <ellipse cx="52"  cy="18" rx="34" ry="14" fill="#e8aa30" opacity="0.55" />
        <ellipse cx="130" cy="12" rx="26" ry="11" fill="#e8aa30" opacity="0.48" />
        <ellipse cx="250" cy="10" rx="22" ry="10" fill="#e8aa30" opacity="0.52" />
        <ellipse cx="370" cy="8"  rx="28" ry="11" fill="#e8aa30" opacity="0.44" />
        <ellipse cx="476" cy="6"  rx="24" ry="10" fill="#e8aa30" opacity="0.5"  />
        <ellipse cx="572" cy="8"  rx="22" ry="9"  fill="#e8aa30" opacity="0.48" />
        <ellipse cx="654" cy="6"  rx="30" ry="12" fill="#e8aa30" opacity="0.56" />

        {Array.from({ length: 60 }, (_, i) => (
          <circle
            key={i}
            cx={10 + ((i * 29 + i * i * 2) % 700)}
            cy={28 + (i % 5) * 7 + (i % 7) * 3}
            r={0.6 + (i % 3) * 0.5}
            fill={`rgba(120,65,10,${0.13 + (i % 4) * 0.05})`}
          />
        ))}

        {PEBBLES_CX.map((cx, i) => (
          <ellipse key={i} cx={cx} cy={42 + (i % 3) * 8} rx={2.5 + (i % 2)} ry={1.5} fill="rgba(100,52,8,0.28)" />
        ))}
      </svg>
    </div>
  );
}
