'use client';

import { useEffect, useRef } from 'react';
import type { BotEmotion } from '@/lib/lesson-types';

let useRive: typeof import('@rive-app/react-canvas').useRive | null = null;
let useStateMachineInput: typeof import('@rive-app/react-canvas').useStateMachineInput | null = null;

try {
  const rive = require('@rive-app/react-canvas');
  useRive = rive.useRive;
  useStateMachineInput = rive.useStateMachineInput;
} catch {
  // Rive not available — will fall back to emoji avatar
}

const EMOTION_TO_NUMBER: Record<BotEmotion, number> = {
  idle: 0,
  curious: 1,
  excited: 2,
  thinking: 3,
  celebrating: 4,
  encouraging: 5,
};

const RIVE_FILE_PATH = '/assets/sketch-bot.riv';
const STATE_MACHINE_NAME = 'BotEmotions';
const EMOTION_INPUT_NAME = 'emotion';

type RiveBotAvatarProps = {
  emotion: BotEmotion;
  size?: number;
  rivFilePath?: string;
};

/**
 * Rive-powered bot avatar. If the .riv file is not found or Rive fails to load,
 * returns null so the parent can fall back to the emoji BotAvatar.
 *
 * The .riv file should contain a state machine named "BotEmotions" with a
 * Number input named "emotion" that maps to:
 *   0 = idle, 1 = curious, 2 = excited, 3 = thinking, 4 = celebrating, 5 = encouraging
 *
 * To create the .riv file:
 * 1. Go to rive.app (free account)
 * 2. Create a robot character with blend states for each emotion
 * 3. Add a state machine with a Number input controlling transitions
 * 4. Export as .riv and place at public/assets/sketch-bot.riv
 */
export function RiveBotAvatar({ emotion, size = 80, rivFilePath }: RiveBotAvatarProps) {
  const emotionRef = useRef(emotion);
  emotionRef.current = emotion;

  if (!useRive || !useStateMachineInput) return null;

  return (
    <RiveBotInner
      emotion={emotion}
      size={size}
      rivFilePath={rivFilePath ?? RIVE_FILE_PATH}
    />
  );
}

function RiveBotInner({
  emotion,
  size,
  rivFilePath,
}: {
  emotion: BotEmotion;
  size: number;
  rivFilePath: string;
}) {
  const { rive, RiveComponent } = useRive!({
    src: rivFilePath,
    stateMachines: STATE_MACHINE_NAME,
    autoplay: true,
  });

  const emotionInput = useStateMachineInput!(rive, STATE_MACHINE_NAME, EMOTION_INPUT_NAME);

  useEffect(() => {
    if (emotionInput) {
      emotionInput.value = EMOTION_TO_NUMBER[emotion] ?? 0;
    }
  }, [emotion, emotionInput]);

  if (!rive) return null;

  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.35, overflow: 'hidden' }}>
      <RiveComponent style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
