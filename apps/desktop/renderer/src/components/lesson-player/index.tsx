'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, type TargetAndTransition } from 'motion/react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';

import { useLessonTimeline } from '@/lib/use-lesson-timeline';
import { useLessonAudio } from '@/lib/use-lesson-audio';
import type { LessonPlan, LessonStep, BotEmotion } from '@/lib/lesson-types';
import { awardLessonXP, awardQuizXP, scheduleProgressSync } from '@/lib/progress-store';
import { useXPToast } from '@/components/gamification';
import { BotAvatar } from './bot-avatar';
import { QuizStep } from './quiz-step';
import { ChallengeStep } from './challenge-step';

// ─── Step Rail ───────────────────────────────────────────────────────────────

const GAMIFICATION_XP = {
  quiz:      15,  // xp_quiz_correct
  drawing:   10,  // xp_drawing_submitted
  celebrate: 40,  // xp_lesson_completed
} as const;

function getRailLabel(step: LessonStep, narrationsSoFar: number): string {
  if (step.phase) return step.phase;
  switch (step.type) {
    case 'narration': return narrationsSoFar === 0 ? 'Intro' : 'Concept';
    case 'reveal':    return 'Reveal';
    case 'challenge': return 'Try It';
    case 'quiz':      return 'Quiz';
    case 'drawing':   return 'Draw!';
    case 'celebrate': return 'Done!';
    default:          return 'Step';
  }
}

function getRailXP(step: LessonStep): number | null {
  if (step.xp_reward !== undefined) return step.xp_reward;
  return (GAMIFICATION_XP as Record<string, number>)[step.type] ?? null;
}

type StepRailProps = {
  steps: LessonStep[];
  currentStepIndex: number;
  onSeek: (i: number) => void;
};

function LessonStepRail({ steps, currentStepIndex, onSeek }: StepRailProps) {
  const labels = useMemo(() => {
    let n = 0;
    return steps.map(s => {
      const label = getRailLabel(s, s.type === 'narration' ? n : -1);
      if (s.type === 'narration') n++;
      return label;
    });
  }, [steps]);

  return (
    <div className="lesson-step-rail" data-tour="lesson-progress-bar">
      {steps.map((step, i) => {
        const done   = i < currentStepIndex;
        const active = i === currentStepIndex;
        const xp     = active ? getRailXP(step) : null;
        return (
          <Fragment key={step.id}>
            {i > 0 && (
              <div className={`lesson-rail-line${i <= currentStepIndex ? ' filled' : ''}`} />
            )}
            <div className="lesson-rail-node-col">
              <button
                type="button"
                className={`lesson-rail-node${done ? ' done' : active ? ' active' : ''}`}
                onClick={() => onSeek(i)}
                title={`Go to ${labels[i]}`}
              >
                {done ? '✓' : null}
              </button>
              <span className={`lesson-rail-label${done ? ' done' : active ? ' active' : ''}`}>
                {labels[i]}
              </span>
              {xp !== null && (
                <span className="lesson-rail-xp">+{xp} XP</span>
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type LessonPlayerProps = {
  plan: LessonPlan | null;
  onComplete?: () => void;
  onStepChange?: (step: LessonStep, index: number) => void;
  onDrawingRequest?: (prompt: string) => void;
  onChallengeSubmit?: (input: string) => void;
  apiBase?: string;
  studentName?: string;
  onXPChange?: () => void;
  compact?: boolean;
};

const ENTER_VARIANTS: Record<string, TargetAndTransition> = {
  fade: { opacity: 0 },
  'slide-left': { opacity: 0, x: -60 },
  'slide-right': { opacity: 0, x: 60 },
  'slide-up': { opacity: 0, y: 40 },
  'slide-down': { opacity: 0, y: -40 },
  scale: { opacity: 0, scale: 0.85 },
  none: {},
};

const VISIBLE = { opacity: 1, x: 0, y: 0, scale: 1 };

function getEnterVariant(step: LessonStep) {
  return ENTER_VARIANTS[step.transitions?.enter ?? 'fade'] ?? ENTER_VARIANTS.fade;
}

function getExitVariant(step: LessonStep) {
  const exitType = step.transitions?.exit ?? 'fade';
  return ENTER_VARIANTS[exitType] ?? ENTER_VARIANTS.fade;
}

export function LessonPlayer({
  plan,
  onComplete,
  onStepChange,
  onDrawingRequest,
  onChallengeSubmit,
  apiBase = '',
  studentName = '',
  onXPChange,
  compact = false,
}: LessonPlayerProps) {
  const xpToast = useXPToast();
  const timeline = useLessonTimeline(plan);
  const {
    currentStep,
    currentStepIndex,
    isPlaying,
    isComplete,
    stepProgress,
    totalProgress,
    play,
    pause,
    nextStep,
    prevStep,
    restart,
  } = timeline;

  const audio = useLessonAudio({ apiBase, enabled: true });

  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [challengeComplete, setChallengeComplete] = useState(false);

  const stepCount = plan?.steps.length ?? 0;
  const botEmotion: BotEmotion = currentStep?.bot_emotion ?? 'idle';

  useEffect(() => {
    if (currentStep && onStepChange) {
      onStepChange(currentStep, currentStepIndex);
    }
    setQuizAnswer(null);
    setChallengeComplete(false);

    if (currentStep?.narration?.text) {
      void audio.speakStep(currentStep);
    } else {
      audio.stop();
    }
  }, [currentStepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isPlaying) audio.pause();
    else audio.resume();
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentStep?.type === 'drawing' && currentStep.drawing?.prompt && onDrawingRequest) {
      onDrawingRequest(currentStep.drawing.prompt);
    }
  }, [currentStepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

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
    onComplete?.();
  }, [isComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleQuizAnswer = useCallback((index: number) => {
    setQuizAnswer(index);
    const correctIndex = currentStep?.type === 'quiz' ? currentStep.quiz?.correct_index : null;
    if (studentName && correctIndex !== null && correctIndex !== undefined && index === correctIndex) {
      const result = awardQuizXP(studentName);
      if (result) {
        xpToast.push(result.xpAwarded, { reason: 'Quiz correct', emoji: '🧠' });
        scheduleProgressSync(studentName);
        onXPChange?.();
      }
    }
    setTimeout(() => {
      if (isPlaying) nextStep();
    }, 2200);
  }, [isPlaying, nextStep, currentStep, studentName, xpToast, onXPChange]);

  const handleChallengeSubmit = useCallback((input: string) => {
    setChallengeComplete(true);
    onChallengeSubmit?.(input);
    setTimeout(() => {
      if (isPlaying) nextStep();
    }, 1500);
  }, [isPlaying, nextStep, onChallengeSubmit]);

  if (!plan) {
    return (
      <div className="lesson-player-empty">
        <p>No lesson loaded. Select a concept to generate a lesson plan.</p>
      </div>
    );
  }

  return (
    <div className={`lesson-player-root${compact ? ' lesson-player-compact' : ''}`}>
      {/* Named step progress rail */}
      <LessonStepRail
        steps={plan.steps}
        currentStepIndex={currentStepIndex}
        onSeek={timeline.seekStep}
      />

      {/* Bot avatar — hidden in compact mode (shown in dock header instead) */}
      {!compact && (
        <div className="lesson-player-bot">
          <BotAvatar emotion={botEmotion} size={80} />
        </div>
      )}

      {/* Step content area */}
      <div className="lesson-player-stage">
        <AnimatePresence mode="wait">
          {currentStep && (
            <motion.div
              key={`step-${currentStepIndex}`}
              className="lesson-step-content"
              initial={getEnterVariant(currentStep)}
              animate={VISIBLE}
              exit={getExitVariant(currentStep)}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
            >
              {/* Narration */}
              {currentStep.narration && (
                <div className="lesson-narration">
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.3 }}
                  >
                    {currentStep.narration.text}
                  </motion.p>
                </div>
              )}

              {/* Drawing step */}
              {currentStep.type === 'drawing' && currentStep.drawing && (
                <div className="lesson-drawing-indicator">
                  <motion.div
                    className="lesson-drawing-badge"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
                  >
                    <span className="lesson-drawing-icon">🤖✏️</span>
                    <span>Drawing: {currentStep.drawing.prompt}</span>
                  </motion.div>
                </div>
              )}

              {/* Quiz step */}
              {currentStep.type === 'quiz' && currentStep.quiz && (
                <QuizStep
                  quiz={currentStep.quiz}
                  selectedAnswer={quizAnswer}
                  onAnswer={handleQuizAnswer}
                />
              )}

              {/* Challenge step */}
              {currentStep.type === 'challenge' && currentStep.challenge && (
                <ChallengeStep
                  challenge={currentStep.challenge}
                  isComplete={challengeComplete}
                  onSubmit={handleChallengeSubmit}
                />
              )}

              {/* Reveal step */}
              {currentStep.type === 'reveal' && (
                <motion.div
                  className="lesson-reveal"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                >
                  <span className="lesson-reveal-icon">💡</span>
                  {currentStep.narration && <p>{currentStep.narration.text}</p>}
                </motion.div>
              )}

              {/* Celebrate step */}
              {currentStep.type === 'celebrate' && (
                <motion.div
                  className="lesson-celebrate"
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                >
                  <span className="lesson-celebrate-icon">🎉</span>
                  {currentStep.narration && <p>{currentStep.narration.text}</p>}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls bar */}
      <div className="lesson-player-controls">
        <div className="lesson-controls-left">
          <button
            type="button"
            className="lesson-ctrl-btn"
            onClick={prevStep}
            disabled={currentStepIndex === 0}
            title="Previous step"
          >
            <ChevronLeft size={14} />
          </button>

          <button
            type="button"
            className="lesson-ctrl-btn lesson-ctrl-play"
            onClick={isPlaying ? pause : play}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>

          <button
            type="button"
            className="lesson-ctrl-btn"
            onClick={nextStep}
            disabled={currentStepIndex >= stepCount - 1}
            title="Next step"
          >
            <ChevronRight size={14} />
          </button>

          <button
            type="button"
            className="lesson-ctrl-btn"
            onClick={restart}
            title="Restart"
          >
            <RotateCcw size={12} />
          </button>
        </div>

        <div className="lesson-controls-center">
          <div className="lesson-progress-track">
            <motion.div
              className="lesson-progress-fill"
              animate={{ width: `${totalProgress * 100}%` }}
              transition={{ duration: 0.3, ease: 'linear' }}
            />
            {/* Step markers */}
            {plan.steps.map((_, i) => {
              const stepOffset = plan.steps
                .slice(0, i)
                .reduce((sum, s) => sum + s.duration_s + (s.delay_s ?? 0), 0);
              const totalDur = plan.steps.reduce((sum, s) => sum + s.duration_s + (s.delay_s ?? 0), 0);
              const pct = totalDur > 0 ? (stepOffset / totalDur) * 100 : 0;
              return (
                <div
                  key={i}
                  className={`lesson-progress-marker ${i <= currentStepIndex ? 'active' : ''}`}
                  style={{ left: `${pct}%` }}
                  onClick={() => timeline.seekStep(i)}
                  title={`Step ${i + 1}`}
                />
              );
            })}
          </div>
        </div>

        <div className="lesson-controls-right">
          <span className="lesson-step-counter">
            {currentStepIndex + 1} / {stepCount}
          </span>
        </div>
      </div>

      {/* Step progress bar (per-step) */}
      <div className="lesson-step-progress">
        <motion.div
          className="lesson-step-progress-fill"
          animate={{ width: `${stepProgress * 100}%` }}
          transition={{ duration: 0.15, ease: 'linear' }}
        />
      </div>
    </div>
  );
}
