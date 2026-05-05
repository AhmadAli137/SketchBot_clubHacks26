'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { AppPreview } from '@/components/home/app-preview';

export function HeroSection() {
  return (
    <section className="hero-section">
      <div className="container hero-inner">
        <div className="hero-copy">
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <span className="hero-badge-dot" />
            AI-tutored classroom robotics
          </motion.div>

          <motion.h1
            className="display-1 hero-title"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            A robot that teaches kids to think{' '}
            <span className="grad-text">like engineers.</span>
          </motion.h1>

          <motion.p
            className="body-lg hero-sub"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
          >
            SaySpark draws on paper while a Claude-powered tutor explains the
            engineering behind every stroke. Words, blocks, or Python — every
            student works at their level.
          </motion.p>

          <motion.div
            className="hero-cta-row"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.22 }}
          >
            <Link href="/sign-up" className="btn btn-primary btn-lg">
              Start for free
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href="/pricing" className="btn btn-outline btn-lg">See pricing</Link>
          </motion.div>
        </div>

        <motion.div
          className="hero-spark-side"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <AppPreview />
        </motion.div>
      </div>
    </section>
  );
}
