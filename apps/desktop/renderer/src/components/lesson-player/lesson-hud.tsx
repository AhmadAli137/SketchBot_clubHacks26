'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw, CheckCircle2 } from 'lucide-react';

import { useLessonTimeline } from '@/lib/use-lesson-timeline';
import { useLessonAudio } from '@/lib/use-lesson-audio';
import type { LessonPlan, LessonStep } from '@/lib/lesson-types';
import { awardLessonXP, awardQuizXP, scheduleProgressSync } from '@/lib/progress-store';
import { useXPToast } from '@/components/gamification';
import { BotAvatar } from './bot-avatar';

// ─── Step type metadata ───────────────────────────────────────────────────────

function stepLabel(step: LessonStep, narrationIndex: number): string {
  if (step.phase) return step.phase;
  switch (step.type) {
    case 'narration': return narrationIndex === 0 ? 'Intro' : 'Concept';
    case 'challenge': return 'Try It';
    case 'quiz':      return 'Quiz';
    case 'drawing':   return 'Draw!';
    case 'celebrate': return 'Done!';
    default:          return 'Step';
  }
}

function stepAccent(step: LessonStep): string {
  switch (step.type) {
    case 'drawing':   return 'var(--cyan)';
    case 'challenge': return 'var(--amber)';
    case 'quiz':      return 'var(--violet)';
    case 'celebrate': return 'var(--green)';
    default:          return 'var(--cyan)';
  }
}

// ─── Step Rail ────────────────────────────────────────────────────────────────

type RailProps = {
  steps: LessonStep[];
  currentIndex: number;
  onSeek: (i: number) => void;
  reducedMotion: boolean;
};

function HudStepRail({ steps, currentIndex, onSeek, reducedMotion }: RailProps) {
  let narrationCount = 0;
  const labels = steps.map((s) => {
    const label = stepLabel(s, s.type === 'narration' ? narrationCount : -1);
    if (s.type === 'narration') narrationCount++;
    return label;
  });

  return (
    <div className="lesson-hud-rail">
      {steps.map((step, i) => {
        const done   = i < currentIndex;
        const active = i === currentIndex;
        return (
          <Fragment key={step.id}>
            {i > 0 && (
              <motion.div
                className="lesson-hud-rail-line"
                animate={{ scaleX: done || active ? 1 : 0.2, opacity: done ? 1 : 0.25 }}
                transition={{ duration: reducedMotion ? 0 : 0.4, ease: 'easeOut' }}
                style={{ transformOrigin: 'left' }}
              />
            )}
            <button
              type="button"
              className="lesson-hud-rail-node-col"
              onClick={() => onSeek(i)}
              title={labels[i]}
            >
              <motion.div
                className={`lesson-hud-rail-dot${done ? ' done' : active ? ' active' : ''}`}
                animate={active && !reducedMotion ? {
                  boxShadow: [
                    '0 0 0 0 rgba(93,228,255,0.5)',
                    '0 0 0 6px rgba(93,228,255,0)',
                    '0 0 0 0 rgba(93,228,255,0)',
                  ],
                } : {}}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              >
                {done && <CheckCircle2 size={9} strokeWidth={3} />}
              </motion.div>
              <span className={`lesson-hud-rail-label${active ? ' active' : done ? ' done' : ''}`}>
                {labels[i]}
              </span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── Floating card ────────────────────────────────────────────────────────────

type CardProps = {
  step: LessonStep;
  stepIndex: number;
  stepCount: number;
  stepProgress: number;
  isPlaying: boolean;
  reducedMotion: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onDone: () => void;
  onSubmitChallenge: (input: string) => void;
};

function HudCard({
  step, stepIndex, stepCount, stepProgress, isPlaying, reducedMotion,
  onPrev, onNext, onPlayPause, onRestart, onDone, onSubmitChallenge,
}: CardProps) {
  const [challengeInput, setChallengeInput] = useState('');
  const [challengeDone, setChallengeDone] = useState(false);

  useEffect(() => {
    setChallengeInput('');
    setChallengeDone(false);
  }, [stepIndex]);

  const handleChallengeSubmit = () => {
    setChallengeDone(true);
    onSubmitChallenge(challengeInput);
  };

  const isCelebrate = step.type === 'celebrate';
  const accent = stepAccent(step);

  return (
    <motion.div
      className="lesson-hud-card"
      style={{ '--lesson-accent': accent } as React.CSSProperties}
      layout
    >
      {/* Step progress bar */}
      <div className="lesson-hud-card-progress">
        <motion.div
          className="lesson-hud-card-progress-fill"
          animate={{ width: `${stepProgress * 100}%` }}
          transition={{ duration: 0.12, ease: 'linear' }}
        />
      </div>

      {/* Card body */}
      <div className="lesson-hud-card-body">
        {/* Bot avatar + step badge */}
        <div className="lesson-hud-card-avatar-col">
          <BotAvatar
            emotion={step.bot_emotion ?? 'idle'}
            size={isCelebrate ? 44 : 36}
          />
          <span className="lesson-hud-card-step-badge">
            {stepIndex + 1}/{stepCount}
          </span>
        </div>

        {/* Content */}
        <div className="lesson-hud-card-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={`step-${stepIndex}`}
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {/* Narration / celebrate */}
              {step.narration && (
                <p className="lesson-hud-card-text">
                  {step.narration.text}
                </p>
              )}

              {/* Drawing indicator */}
              {step.type === 'drawing' && step.drawing && (
                <motion.div
                  className="lesson-hud-drawing-badge"
                  initial={reducedMotion ? false : { scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15, type: 'spring', stiffness: 280, damping: 22 }}
                >
                  <span>🤖✏️</span>
                  <span>Drawing: <strong>{step.drawing.prompt}</strong></span>
                </motion.div>
              )}

              {/* Challenge instruction */}
              {step.type === 'challenge' && step.challenge && (
                <div className="lesson-hud-challenge">
                  <p className="lesson-hud-challenge-instruction">
                    {step.challenge.instruction}
                  </p>
                  {!challengeDone ? (
                    <div className="lesson-hud-challenge-actions">
                      <input
                        className="lesson-hud-challenge-input"
                        placeholder="Type your answer or reflection…"
                        value={challengeInput}
                        onChange={(e) => setChallengeInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleChallengeSubmit(); }}
                      />
                      <button type="button" className="lesson-hud-challenge-btn" onClick={handleChallengeSubmit}>
                        Done
                      </button>
                    </div>
                  ) : (
                    <motion.div
                      className="lesson-hud-challenge-done"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <CheckCircle2 size={16} />
                      Nice work!
                    </motion.div>
                  )}
                </div>
              )}

              {/* Celebrate */}
              {isCelebrate && (
                <motion.div
                  className="lesson-hud-celebrate"
                  animate={reducedMotion ? {} : { scale: [1, 1.05, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <span>🎉</span>
                  <span>Lesson complete!</span>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Controls */}
      <div className="lesson-hud-card-controls">
        <button type="button" className="lesson-hud-ctrl" onClick={onPrev} disabled={stepIndex === 0} title="Previous">
          <ChevronLeft size={13} />
        </button>
        <button type="button" className="lesson-hud-ctrl lesson-hud-ctrl-play" onClick={onPlayPause} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button type="button" className="lesson-hud-ctrl" onClick={onNext} disabled={stepIndex >= stepCount - 1} title="Next">
          <ChevronRight size={13} />
        </button>
        <button type="button" className="lesson-hud-ctrl" onClick={onRestart} title="Restart">
          <RotateCcw size={11} />
        </button>
        <div style={{ flex: 1 }} />
        {isCelebrate && (
          <button type="button" className="lesson-hud-finish-btn" onClick={onDone}>
            Finish lesson
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main HUD ─────────────────────────────────────────────────────────────────

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
  const xpToast = useXPToast();
  const timeline = useLessonTimeline(plan);
  const {
    currentStep, currentStepIndex, isPlaying, isComplete,
    stepProgress, play, pause, nextStep, prevStep, restart, seekStep,
  } = timeline;

  const audio = useLessonAudio({ apiBase, enabled: true });
  const drawnRef = useRef(false);

  // Auto-play when lesson first loads
  useEffect(() => {
    if (plan && plan.steps.length > 0) play();
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  // Speak on step change
  useEffect(() => {
    if (currentStep?.narration?.text) void audio.speakStep(currentStep);
    else audio.stop();
    drawnRef.current = false;
  }, [currentStepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause audio when not playing
  useEffect(() => {
    if (!isPlaying) audio.pause();
    else audio.resume();
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger drawing prompt once per drawing step
  useEffect(() => {
    if (currentStep?.type === 'drawing' && currentStep.drawing?.prompt && !drawnRef.current) {
      drawnRef.current = true;
      onDrawingRequest?.(currentStep.drawing.prompt);
    }
  }, [currentStepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Award XP on complete
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
  }, [isComplete]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {/* Step progress rail — top of workspace */}
      <motion.div
        className="lesson-hud-rail-wrap"
        initial={reducedMotion ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reducedMotion ? undefined : { opacity: 0, y: -12 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <HudStepRail
          steps={plan.steps}
          currentIndex={currentStepIndex}
          onSeek={seekStep}
          reducedMotion={reducedMotion}
        />
      </motion.div>

      {/* Floating lesson card — bottom of workspace */}
      <AnimatePresence>
        <motion.div
          key="hud-card-wrap"
          className="lesson-hud-card-wrap"
          initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: 16, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        >
          <HudCard
            step={currentStep}
            stepIndex={currentStepIndex}
            stepCount={plan.steps.length}
            stepProgress={stepProgress}
            isPlaying={isPlaying}
            reducedMotion={reducedMotion}
            onPrev={prevStep}
            onNext={nextStep}
            onPlayPause={isPlaying ? pause : play}
            onRestart={restart}
            onDone={() => onComplete?.()}
            onSubmitChallenge={handleChallengeSubmit}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
