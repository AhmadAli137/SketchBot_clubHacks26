'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

import { SparkRobot } from '@/components/spark-robot';

const SCENES = [
  { scene: 0, speech: "Hi! I'm Spark — your AI robotics tutor!" },
  { scene: 1, speech: 'Let me show you how robots think...' },
  { scene: 2, speech: 'You solved it! That\'s kinematics!' },
  { scene: 3, speech: "You're a natural engineer — keep going!" },
] as const;

const BG_KEYS = ['welcome', 'guide', 'celebrate', 'adapt'] as const;

export function HeroSection() {
  const [sceneIdx, setSceneIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSceneIdx(i => (i + 1) % SCENES.length), 4000);
    return () => clearInterval(id);
  }, []);

  const current = SCENES[sceneIdx];

  return (
    <section className="hero-section hero-split">
      <div className="hero-orbs">
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
      </div>

      <div className="container hero-split-inner">
        {/* ── Left: text ── */}
        <div className="hero-text-col">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="hero-badge">
              <span className="hero-badge-dot" />
              AI-powered robotics education — now in classrooms
            </div>
          </motion.div>

          <motion.h1
            className="display-1 hero-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            style={{ textAlign: 'left', marginBottom: 20 }}
          >
            The robot that teaches{' '}
            <span className="grad-text">kids to think</span>{' '}
            like engineers
          </motion.h1>

          <motion.p
            className="body-lg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ maxWidth: 500, marginBottom: 36 }}
          >
            SketchBot draws on paper while its AI tutor — Spark — explains
            the engineering behind every stroke. Words, blocks, or Python:
            every age learns their way.
          </motion.p>

          <motion.div
            className="hero-cta"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.32 }}
            style={{ justifyContent: 'flex-start' }}
          >
            <Link href="/sign-up" className="btn btn-primary">
              Start for free
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <Link href="/pricing" className="btn btn-outline">See pricing</Link>
            <Link href="#demo" className="btn btn-ghost" style={{ fontSize: '0.9rem' }}>Watch demo ↓</Link>
          </motion.div>

          {/* Social proof */}
          <motion.div
            className="hero-proof"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
          >
            <div className="hero-proof-avatars">
              {['🧒', '👧', '🧑‍💻', '👩‍🏫', '🧑‍🔬'].map((e, i) => (
                <span key={i} className="hero-proof-avatar" style={{ zIndex: 5 - i }}>{e}</span>
              ))}
            </div>
            <span className="hero-proof-text">Loved by students &amp; teachers everywhere</span>
          </motion.div>
        </div>

        {/* ── Right: Spark ── */}
        <motion.div
          className="hero-spark-col"
          initial={{ opacity: 0, scale: 0.88, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.85, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="hero-spark-stage">
            {/* Animated background per scene */}
            <AnimatePresence mode="wait">
              <motion.div
                key={BG_KEYS[current.scene]}
                className={`hero-spark-bg spark3d-bg--${BG_KEYS[current.scene]}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7 }}
                aria-hidden
              />
            </AnimatePresence>

            <SparkRobot
              mode="3d"
              size="xl"
              scene={current.scene}
              showSpeech={current.speech}
              speechKey={sceneIdx}
            />

            {/* Scene dot indicators */}
            <div className="hero-spark-dots">
              {SCENES.map((_, i) => (
                <button
                  key={i}
                  className={`hero-spark-dot${i === sceneIdx ? ' active' : ''}`}
                  onClick={() => setSceneIdx(i)}
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
