'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { SparkRobot } from '@/components/spark-robot';

const SCENES: { scene: number; speech: string }[] = [
  { scene: 0, speech: "Hi! I'm Spark — your AI robotics tutor!" },
  { scene: 1, speech: "Let me show you how robots plan their path…" },
  { scene: 2, speech: "You solved it! That's kinematics!" },
  { scene: 3, speech: "You're a natural engineer — keep going!" },
];

export function HeroSection() {
  const [idx, setIdx] = useState(0);
  const current = SCENES[idx]!;

  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % SCENES.length), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="hero-section">
      {/* Ambient orbs */}
      <div className="hero-orbs" aria-hidden>
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
      </div>

      <div className="container hero-inner">
        {/* Left: copy */}
        <div className="hero-copy">
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <span className="hero-badge-dot" />
            AI-powered robotics education — live in classrooms
          </motion.div>

          <motion.h1
            className="display-1 hero-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            The robot that teaches kids to think{' '}
            <span className="grad-text">like engineers</span>
          </motion.h1>

          <motion.p
            className="body-lg hero-sub"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            SketchBot draws on paper while Spark — a Claude-powered AI tutor — explains
            the engineering behind every stroke. Words, blocks, or Python: every age
            learns at their level.
          </motion.p>

          <motion.div
            className="hero-cta-row"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.28 }}
          >
            <Link href="/sign-up" className="btn btn-primary btn-lg">
              Start for free
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href="/pricing" className="btn btn-outline btn-lg">See pricing</Link>
            <a href="#demo" className="btn btn-ghost">Watch the demo ↓</a>
          </motion.div>

          <motion.div
            className="hero-proof"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="hero-proof-avatars">
              {['🧒', '👧', '🧑‍💻', '👩‍🏫', '🧑‍🔬'].map((e, i) => (
                <span key={i} className="hero-proof-avatar" style={{ zIndex: 5 - i }}>{e}</span>
              ))}
            </div>
            <span className="hero-proof-text">Used by students &amp; teachers in classrooms worldwide</span>
          </motion.div>

          {/* Feature chips */}
          <motion.div
            className="hero-chips"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {['⚙️ Real hardware', '🏆 Compete & win', '✨ Spark AI tutor', '📱 Camera Buddy app'].map(c => (
              <span key={c} className="hero-chip">{c}</span>
            ))}
          </motion.div>
        </div>

        {/* Right: Spark */}
        <motion.div
          className="hero-spark-side"
          initial={{ opacity: 0, scale: 0.88, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="hero-spark-stage">
            {/* Scene glow bg */}
            <AnimatePresence mode="wait">
              <motion.div
                key={current.scene}
                className={`spark3d-scene-bg spark3d-bg--${['welcome','guide','celebrate','adapt'][current.scene]}`}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.7 }} aria-hidden
              />
            </AnimatePresence>

            <SparkRobot
              mode="3d"
              size="xl"
              scene={current.scene}
              showSpeech={current.speech}
              speechKey={idx}
            />

            {/* Scene dots */}
            <div className="hero-spark-dots">
              {SCENES.map((_, i) => (
                <button
                  key={i}
                  className={`hero-spark-dot${i === idx ? ' active' : ''}`}
                  onClick={() => setIdx(i)}
                  aria-label={`Scene ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
