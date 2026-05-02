'use client';

import { motion } from 'framer-motion';

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
      {/* ── Mark: speech bubble + spark ── */}
      <motion.svg
        width={markSize} height={markSize} viewBox="0 0 32 32" fill="none"
        initial={animate ? { opacity: 0, scale: 0.80 } : undefined}
        animate={animate ? { opacity: 1, scale: 1 } : undefined}
        transition={{ duration: 0.40, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Soft halo behind everything */}
        <circle cx="16" cy="14.5" r="14" fill="url(#ss-halo)" opacity={0.55} />

        {/* Speech bubble — rounded rect body + tail pointing down-left */}
        <path
          d="M 7 5 H 25 A 5 5 0 0 1 30 10 V 19 A 5 5 0 0 1 25 24 H 14 L 9 29 V 24 H 7 A 5 5 0 0 1 2 19 V 10 A 5 5 0 0 1 7 5 Z"
          fill="url(#ss-bubble)"
          stroke="url(#ss-stroke)"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />

        {/* Spark inside the bubble — 4-point star with bright core */}
        <g transform="translate(16 14.5)">
          <path
            d="M 0 -7 L 1.6 -1.6 L 7 0 L 1.6 1.6 L 0 7 L -1.6 1.6 L -7 0 L -1.6 -1.6 Z"
            fill="url(#ss-spark)"
          />
          <circle cx="0" cy="0" r="1.7" fill="#ffffff" opacity={0.92} />
          <circle cx="3.2" cy="-3.0" r="0.5" fill="#ffffff" opacity={0.85} />
          <circle cx="-3.4" cy="2.8" r="0.45" fill="#ffffff" opacity={0.75} />
        </g>

        <defs>
          <radialGradient id="ss-halo" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#5de4ff" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#5de4ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ss-bubble" x1="2" y1="5" x2="30" y2="29" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0c1530" />
            <stop offset="100%" stopColor="#152244" />
          </linearGradient>
          <linearGradient id="ss-stroke" x1="2" y1="5" x2="30" y2="29" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#5de4ff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.55" />
          </linearGradient>
          <radialGradient id="ss-spark" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#fff4d6" />
            <stop offset="40%" stopColor="#5de4ff" />
            <stop offset="100%" stopColor="#a855f7" />
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
