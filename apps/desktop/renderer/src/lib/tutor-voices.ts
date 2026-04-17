/**
 * Sketch's voice catalog. These are the kid-friendly character voices that the
 * student can choose between. Voice IDs map to ElevenLabs voices defined in
 * the backend (see `services/local-runtime/app/api/tutor.py`).
 */

export type TutorVoice = {
  id: string;
  alias: 'mark' | 'lori';
  label: string;
  emoji: string;
  description: string;
};

export const TUTOR_VOICES: TutorVoice[] = [
  {
    id: 'UgBBYS2sOqTuMpoF3BR0',
    alias: 'mark',
    label: 'Mark',
    emoji: '🧑‍🚀',
    description: 'Friendly, upbeat guy',
  },
  {
    id: 'TbMNBJ27fH2U0VgpSNko',
    alias: 'lori',
    label: 'Lori',
    emoji: '👩‍🏫',
    description: 'Warm, encouraging woman',
  },
];

export const DEFAULT_TUTOR_VOICE: TutorVoice = TUTOR_VOICES[0];

const STORAGE_KEY = 'sketchbot.tutor.voiceId';

export function loadSavedVoice(): TutorVoice {
  if (typeof window === 'undefined') return DEFAULT_TUTOR_VOICE;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_TUTOR_VOICE;
    return TUTOR_VOICES.find((v) => v.id === saved) ?? DEFAULT_TUTOR_VOICE;
  } catch {
    return DEFAULT_TUTOR_VOICE;
  }
}

export function saveVoice(voice: TutorVoice): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, voice.id);
  } catch {
    // ignore
  }
}
