'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeft, ChevronRight, Play, Pause, RotateCcw,
  CheckCircle2, X, BookOpen,
} from 'lucide-react';

import { useLessonTimeline } from '@/lib/use-lesson-timeline';
import { useLessonAudio } from '@/lib/use-lesson-audio';
import type { LessonPlan, LessonStep } from '@/lib/lesson-types';
import { awardLessonXP, awardQuizXP, scheduleProgressSync } from '@/lib/progress-store';
import { useXPToast } from '@/components/gamification';
import { BotAvatar } from './bot-avatar';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stepAccent(step: LessonStep): string {
  switch (step.type) {
    case 'drawing':   return 'var(--cyan)';
    case 'challenge': return 'var(--amber)';
    case 'quiz':      return 'var(--violet)';
    case 'celebrate': return 'var(--green)';
    default:          return 'var(--cyan)';
  }
}

function stepTypeLabel(step: LessonStep): string {
  switch (step.type) {
    case 'narration': return '📖 Lesson';
    case 'challenge': return '🎯 Try It';
    case 'drawing':   return '✏️ Drawing';
    case 'quiz':      return '❓ Quiz';
    case 'celebrate': return '🎉 Complete!';
    default:          return '📌 Step';
  }
}

// ─── Intro splash ─────────────────────────────────────────────────────────────

function LessonIntroBanner({ plan, onBegin, reducedMotion }: {
  plan: LessonPlan;
  onBegin: () => void;
  reducedMotion: boolean;
}) {
  return (
    <motion.div
      className="lesson-intro-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      <motion.div
        className="lesson-intro-card"
        initial={reducedMotion ? false : { scale: 0.86, y: 28, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={reducedMotion ? undefined : { scale: 0.92, y: 14, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      >
        <motion.div
          className="lesson-intro-bot"
          animate={reducedMotion ? {} : { y: [0, -10, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <BotAvatar emotion="excited" size={88} />
        </motion.div>

        <div className="lesson-intro-eyebrow">📚 Guided Lesson</div>
        <h2 className="lesson-intro-title">{plan.title}</h2>
        <p className="lesson-intro-desc">
          {plan.steps.length} steps — narration, activities &amp; a challenge at the end. I'll walk you through every one!
        </p>

        <div className="lesson-intro-actions">
          <button type="button" className="lesson-intro-skip" onClick={onBegin}>
            Skip intro
          </button>
          <motion.button
            type="button"
            className="lesson-intro-begin"
            onClick={onBegin}
            whileHover={reducedMotion ? {} : { scale: 1.04 }}
            whileTap={reducedMotion ? {} : { scale: 0.96 }}
          >
            Let's go! <ChevronRight size={15} />
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Right side panel ─────────────────────────────────────────────────────────

function LessonSidePanel({
  plan, step, stepIndex, isPlaying, reducedMotion,
  onPrev, onNext, onPlayPause, onRestart, onDone, onSubmitChallenge, onClose,
}: {
  plan: LessonPlan;
  step: LessonStep;
  stepIndex: number;
  isPlaying: boolean;
  reducedMotion: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onDone: () => void;
  onSubmitChallenge: (v: string) => void;
  onClose: () => void;
}) {
  const [input, setInput]   = useState('');
  const [done, setDone]     = useState(false);
  const isCelebrate         = step.type === 'celebrate';
  const accent              = stepAccent(step);

  useEffect(() => { setInput(''); setDone(false); }, [stepIndex]);

  const handleSubmit = () => {
    setDone(true);
    onSubmitChallenge(input);
  };

  return (
    <motion.div
      className="lesson-panel"
      style={{ '--lesson-accent': accent } as React.CSSProperties}
      initial={reducedMotion ? false : { x: 60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reducedMotion ? undefined : { x: 60, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
    >
      {/* Coloured top accent bar */}
      <div className="lesson-panel-accent-bar" />

      {/* Progress dots */}
      <div className="lesson-panel-rail">
        {plan.steps.map((_, i) => (
          <motion.div
            key={i}
            className={`lesson-panel-dot ${i < stepIndex ? 'done' : i === stepIndex ? 'active' : ''}`}
            animate={i === stepIndex && !reducedMotion ? { scale: [1, 1.4, 1] } : {}}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
        ))}
      </div>

      {/* Header */}
      <div className="lesson-panel-header">
        <span className="lesson-panel-lesson-name">{plan.title}</span>
        <button type="button" className="lesson-panel-close" onClick={onClose} aria-label="Minimize lesson">
          <X size={13} />
        </button>
      </div>

      {/* Bot */}
      <div className="lesson-panel-bot-wrap">
        <motion.div
          animate={reducedMotion ? {} : { y: [0, -8, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <BotAvatar emotion={step.bot_emotion ?? 'idle'} size={isCelebrate ? 72 : 58} />
        </motion.div>
        <div className="lesson-panel-step-num">{stepIndex + 1} / {plan.steps.length}</div>
      </div>

      {/* Content */}
      <div className="lesson-panel-body">
        <div className="lesson-panel-type-tag">{stepTypeLabel(step)}</div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`step-${stepIndex}`}
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            {step.narration && (
              <div className="lesson-panel-speech">
                <p className="lesson-panel-speech-text">{step.narration.text}</p>
              </div>
            )}

            {step.type === 'drawing' && step.drawing && (
              <motion.div
                className="lesson-panel-drawing-tag"
                initial={reducedMotion ? false : { scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.12, type: 'spring', stiffness: 280 }}
              >
                ✏️ Drawing: <strong>{step.drawing.prompt}</strong>
              </motion.div>
            )}

            {step.type === 'challenge' && step.challenge && (
              <div className="lesson-panel-challenge">
                <p className="lesson-panel-challenge-q">{step.challenge.instruction}</p>
                {!done ? (
                  <div className="lesson-panel-challenge-row">
                    <input
                      className="lesson-panel-challenge-input"
                      placeholder="Your answer…"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    />
                    <button type="button" className="lesson-panel-submit-btn" onClick={handleSubmit}>
                      Done
                    </button>
                  </div>
                ) : (
                  <motion.div
                    className="lesson-panel-done-msg"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <CheckCircle2 size={15} /> Nice work!
                  </motion.div>
                )}
              </div>
            )}

            {isCelebrate && (
              <motion.div
                className="lesson-panel-celebrate"
                animate={reducedMotion ? {} : { scale: [1, 1.07, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                🎉 Lesson complete!
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div className="lesson-panel-progress-track">
        <motion.div
          className="lesson-panel-progress-fill"
          animate={{ width: `${((stepIndex + 1) / plan.steps.length) * 100}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Controls */}
      <div className="lesson-panel-controls">
        <button type="button" className="lesson-hud-ctrl" onClick={onPrev} disabled={stepIndex === 0} title="Previous">
          <ChevronLeft size={14} />
        </button>
        <button type="button" className="lesson-hud-ctrl lesson-hud-ctrl-play" onClick={onPlayPause}>
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button type="button" className="lesson-hud-ctrl" onClick={onNext} disabled={stepIndex >= plan.steps.length - 1} title="Next">
          <ChevronRight size={14} />
        </button>
        <button type="button" className="lesson-hud-ctrl" onClick={onRestart} title="Restart">
          <RotateCcw size={12} />
        </button>
        {isCelebrate && (
          <button type="button" className="lesson-panel-finish-btn" onClick={onDone}>
            Finish ✓
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Minimized FAB ────────────────────────────────────────────────────────────

function LessonFab({ stepIndex, stepCount, onReopen }: {
  stepIndex: number;
  stepCount: number;
  onReopen: () => void;
}) {
  return (
    <motion.button
      type="button"
      className="lesson-fab"
      onClick={onReopen}
      title="Resume lesson"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 360, damping: 24 }}
    >
      <BookOpen size={16} />
      <span>{stepIndex + 1} / {stepCount}</span>
    </motion.button>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export type LessonHudProps = {
  plan: LessonPlan | null;
  studentName?: string;
  apiBase?: string;
  reducedMotion?: boolean;
  onDrawingRequest?: (prompt: string) => void;
  onComplete?: () => void;
  onXPChange?: () => void;
};

export function LessonHud({
  plan,
  studentName = '',
  apiBase = '',
  reducedMotion = false,
  onDrawingRequest,
  onComplete,
  onXPChange,
}: LessonHudProps) {
  const xpToast    = useXPToast();
  const timeline   = useLessonTimeline(plan);
  const {
    currentStep, currentStepIndex, isPlaying, isComplete,
    play, pause, nextStep, prevStep, restart,
  } = timeline;

  const audio       = useLessonAudio({ apiBase, enabled: true });
  const drawnRef    = useRef(false);
  const planTitleRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<'intro' | 'panel' | 'fab'>('intro');

  // Reset to intro when a new lesson loads
  useEffect(() => {
    if (plan && plan.title !== planTitleRef.current) {
      planTitleRef.current = plan.title;
      setPhase('intro');
    }
  }, [plan?.title]); // eslint-disable-line

  // Auto-play when lesson first loads
  useEffect(() => {
    if (plan && plan.steps.length > 0) play();
  }, [plan]); // eslint-disable-line

  // Narration TTS on step change
  useEffect(() => {
    if (currentStep?.narration?.text) void audio.speakStep(currentStep);
    else audio.stop();
    drawnRef.current = false;
  }, [currentStepIndex]); // eslint-disable-line

  // Sync audio pause state
  useEffect(() => {
    if (!isPlaying) audio.pause();
    else audio.resume();
  }, [isPlaying]); // eslint-disable-line

  // Fire drawing request once per drawing step
  useEffect(() => {
    if (currentStep?.type === 'drawing' && currentStep.drawing?.prompt && !drawnRef.current) {
      drawnRef.current = true;
      onDrawingRequest?.(currentStep.drawing.prompt);
    }
  }, [currentStepIndex]); // eslint-disable-line

  // XP on lesson complete
  useEffect(() => {
    if (!isComplete) return;
    if (studentName) {
      const result = awardLessonXP(studentName);
      if (result) {
        xpToast.push(result.xpAwarded, { reason: 'Lesson complete', emoji: '📚' });
        scheduleProgressSync(studentName);
        onXPChange?.();
      }
    }
  }, [isComplete]); // eslint-disable-line

  const handleChallengeSubmit = useCallback((input: string) => {
    if (currentStep?.type === 'quiz') {
      const correct = currentStep.quiz?.correct_index;
      const chosen = parseInt(input, 10);
      if (studentName && correct !== undefined && chosen === correct) {
        const result = awardQuizXP(studentName);
        if (result) {
          xpToast.push(result.xpAwarded, { reason: 'Quiz correct', emoji: '🧠' });
          scheduleProgressSync(studentName);
          onXPChange?.();
        }
      }
    }
    setTimeout(() => { if (isPlaying) nextStep(); }, 1600);
  }, [isPlaying, nextStep, currentStep, studentName, xpToast, onXPChange]);

  if (!plan || !currentStep) return null;

  return (
    <div className="lesson-hud-root" aria-label="Lesson guidance">
      <AnimatePresence mode="wait">
        {phase === 'intro' && (
          <LessonIntroBanner
            key="intro"
            plan={plan}
            reducedMotion={reducedMotion}
            onBegin={() => { setPhase('panel'); play(); }}
          />
        )}
        {phase === 'panel' && (
          <LessonSidePanel
            key="panel"
            plan={plan}
            step={currentStep}
            stepIndex={currentStepIndex}
            isPlaying={isPlaying}
            reducedMotion={reducedMotion}
            onPrev={prevStep}
            onNext={nextStep}
            onPlayPause={isPlaying ? pause : play}
            onRestart={restart}
            onDone={() => onComplete?.()}
            onSubmitChallenge={handleChallengeSubmit}
            onClose={() => setPhase('fab')}
          />
        )}
        {phase === 'fab' && (
          <LessonFab
            key="fab"
            stepIndex={currentStepIndex}
            stepCount={plan.steps.length}
            onReopen={() => setPhase('panel')}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
