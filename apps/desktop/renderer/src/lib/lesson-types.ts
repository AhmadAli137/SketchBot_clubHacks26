import type { AgeGroup, ConceptLayer } from './concept-types';

// ─── Bot Emotions ────────────────────────────────────────────────────────────

export type BotEmotion =
  | 'idle'
  | 'curious'
  | 'excited'
  | 'thinking'
  | 'celebrating'
  | 'encouraging';

// ─── Lesson Step Types ───────────────────────────────────────────────────────

export type LessonStepType =
  | 'narration'
  | 'drawing'
  | 'challenge'
  | 'reveal'
  | 'quiz'
  | 'celebrate';

export type NarrationPayload = {
  text: string;
  voice_style?: 'warm' | 'energetic' | 'calm' | 'dramatic';
};

export type DrawingPayload = {
  prompt: string;
  svg_content?: string;
};

export type ChallengePayload = {
  instruction: string;
  hints: string[];
  success_criteria: string;
  input_mode?: 'language' | 'blocks' | 'code';
};

export type QuizPayload = {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
};

export type CameraMove = {
  target: 'overview' | 'paper' | 'robot' | 'detail';
  zoom?: number;
  easing?: 'ease-in-out' | 'ease-out' | 'linear';
};

export type StepTransition = {
  enter: 'fade' | 'slide-left' | 'slide-up' | 'scale' | 'none';
  exit: 'fade' | 'slide-right' | 'slide-down' | 'scale' | 'none';
};

export type LessonStep = {
  id: string;
  type: LessonStepType;
  duration_s: number;
  delay_s?: number;
  narration?: NarrationPayload;
  drawing?: DrawingPayload;
  challenge?: ChallengePayload;
  quiz?: QuizPayload;
  bot_emotion?: BotEmotion;
  camera_move?: CameraMove;
  transitions?: StepTransition;
  /** Human-readable phase label shown in the step rail (e.g. "Wall Follow", "Final Run"). */
  phase?: string;
  /** XP awarded on completing this step (shown as a hint in the rail). Overrides default per-type value. */
  xp_reward?: number;
};

// ─── Lesson Plan ─────────────────────────────────────────────────────────────

export type LessonPlan = {
  title: string;
  concept_id: string;
  age_group: AgeGroup;
  layer: ConceptLayer;
  estimated_duration_s: number;
  steps: LessonStep[];
};

// ─── Timeline State ──────────────────────────────────────────────────────────

export type LessonTimelineState = {
  plan: LessonPlan | null;
  currentStepIndex: number;
  isPlaying: boolean;
  isComplete: boolean;
  stepElapsed: number;
  totalElapsed: number;
};
