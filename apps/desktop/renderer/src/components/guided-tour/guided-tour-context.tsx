'use client';

import { createContext, useContext } from 'react';
import type { TourFlowId } from '@/lib/guided-tour/types';

export type GuidedTourContextValue = {
  triggerTour: (flow: TourFlowId) => void;
};

export const GuidedTourContext = createContext<GuidedTourContextValue>({
  triggerTour: () => {},
});

export function useGuidedTour(): GuidedTourContextValue {
  return useContext(GuidedTourContext);
}
