'use client';

import Link from 'next/link';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef } from 'react';

export function HeroSection() {
  return (
    <section className="hero-section">
      {/* Animated orbs */}
      <div className="hero-orbs">
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
      </div>

      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ display: 'flex', justifyContent: 'center' }}
        >
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            AI-powered robotics education — now in classrooms
          </div>
        </motion.div>

        {/* Title */}
        <motion.h1
          className="display-1 hero-title"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          The robot that teaches{' '}
          <span className="grad-text">kids to think</span>{' '}
          like engineers
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="body-lg hero-sub"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          SketchBot is a drawing robot with an AI tutor built in. Students describe what they want
          to draw — in words, blocks, or Python — and the robot shows them the engineering behind every stroke.
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="hero-cta"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.32, ease: 'easeOut' }}
        >
          <Link href="/sign-up" className="btn btn-primary">
            Start for free
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <Link href="/pricing" className="btn btn-outline">See pricing</Link>
          <Link href="#what" className="btn btn-ghost">How it works ↓</Link>
        </motion.div>

        {/* Robot visual card */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.44, ease: [0.22, 1, 0.36, 1] }}
        >
          <RobotVisual />
        </motion.div>
      </div>
    </section>
  );
}

function RobotVisual() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [4, -4]), { stiffness: 120, damping: 22 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-4, 4]), { stiffness: 120, damping: 22 });
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className="robot-visual"
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 1200 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="robot-visual-inner">
        <div className="robot-svg-wrap">
          <AnimatedDrawing />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', padding: '0 16px' }}>
            {[
              { color: '#4f8eff', label: 'Robot connected' },
              { color: '#10b981', label: 'Drawing in progress' },
              { color: '#8b5cf6', label: 'AI tutor active' },
            ].map(({ color, label }) => (
              <div key={label} className="visual-tag">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AnimatedDrawing() {
  const pathLen = useMotionValue(0);

  useEffect(() => {
    let start: number;
    let raf: number;
    const duration = 3200;

    const animate = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      pathLen.set(progress);
      if (progress < 1) raf = requestAnimationFrame(animate);
      else {
        // loop
        setTimeout(() => {
          start = 0;
          pathLen.set(0);
          raf = requestAnimationFrame(animate);
        }, 1400);
      }
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [pathLen]);

  const pathD = "M 200 160 C 230 120 270 110 290 130 C 310 150 305 185 280 200 C 255 215 220 210 200 190 C 180 170 178 140 195 120 C 212 100 240 95 265 102 C 290 109 308 125 312 148 C 316 171 305 196 285 208 C 265 220 238 220 215 210 C 192 200 178 180 175 158";

  return (
    <svg
      viewBox="0 0 500 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', maxWidth: 520 }}
    >
      <defs>
        <pattern id="hgrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(79,142,255,0.08)" strokeWidth="0.6"/>
        </pattern>
        <linearGradient id="hPathGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4f8eff"/>
          <stop offset="50%" stopColor="#8b5cf6"/>
          <stop offset="100%" stopColor="#22d3ee"/>
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <rect width="500" height="320" fill="url(#hgrid)"/>

      {/* Axes */}
      <path d="M 30 290 L 470 290 M 30 290 L 30 20" stroke="rgba(79,142,255,0.18)" strokeWidth="1"/>
      <text x="475" y="294" fontSize="10" fill="rgba(107,122,158,0.7)" fontFamily="monospace">X</text>
      <text x="22" y="16" fontSize="10" fill="rgba(107,122,158,0.7)" fontFamily="monospace">Y</text>

      {/* Grid tick marks */}
      {[80,130,180,230,280,330,380,430].map(x => (
        <line key={x} x1={x} y1="287" x2={x} y2="293" stroke="rgba(79,142,255,0.2)" strokeWidth="0.8"/>
      ))}
      {[60,110,160,210,260].map(y => (
        <line key={y} x1="27" y1={y} x2="33" y2={y} stroke="rgba(79,142,255,0.2)" strokeWidth="0.8"/>
      ))}

      {/* AprilTag corners */}
      {([[42,22],[454,22],[42,272],[454,272]] as [number,number][]).map(([cx, cy], i) => (
        <g key={i}>
          <rect x={cx-8} y={cy-8} width="16" height="16" fill="rgba(245,158,11,0.06)" stroke="rgba(245,158,11,0.35)" strokeWidth="1"/>
          <rect x={cx-4} y={cy-4} width="8" height="8" fill="rgba(245,158,11,0.15)"/>
        </g>
      ))}

      {/* Previous faded trace */}
      <path
        d="M 150 200 Q 175 155 200 148 Q 225 141 235 160 Q 245 179 230 195"
        stroke="rgba(79,142,255,0.15)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Animated main path */}
      <motion.path
        d={pathD}
        stroke="url(#hPathGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        filter="url(#glow)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{
          duration: 3.2,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatDelay: 1.4,
          repeatType: 'loop',
        }}
      />

      {/* Robot body — animates along path end */}
      <motion.g
        animate={{
          cx: [200, 290, 280, 200, 175, 200],
          cy: [160, 130, 200, 190, 158, 160],
        }}
        transition={{
          duration: 3.2,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatDelay: 1.4,
        }}
      >
        {/* We fake the robot as a fixed position for simplicity since animating along path needs GSAP */}
      </motion.g>

      {/* Robot at approx path end - glowing dot */}
      <motion.circle
        cx={312}
        cy={148}
        r={7}
        fill="#4f8eff"
        filter="url(#glow)"
        animate={{ opacity: [1, 0.6, 1], r: [7, 9, 7] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.circle
        cx={312}
        cy={148}
        r={16}
        fill="none"
        stroke="rgba(79,142,255,0.25)"
        strokeWidth="1.5"
        animate={{ r: [16, 22, 16], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Coord label */}
      <motion.g
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 1.4, times: [0, 0.15, 0.85, 1] }}
      >
        <rect x="320" y="134" width="72" height="22" rx="6" fill="rgba(11,14,26,0.85)" stroke="rgba(79,142,255,0.25)" strokeWidth="1"/>
        <text x="328" y="149" fontSize="9" fill="rgba(79,142,255,0.9)" fontFamily="monospace">(282, 144) mm</text>
      </motion.g>

      {/* Pen-down indicator */}
      <motion.rect
        x="298" y="102"
        width="48" height="18" rx="5"
        fill="rgba(16,185,129,0.1)"
        stroke="rgba(16,185,129,0.3)"
        strokeWidth="1"
      />
      <text x="306" y="115" fontSize="8" fill="rgba(16,185,129,0.8)" fontFamily="monospace">PEN DOWN</text>
    </svg>
  );
}
