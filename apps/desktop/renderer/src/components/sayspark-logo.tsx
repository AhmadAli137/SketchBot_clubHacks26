'use client';

import { motion } from 'motion/react';

type LogoProps = {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  animate?: boolean;
};

/**
 * SaySpark logo. Mark: a soft speech bubble with a spark inside —
 * "say" + "spark" rendered as one image. Wordmark splits the name so
 * "Spark" picks up the same cyan accent as the in-app tutor character
 * ("Sketch" the spark) for visual continuity.
 */
export function SaySparkLogo({ size = 40, showWordmark = true, className, animate = true }: LogoProps) {
  const s = size;
  const markSize = Math.round(s * 0.62);

  return (
    <div
      className={`sayspark-logo-root ${className ?? ''}`}
      style={{ display: 'flex', alignItems: 'center', gap: Math.round(s * 0.18) }}
    >
      {/* ── Mark: just the Spark. Spark IS the character — the AI tutor that lives in
            every robot the platform connects to. Pure 4-point star with halo + core. ── */}
      <motion.svg
        width={markSize} height={markSize} viewBox="0 0 32 32" fill="none"
        initial={animate ? { opacity: 0, scale: 0.80 } : undefined}
        animate={animate ? { opacity: 1, scale: 1 } : undefined}
        transition={{ duration: 0.40, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Soft halo */}
        <circle cx="16" cy="16" r="15" fill="url(#ss-halo)" opacity={0.65} />

        <g transform="translate(16 16)">
          {/* Outer 4-point star — long rays */}
          <path
            d="M 0 -14 L 3 -3 L 14 0 L 3 3 L 0 14 L -3 3 L -14 0 L -3 -3 Z"
            fill="url(#ss-spark)"
          />
          {/* Inner 4-point star, rotated 45° — adds twinkle without clutter */}
          <path
            d="M 0 -6 L 1.4 -1.4 L 6 0 L 1.4 1.4 L 0 6 L -1.4 1.4 L -6 0 L -1.4 -1.4 Z"
            transform="rotate(45)"
            fill="#ffffff"
            opacity={0.50}
          />
          {/* Bright core glow */}
          <circle cx="0" cy="0" r="3.6" fill="url(#ss-core)" opacity={0.65} />
          <circle cx="0" cy="0" r="2.0" fill="#ffffff" opacity={0.96} />
          {/* Twinkle accents */}
          <circle cx="6.5" cy="-5.5" r="0.7" fill="#ffffff" opacity={0.80} />
          <circle cx="-7.0" cy="6.0" r="0.6" fill="#ffffff" opacity={0.65} />
          <circle cx="-5.5" cy="-5.0" r="0.4" fill="#ffffff" opacity={0.55} />
        </g>

        <defs>
          <radialGradient id="ss-halo" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#5de4ff" stopOpacity="0.40" />
            <stop offset="60%" stopColor="#a855f7" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#5de4ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ss-spark" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#fff4d6" />
            <stop offset="35%" stopColor="#5de4ff" />
            <stop offset="100%" stopColor="#a855f7" />
          </radialGradient>
          <radialGradient id="ss-core" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#5de4ff" stopOpacity="0" />
          </radialGradient>
        </defs>
      </motion.svg>

      {/* ── Wordmark — "Say" + "Spark" with Spark in cyan ── */}
      {showWordmark && (
        <motion.div
          className="sayspark-wordmark"
          style={{ lineHeight: 1 }}
          initial={animate ? { opacity: 0, x: -5 } : undefined}
          animate={animate ? { opacity: 1, x: 0 } : undefined}
          transition={{ duration: 0.38, delay: 0.10, ease: 'easeOut' }}
        >
          <div
            className="sayspark-wordmark-name"
            style={{ fontSize: Math.round(s * 0.54), fontWeight: 800, letterSpacing: '-0.025em' }}
          >
            <span className="sayspark-wordmark-say">Say</span>
            <span className="sayspark-wordmark-spark">Spark</span>
          </div>
          <div
            className="sayspark-wordmark-sub"
            style={{ fontSize: Math.round(s * 0.22), letterSpacing: '0.14em', fontWeight: 600 }}
          >
            VOICE-FIRST AI TUTOR
          </div>
        </motion.div>
      )}
    </div>
  );
}
