// Shared lesson plan types — mirrors desktop's lesson-types.ts

export type AgeGroup = 'explorer' | 'builder' | 'engineer';
export type ConceptLayer = 'intuitive' | 'structural' | 'precise';

export type BotEmotion =
  | 'idle'
  | 'curious'
  | 'excited'
  | 'thinking'
  | 'celebrating'
  | 'encouraging';

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
};

export type LessonPlan = {
  title: string;
  concept_id: string;
  age_group: AgeGroup;
  layer: ConceptLayer;
  estimated_duration_s: number;
  steps: LessonStep[];
};
