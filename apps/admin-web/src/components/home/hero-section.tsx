'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SparkRobot } from '@/components/spark-robot';

const HeroScene3D = dynamic(
  () => import('./hero-scene-3d').then(m => ({ default: m.HeroScene3D })),
  { ssr: false },
);

const SPEECHES = [
  "Hi! I'm Spark — your AI robotics tutor!",
  "Let me show you how robots think...",
  "You solved it! That's kinematics!",
  "You're a natural engineer — keep going!",
] as const;

export function HeroSection() {
  const [speechIdx, setSpeechIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSpeechIdx(i => (i + 1) % SPEECHES.length), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="hero-full">
      {/* Left: 3D scene */}
      <div className="hero-scene-col">
        <HeroScene3D />

        {/* Text overlay bottom-left */}
        <div className="hero-text-overlay">
          <motion.h1
            className="hero-overlay-title"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            Learn robotics <span className="hero-overlay-accent">by doing</span>
          </motion.h1>
          <motion.p
            className="hero-overlay-sub"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            Real robots. Real code. Real challenges.
          </motion.p>
          <motion.div
            className="hero-chips"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            <span className="hero-chip">⚙️ Real hardware</span>
            <span className="hero-chip">🏆 Compete &amp; win</span>
            <span className="hero-chip">✨ AI Tutor</span>
          </motion.div>
        </div>
      </div>

      {/* Right: Spark + CTAs */}
      <div className="hero-cta-col">
        {/* Spark */}
        <motion.div
          className="hero-spark-wrap"
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <SparkRobot mode="3d" size="lg" scene={speechIdx % 4} showSpeech={SPEECHES[speechIdx]} speechKey={speechIdx} />
        </motion.div>

        <motion.div
          className="hero-spark-name"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <span className="hero-spark-label">Spark</span>
          <span className="hero-spark-tag">AI TUTOR</span>
        </motion.div>

        {/* CTA panel */}
        <motion.div
          className="hero-panel"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="hero-panel-label">HOW DO YOU WANT TO PLAY?</div>

          <Link href="/sign-up" className="hero-option">
            <div className="hero-option-icon">✨</div>
            <div className="hero-option-text">
              <div className="hero-option-title">Just Play</div>
              <div className="hero-option-sub">Sandbox mode — free draw, no account needed.</div>
            </div>
            <div className="hero-option-arrow">→</div>
          </Link>

          <Link href="/sign-up" className="hero-option">
            <div className="hero-option-icon">🎓</div>
            <div className="hero-option-text">
              <div className="hero-option-title">Personal Tutor</div>
              <div className="hero-option-sub">AI lessons with Spark, XP, badges, progress sync.</div>
            </div>
            <div className="hero-option-arrow">→</div>
          </Link>

          <Link href="/sign-in" className="hero-option">
            <div className="hero-option-icon">👥</div>
            <div className="hero-option-text">
              <div className="hero-option-title">Join a Class</div>
              <div className="hero-option-sub">Enter your teacher&apos;s room code.</div>
            </div>
            <div className="hero-option-arrow">→</div>
          </Link>

          <Link href="/sign-in" className="hero-teacher-link">I&apos;m a Teacher →</Link>
        </motion.div>
      </div>
    </section>
  );
}
