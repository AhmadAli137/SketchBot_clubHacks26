'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type { AuthRole } from '@/components/auth-screen';
import { GuidedTourOverlay, type TourPhase } from '@/components/guided-tour/guided-tour-overlay';
import { GUIDED_TOUR_STORAGE, stepsForFlow, storageKeyForFlow } from '@/lib/guided-tour/config';
import type { TourFlowId } from '@/lib/guided-tour/types';

type AppView = 'auth' | 'home' | 'session';

function readDone(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return true;
  }
}

function persistDone(flow: TourFlowId) {
  try {
    localStorage.setItem(storageKeyForFlow(flow), '1');
  } catch {
    // ignore quota / private mode
  }
}

export function GuidedTourProvider({
  activeView,
  userRole,
  lessonActive = false,
  children,
}: {
  activeView: AppView;
  userRole: AuthRole;
  lessonActive?: boolean;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<TourPhase>(null);

  useEffect(() => {
    setPhase(null);
  }, [activeView]);

  useEffect(() => {
    if (userRole !== 'student') return;
    if (activeView === 'auth') return;

    const delayMs = activeView === 'session' ? 600 : 450;
    const id = window.setTimeout(() => {
      if (activeView === 'home' && !readDone(GUIDED_TOUR_STORAGE.studentHome)) {
        setPhase({ kind: 'intro', flow: 'studentHome' });
      } else if (activeView === 'session' && !readDone(GUIDED_TOUR_STORAGE.studentSession)) {
        setPhase({ kind: 'intro', flow: 'studentSession' });
      }
    }, delayMs);

    return () => window.clearTimeout(id);
  }, [activeView, userRole]);

  // Trigger challenge tour whenever a lesson/challenge is opened in session view
  useEffect(() => {
    if (!lessonActive) return;
    if (userRole !== 'student') return;
    if (activeView !== 'session') return;
    if (readDone(GUIDED_TOUR_STORAGE.challenge)) return;

    const id = window.setTimeout(() => {
      setPhase({ kind: 'intro', flow: 'challenge' });
    }, 900);

    return () => window.clearTimeout(id);
  }, [lessonActive, activeView, userRole]);

  const onSkipIntro = useCallback(() => {
    setPhase((p) => {
      if (p?.kind === 'intro') persistDone(p.flow);
      return null;
    });
  }, []);

  const onProceedIntro = useCallback(() => {
    setPhase((p) => {
      if (p?.kind !== 'intro') return p;
      return { kind: 'steps', flow: p.flow, stepIndex: 0 };
    });
  }, []);

  const onBackdropDismiss = useCallback(() => {
    setPhase((p) => {
      if (p?.kind === 'steps') persistDone(p.flow);
      return null;
    });
  }, []);

  const onStepBack = useCallback(() => {
    setPhase((p) => {
      if (p?.kind !== 'steps') return p;
      if (p.stepIndex === 0) {
        persistDone(p.flow);
        return null;
      }
      return { ...p, stepIndex: p.stepIndex - 1 };
    });
  }, []);

  const onStepNext = useCallback(() => {
    setPhase((p) => {
      if (p?.kind !== 'steps') return p;
      const list = stepsForFlow(p.flow);
      if (p.stepIndex >= list.length - 1) {
        persistDone(p.flow);
        return null;
      }
      return { ...p, stepIndex: p.stepIndex + 1 };
    });
  }, []);

  return (
    <>
      {children}
      <GuidedTourOverlay
        phase={phase}
        onSkipIntro={onSkipIntro}
        onProceedIntro={onProceedIntro}
        onBackdropDismiss={onBackdropDismiss}
        onStepBack={onStepBack}
        onStepNext={onStepNext}
      />
    </>
  );
}
