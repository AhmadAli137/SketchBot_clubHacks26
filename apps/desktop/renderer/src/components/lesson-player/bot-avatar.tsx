'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { BotEmotion } from '@/lib/lesson-types';
import { RiveBotAvatar } from './rive-bot-avatar';

type BotAvatarProps = {
  emotion: BotEmotion;
  size?: number;
};

const EMOTION_CONFIG: Record<BotEmotion, { emoji: string; bg: string; glow: string; bounce: boolean }> = {
  idle: { emoji: '🤖', bg: 'rgba(93,228,255,0.12)', glow: 'rgba(93,228,255,0.2)', bounce: false },
  curious: { emoji: '🤔', bg: 'rgba(107,124,255,0.12)', glow: 'rgba(107,124,255,0.3)', bounce: false },
  excited: { emoji: '🤩', bg: 'rgba(255,184,77,0.12)', glow: 'rgba(255,184,77,0.3)', bounce: true },
  thinking: { emoji: '💭', bg: 'rgba(107,124,255,0.12)', glow: 'rgba(107,124,255,0.2)', bounce: false },
  celebrating: { emoji: '🎉', bg: 'rgba(77,255,184,0.14)', glow: 'rgba(77,255,184,0.35)', bounce: true },
  encouraging: { emoji: '💪', bg: 'rgba(93,228,255,0.12)', glow: 'rgba(93,228,255,0.25)', bounce: false },
};

export function BotAvatar({ emotion, size = 64 }: BotAvatarProps) {
  const [riveFailed, setRiveFailed] = useState(false);
  const config = EMOTION_CONFIG[emotion] ?? EMOTION_CONFIG.idle;

  // Try Rive first; if .riv file isn't available, RiveBotAvatar returns null
  if (!riveFailed) {
    const riveEl = RiveBotAvatar({ emotion, size });
    if (riveEl) return riveEl;
  }

  return (
    <div
      className="bot-avatar-shell"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.35,
        background: config.bg,
        boxShadow: `0 0 ${size * 0.4}px ${config.glow}`,
      }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={emotion}
          className="bot-avatar-emoji"
          style={{ fontSize: size * 0.5 }}
          initial={{ scale: 0.4, opacity: 0, rotate: -15 }}
          animate={{
            scale: 1,
            opacity: 1,
            rotate: 0,
            y: config.bounce ? [0, -4, 0] : 0,
          }}
          exit={{ scale: 0.4, opacity: 0, rotate: 15 }}
          transition={{
            duration: 0.3,
            y: config.bounce
              ? { repeat: Infinity, repeatType: 'loop', duration: 0.8, ease: 'easeInOut' }
              : undefined,
          }}
        >
          {config.emoji}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
