'use client';

import { motion } from 'framer-motion';

type LogoProps = {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  animate?: boolean;
};

export function AiboticsLogo({ size = 40, showWordmark = true, className, animate = true }: LogoProps) {
  const s = size;
  const markSize = Math.round(s * 0.62);

  return (
    <div
      className={`aibotics-logo-root${className ? ` ${className}` : ''}`}
      style={{ display: 'flex', alignItems: 'center', gap: Math.round(s * 0.18) }}
    >
      <motion.svg
        width={markSize} height={markSize} viewBox="0 0 28 28" fill="none" aria-label="Aibotics"
        initial={animate ? { opacity: 0, scale: 0.80 } : undefined}
        animate={animate ? { opacity: 1, scale: 1 } : undefined}
        transition={{ duration: 0.40, ease: [0.22, 1, 0.36, 1] }}
      >
        <rect x="0.5" y="0.5" width="27" height="27" rx="7.5"
          fill="url(#ab-bg)" stroke="url(#ab-bd)" strokeWidth="0.6" />
        <circle cx="14" cy="13" r="8.5" fill="url(#ab-head)" />
        <circle cx="14" cy="13" r="10" fill="none" stroke="#5de4ff" strokeWidth="0.5" opacity={0.20} />
        <ellipse cx="11.0" cy="12.4" rx="1.55" ry="1.05" fill="#020810" opacity={0.90} />
        <ellipse cx="17.0" cy="12.4" rx="1.55" ry="1.05" fill="#020810" opacity={0.90} />
        <circle cx="11.7" cy="11.8" r="0.46" fill="white" opacity={0.92} />
        <circle cx="17.7" cy="11.8" r="0.46" fill="white" opacity={0.92} />
        <path d="M11.2 14.8 Q14 16.4 16.8 14.8"
          stroke="#020810" strokeWidth="0.70" fill="none" strokeLinecap="round" opacity={0.68} />
        <defs>
          <linearGradient id="ab-bg" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#060e22" />
            <stop offset="100%" stopColor="#07122a" />
          </linearGradient>
          <linearGradient id="ab-bd" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.70" />
            <stop offset="100%" stopColor="#5de4ff" stopOpacity="0.35" />
          </linearGradient>
          <radialGradient id="ab-head" cx="38%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#c4f5ff" />
            <stop offset="52%" stopColor="#5de4ff" />
            <stop offset="100%" stopColor="#2563eb" />
          </radialGradient>
        </defs>
      </motion.svg>

      {showWordmark && (
        <motion.div
          className="aibotics-wordmark"
          style={{ lineHeight: 1 }}
          initial={animate ? { opacity: 0, x: -5 } : undefined}
          animate={animate ? { opacity: 1, x: 0 } : undefined}
          transition={{ duration: 0.38, delay: 0.10, ease: 'easeOut' }}
        >
          <div
            className="aibotics-wordmark-name"
            style={{ fontSize: Math.round(s * 0.54), fontWeight: 800, letterSpacing: '-0.03em' }}
          >
            <span className="aibotics-wordmark-ai">Ai</span>botics
          </div>
        </motion.div>
      )}
    </div>
  );
}
