import type { Challenge, ChallengeStep } from './platform-types';
import type { LessonPlan, LessonStep, BotEmotion } from './lesson-types';
import type { AgeGroup, ConceptLayer } from './concept-types';

function stepEmotion(s: ChallengeStep): BotEmotion {
  if (s.robotAction) return 'excited';
  if (s.reflectionQuestion) return 'thinking';
  return 'curious';
}

function challengeStepToLessonSteps(s: ChallengeStep, isLast: boolean): LessonStep[] {
  const out: LessonStep[] = [];
  const dur = s.durationHint ?? 30;

  // Tutor narration
  if (s.tutorMessage) {
    out.push({
      id: `${s.id}-narration`,
      type: 'narration',
      duration_s: s.robotAction ? Math.min(dur, 40) : dur,
      narration: { text: s.tutorMessage, voice_style: 'warm' },
      bot_emotion: stepEmotion(s),
      transitions: { enter: 'slide-up', exit: 'fade' },
    });
  }

  // Robot drawing action
  if (s.robotAction?.type === 'draw-prompt') {
    const prompt = String(s.robotAction.payload?.prompt ?? '');
    out.push({
      id: `${s.id}-drawing`,
      type: 'drawing',
      duration_s: 90,
      drawing: { prompt },
      bot_emotion: 'excited',
      transitions: { enter: 'scale', exit: 'fade' },
    });
  }

  // Student prompt / reflection
  const instruction = s.reflectionQuestion ?? s.studentPrompt;
  if (instruction) {
    out.push({
      id: `${s.id}-challenge`,
      type: 'challenge',
      duration_s: 60,
      challenge: {
        instruction,
        hints: s.hint ? [s.hint] : [],
        success_criteria: 'Student reflects and confirms.',
      },
      bot_emotion: 'thinking',
      transitions: { enter: 'slide-left', exit: 'fade' },
    });
  }

  // Final step gets a celebrate node
  if (isLast) {
    out.push({
      id: `${s.id}-celebrate`,
      type: 'celebrate',
      duration_s: 10,
      bot_emotion: 'celebrating',
      transitions: { enter: 'scale', exit: 'fade' },
    });
  }

  return out;
}

export function challengeToLessonPlan(
  challenge: Challenge,
  ageGroup: AgeGroup = 'builder',
  layer: ConceptLayer = 'intuitive',
): LessonPlan {
  const steps: LessonStep[] = challenge.steps.flatMap((s, i) =>
    challengeStepToLessonSteps(s, i === challenge.steps.length - 1),
  );

  const estimatedSeconds = challenge.steps.reduce(
    (sum, s) => sum + (s.durationHint ?? 30),
    0,
  ) + 15;

  return {
    title: challenge.title,
    concept_id: challenge.packId,
    age_group: ageGroup,
    layer,
    estimated_duration_s: estimatedSeconds,
    steps,
  };
}
