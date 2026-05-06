'use client';

import Link from 'next/link';
import Image from 'next/image';
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
            Voice-activated AI robotics
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
            SaySpark is a voice-activated AI robotics learning studio where
            students describe ideas, test them in a simulator, and watch Spark
            Mini bring them to life.
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
          <div className="hero-product-visual" aria-label="Spark tutor and Spark Mini product concept">
            <Image
              src="/assets/brand/sayspark-robot-rover-light-transparent.png"
              alt="Spark AI tutor running beside Spark Mini"
              width={584}
              height={584}
              priority
              className="hero-product-image"
            />
            <div className="hero-product-chip hero-product-chip-ai">Spark AI Tutor</div>
            <div className="hero-product-chip hero-product-chip-mini">Spark Mini</div>
          </div>
          <AppPreview />
        </motion.div>
      </div>
    </section>
  );
}
