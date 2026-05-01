'use client';

import { useEffect, useState } from 'react';
import { sparkBehavior, type BehaviorState } from './spark-behavior';

/**
 * Subscribe to the Spark behavior coordinator.
 *
 * Components like tutor-face-mode use this to read the current scene when
 * TTS is silent. Idle detection / event emission happens elsewhere — this
 * hook is read-only.
 */
export function useSparkBehavior(): BehaviorState {
  const [state, setState] = useState<BehaviorState>(() => sparkBehavior.getState());
  useEffect(() => sparkBehavior.subscribe(setState), []);
  return state;
}
