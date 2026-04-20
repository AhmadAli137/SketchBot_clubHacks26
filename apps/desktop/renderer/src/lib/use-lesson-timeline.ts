import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LessonPlan, LessonStep } from './lesson-types';

export type TimelineControls = {
  play: () => void;
  pause: () => void;
  nextStep: () => void;
  prevStep: () => void;
  seekStep: (index: number) => void;
  restart: () => void;
};

export type TimelineState = {
  currentStepIndex: number;
  currentStep: LessonStep | null;
  isPlaying: boolean;
  isComplete: boolean;
  stepElapsed: number;
  stepProgress: number;
  totalProgress: number;
};

export function useLessonTimeline(plan: LessonPlan | null): TimelineState & TimelineControls {
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [stepElapsed, setStepElapsed] = useState(0);

  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const stepElapsedRef = useRef(0);
  const stepIndexRef = useRef(0);

  const steps = useMemo(() => plan?.steps ?? [], [plan]);
  const currentStep = steps[stepIndex] ?? null;

  const currentStepDuration = currentStep
    ? (currentStep.duration_s + (currentStep.delay_s ?? 0)) * 1000
    : 1000;

  const stepProgress = currentStepDuration > 0
    ? Math.min(stepElapsed / currentStepDuration, 1)
    : 0;

  const totalStepsDuration = steps.reduce(
    (sum, s) => sum + (s.duration_s + (s.delay_s ?? 0)) * 1000, 0
  );
  const elapsedBeforeCurrent = steps
    .slice(0, stepIndex)
    .reduce((sum, s) => sum + (s.duration_s + (s.delay_s ?? 0)) * 1000, 0);
  const totalProgress = totalStepsDuration > 0
    ? Math.min((elapsedBeforeCurrent + stepElapsed) / totalStepsDuration, 1)
    : 0;

  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);

  useEffect(() => {
    stepElapsedRef.current = stepElapsed;
  }, [stepElapsed]);

  const advanceStep = useCallback(() => {
    const nextIndex = stepIndexRef.current + 1;
    if (nextIndex >= steps.length) {
      setIsPlaying(false);
      setIsComplete(true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    setStepIndex(nextIndex);
    setStepElapsed(0);
    stepElapsedRef.current = 0;
    lastTickRef.current = performance.now();
  }, [steps.length]);

  const tick = useCallback((now: number) => {
    const dt = now - lastTickRef.current;
    lastTickRef.current = now;

    const step = steps[stepIndexRef.current];
    if (!step) return;

    const dur = (step.duration_s + (step.delay_s ?? 0)) * 1000;
    const next = stepElapsedRef.current + dt;

    if (next >= dur) {
      setStepElapsed(dur);
      advanceStep();
    } else {
      stepElapsedRef.current = next;
      setStepElapsed(next);
    }

    if (rafRef.current !== null) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [steps, advanceStep]);

  const play = useCallback(() => {
    if (!plan || steps.length === 0) return;
    if (isComplete) {
      setStepIndex(0);
      setStepElapsed(0);
      stepElapsedRef.current = 0;
      setIsComplete(false);
    }
    setIsPlaying(true);
    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [plan, steps.length, isComplete, tick]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const nextStep = useCallback(() => {
    if (stepIndexRef.current < steps.length - 1) {
      const next = stepIndexRef.current + 1;
      setStepIndex(next);
      setStepElapsed(0);
      stepElapsedRef.current = 0;
      lastTickRef.current = performance.now();
    }
  }, [steps.length]);

  const prevStep = useCallback(() => {
    if (stepIndexRef.current > 0) {
      setStepIndex(stepIndexRef.current - 1);
      setStepElapsed(0);
      stepElapsedRef.current = 0;
      lastTickRef.current = performance.now();
    }
  }, []);

  const seekStep = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, steps.length - 1));
    setStepIndex(clamped);
    setStepElapsed(0);
    stepElapsedRef.current = 0;
    setIsComplete(false);
    lastTickRef.current = performance.now();
  }, [steps.length]);

  const restart = useCallback(() => {
    pause();
    setStepIndex(0);
    setStepElapsed(0);
    stepElapsedRef.current = 0;
    setIsComplete(false);
  }, [pause]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    restart();
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    currentStepIndex: stepIndex,
    currentStep,
    isPlaying,
    isComplete,
    stepElapsed,
    stepProgress,
    totalProgress,
    play,
    pause,
    nextStep,
    prevStep,
    seekStep,
    restart,
  };
}
