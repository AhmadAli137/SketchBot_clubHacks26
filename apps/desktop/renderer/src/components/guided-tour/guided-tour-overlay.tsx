'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronLeft, SkipForward } from 'lucide-react';

import { stepsForFlow, markTourDone } from '@/lib/guided-tour/config';
import type { TourFlowId, TourStep } from '@/lib/guided-tour/types';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

type IntroPhase  = { kind: 'intro';  flow: TourFlowId };
type StepsPhase  = { kind: 'steps'; flow: TourFlowId; stepIndex: number };
export type TourPhase = IntroPhase | StepsPhase | null;

export type GuidedTourOverlayProps = {
  phase: TourPhase;
  onSkipIntro: () => void;
  onProceedIntro: () => void;
  onBackdropDismiss: () => void;
  onStepBack: () => void;
  onStepNext: () => void;
};

const CARD_W = 360;
const CARD_H_EST = 240;
const GAP = 16;

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

// ─── Spotlight rect from a target element ────────────────────────────────────
type SpotRect = { x: number; y: number; w: number; h: number };

function useSpotlight(step: TourStep | null, padding = 10): SpotRect | null {
  const [rect, setRect] = useState<SpotRect | null>(null);

  const measure = useCallback(() => {
    if (!step || !step.targetSelector || step.placement === 'center') { setRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.targetSelector}"]`);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    const pad = padding + (step.spotlightPadding ?? 0);
    setRect({ x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 });
  }, [step, padding]);

  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => {
    if (!step) return;
    const h = () => measure();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => { window.removeEventListener('resize', h); window.removeEventListener('scroll', h, true); };
  }, [step, measure]);

  return rect;
}

// ─── Card position relative to spotlight ─────────────────────────────────────
function useCardPos(step: TourStep | null, spot: SpotRect | null) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const compute = useCallback(() => {
    if (!step) { setPos(null); return; }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (step.placement === 'center' || !spot) {
      setPos({ top: vh / 2 - CARD_H_EST / 2, left: vw / 2 - CARD_W / 2 });
      return;
    }
    const place = step.placement ?? 'bottom';
    let top = 0, left = 0;
    if (place === 'bottom') { top = spot.y + spot.h + GAP; left = spot.x + spot.w / 2 - CARD_W / 2; }
    else if (place === 'top') { top = spot.y - CARD_H_EST - GAP; left = spot.x + spot.w / 2 - CARD_W / 2; }
    else if (place === 'left') { left = spot.x - CARD_W - GAP; top = spot.y + spot.h / 2 - CARD_H_EST / 2; }
    else if (place === 'right') { left = spot.x + spot.w + GAP; top = spot.y + spot.h / 2 - CARD_H_EST / 2; }
    left = clamp(left, 12, vw - CARD_W - 12);
    top  = clamp(top, 12, vh - CARD_H_EST - 12);
    setPos({ top, left });
  }, [step, spot]);

  useLayoutEffect(() => { compute(); }, [compute]);
  useEffect(() => {
    if (!step) return;
    const h = () => compute();
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [step, compute]);

  return pos;
}

// ─── Mini Spark tutor in the card ────────────────────────────────────────────
function MiniSpark() {
  return (
    <div className="tour-spark-mini">
      {/* Hand orbs */}
      <motion.div className="tour-spark-hand tour-spark-hand--l" animate={{ y: [0, -4, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }} />
      <motion.div className="tour-spark-hand tour-spark-hand--r" animate={{ y: [0, -3, 0] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }} />
      {/* Character body */}
      <motion.div className="tour-spark-char" animate={{ y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
        {/* Head */}
        <div className="tour-spark-head">
          <div className="tour-spark-stripe" />
          <div className="tour-spark-eyes">
            <motion.div className="tour-spark-eye" animate={{ scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 3.5, repeat: Infinity, times: [0, 0.84, 0.88, 1] }} />
            <motion.div className="tour-spark-eye" animate={{ scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 3.5, repeat: Infinity, times: [0, 0.84, 0.88, 1], delay: 0.06 }} />
          </div>
          <motion.div className="tour-spark-mouth" animate={{ scaleX: [0.7, 1, 0.7] }} transition={{ duration: 1.6, repeat: Infinity }} />
        </div>
        {/* Neck */}
        <div className="tour-spark-neck" />
        {/* Orb body */}
        <motion.div className="tour-spark-body" animate={{ scaleX: [1, 1.04, 1], scaleY: [1, 0.97, 1] }} transition={{ duration: 2.2, repeat: Infinity }} >
          <div className="tour-spark-body-ring">
            <motion.div className="tour-spark-body-orbit" animate={{ rotate: 360 }} transition={{ duration: 5, repeat: Infinity, ease: 'linear' }} />
          </div>
          <div className="tour-spark-body-glow" />
        </motion.div>
        {/* Shadow */}
        <motion.div className="tour-spark-shadow" animate={{ scaleX: [1, 0.8, 1], opacity: [0.3, 0.12, 0.3] }} transition={{ duration: 3, repeat: Infinity }} />
      </motion.div>
    </div>
  );
}

// ─── Animated click cursor ────────────────────────────────────────────────────
function ClickCursor({ spot }: { spot: SpotRect }) {
  const cx = spot.x + spot.w / 2;
  const cy = spot.y + spot.h / 2;
  return (
    <motion.div
      className="tour-click-cursor"
      style={{ left: cx - 20, top: cy - 20 }}
      animate={{ scale: [0.8, 1.2, 0.9, 1.1, 1], opacity: [0.6, 1, 0.8, 1, 0.6] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="16" stroke="white" strokeWidth="2" strokeOpacity="0.9" />
        <circle cx="20" cy="20" r="6" fill="white" fillOpacity="0.95" />
        {/* Ripple rings */}
        <motion.circle
          cx="20" cy="20"
          stroke="rgba(93,228,255,0.8)" strokeWidth="2" fill="none"
          initial={{ r: 16, opacity: 0.8 }}
          animate={{ r: [16, 26], opacity: [0.8, 0] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      </svg>
      <div className="tour-click-label">click</div>
    </motion.div>
  );
}

// ─── Spotlight SVG cutout ─────────────────────────────────────────────────────
function SpotlightMask({ spot, color }: { spot: SpotRect | null; color?: string }) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  const r = 16;

  if (!spot) return null;

  return (
    <svg
      className="tour-spotlight-svg"
      width={vw}
      height={vh}
      viewBox={`0 0 ${vw} ${vh}`}
    >
      <defs>
        <mask id="tour-spot-mask">
          <rect width={vw} height={vh} fill="white" />
          <rect
            x={spot.x}
            y={spot.y}
            width={spot.w}
            height={spot.h}
            rx={r}
            ry={r}
            fill="black"
          />
        </mask>
      </defs>
      {/* Dark overlay with cutout */}
      <rect width={vw} height={vh} fill="rgba(5,8,22,0.72)" mask="url(#tour-spot-mask)" />
      {/* Spotlight ring */}
      <rect
        x={spot.x}
        y={spot.y}
        width={spot.w}
        height={spot.h}
        rx={r}
        ry={r}
        fill="none"
        stroke={color ?? 'rgba(93,228,255,0.6)'}
        strokeWidth="2"
      />
    </svg>
  );
}

// ─── Main overlay ─────────────────────────────────────────────────────────────
export function GuidedTourOverlay({
  phase, onSkipIntro, onProceedIntro, onBackdropDismiss, onStepBack, onStepNext,
}: GuidedTourOverlayProps) {
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const stepsPhase  = phase?.kind === 'steps' ? phase : null;
  const introPhase  = phase?.kind === 'intro'  ? phase : null;
  const steps       = stepsPhase ? stepsForFlow(stepsPhase.flow) : [];
  const step        = stepsPhase ? steps[stepsPhase.stepIndex] ?? null : null;
  const spot        = useSpotlight(step, 10);
  const cardPos     = useCardPos(step, spot);

  // Scroll target into view
  useEffect(() => {
    if (!step?.targetSelector) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.targetSelector}"]`);
    if (!el) return;
    try { el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); } catch { el.scrollIntoView(); }
  }, [step, reduced]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* ─── Intro modal ─── */}
      <AnimatePresence>
        {introPhase && (
          <motion.div
            key="tour-intro-bg"
            className="tour-bg"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div
              className="tour-intro-modal"
              initial={{ opacity: 0, scale: 0.88, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: 'spring', damping: 20, stiffness: 220 }}
            >
              {/* Tutor character */}
              <div className="tour-intro-spark-wrap">
                <MiniSpark />
              </div>
              <div className="tour-intro-body">
                <div className="tour-intro-label">✨ Quick tour</div>
                <h2 className="tour-intro-title">
                  {introPhase.flow === 'planPicker' ? 'Welcome to AIbotics!' :
                   introPhase.flow === 'studentSession' ? 'New to this workspace?' :
                   introPhase.flow === 'progressMap' ? 'Your learning map awaits!' :
                   introPhase.flow === 'challenge' ? 'Challenge time!' :
                   'Want a quick walkthrough?'}
                </h2>
                <p className="tour-intro-desc">
                  {introPhase.flow === 'planPicker'
                    ? "I'm Spark, your AI tutor! Let me show you what AIbotics can do — takes about 30 seconds."
                    : introPhase.flow === 'studentSession'
                    ? "Let me show you the key controls and features — it'll only take a minute!"
                    : introPhase.flow === 'progressMap'
                    ? "I'll walk you through the map, chests, Sparks, and the Avatar Shop."
                    : introPhase.flow === 'challenge'
                    ? "New challenge? Let me explain the rules and scoring before you start."
                    : "I'll highlight the key areas — you can skip anytime."}
                </p>
                <div className="tour-intro-actions">
                  <button type="button" className="tour-btn-ghost" onClick={onSkipIntro}>
                    <SkipForward size={14} /> Skip
                  </button>
                  <button type="button" className="tour-btn-primary" onClick={onProceedIntro}>
                    Show me! <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Step walkthrough ─── */}
      <AnimatePresence>
        {stepsPhase && step && (
          <>
            {/* Spotlight overlay */}
            <motion.div
              key="tour-step-overlay"
              className="tour-step-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onBackdropDismiss}
            >
              {/* SVG spotlight cutout — only when targeting a specific element */}
              <AnimatePresence>
                {spot && (
                  <motion.div
                    key={`spot-${step.id}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <SpotlightMask spot={spot} color={step.spotlightColor} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Plain dim when center/no target */}
              {!spot && step.placement === 'center' && (
                <div className="tour-step-dim" />
              )}
            </motion.div>

            {/* Click cursor on target */}
            <AnimatePresence>
              {step.showClickCursor && spot && (
                <motion.div
                  key={`cursor-${step.id}`}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.25, delay: 0.3 }}
                >
                  <ClickCursor spot={spot} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tour card */}
            <AnimatePresence mode="wait">
              {cardPos && (
                <motion.div
                  key={`tour-card-${step.id}`}
                  className="tour-card"
                  style={{ top: cardPos.top, left: cardPos.left, width: CARD_W }}
                  initial={{ opacity: 0, y: 10, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Close X */}
                  <button type="button" className="tour-card-close" onClick={onBackdropDismiss} aria-label="Close tour">
                    <X size={14} />
                  </button>

                  <div className="tour-card-inner">
                    {/* Mini Spark tutor */}
                    <div className="tour-card-spark">
                      <MiniSpark />
                    </div>

                    <div className="tour-card-content">
                      {/* Tutor speech bubble */}
                      {step.tutorSpeech && (
                        <motion.div
                          className="tour-tutor-speech"
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15 }}
                        >
                          {step.tutorSpeech}
                        </motion.div>
                      )}

                      {/* Step header */}
                      <div className="tour-card-header">
                        {step.emoji && <span className="tour-card-emoji">{step.emoji}</span>}
                        <h3 className="tour-card-title">{step.title}</h3>
                      </div>

                      {/* Step body */}
                      <p className="tour-card-body">{step.body}</p>

                      {/* Progress dots */}
                      <div className="tour-progress-dots">
                        {steps.map((_, i) => (
                          <motion.div
                            key={i}
                            className={`tour-dot ${i === stepsPhase.stepIndex ? 'active' : i < stepsPhase.stepIndex ? 'done' : ''}`}
                            animate={i === stepsPhase.stepIndex ? { scale: [1, 1.3, 1] } : {}}
                            transition={{ duration: 0.4 }}
                          />
                        ))}
                      </div>

                      {/* Navigation */}
                      <div className="tour-card-nav">
                        <button
                          type="button"
                          className="tour-btn-ghost"
                          onClick={onStepBack}
                        >
                          {stepsPhase.stepIndex === 0 ? (
                            <><X size={13} /> End tour</>
                          ) : (
                            <><ChevronLeft size={13} /> Back</>
                          )}
                        </button>
                        <motion.button
                          type="button"
                          className="tour-btn-primary"
                          onClick={onStepNext}
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.96 }}
                        >
                          {stepsPhase.stepIndex >= steps.length - 1 ? (
                            'Finish! 🎉'
                          ) : (
                            <>Next <ChevronRight size={13} /></>
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </div>

                  {/* Step counter badge */}
                  <div className="tour-step-count">
                    {stepsPhase.stepIndex + 1} / {steps.length}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
