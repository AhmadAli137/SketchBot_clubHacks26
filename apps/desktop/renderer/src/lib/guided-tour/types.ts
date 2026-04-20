export type TourFlowId =
  | 'studentSession'
  | 'studentHome'
  | 'planPicker'
  | 'progressMap'
  | 'challenge'
  | 'lessonPlayer'
  | 'blockEditor'
  | 'simPlayground';

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Value of `data-tour` on the target element (or null for center-modal steps) */
  targetSelector: string | null;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** Show an animated click cursor on the target */
  showClickCursor?: boolean;
  /** Highlight color override for spotlight ring */
  spotlightColor?: string;
  /** Extra padding around the spotlight rect */
  spotlightPadding?: number;
  /** Tutor says this — shown as speech before body text */
  tutorSpeech?: string;
  /** Optional emoji accent in the step card */
  emoji?: string;
};
