import { useCallback, useEffect, useRef, useState } from 'react';
import type { LessonStep } from './lesson-types';

type UseLessonAudioOptions = {
  apiBase: string;
  enabled?: boolean;
  voice?: string;
};

/**
 * Manages TTS audio playback synchronized with lesson steps.
 * When a step has narration text, fetches audio from /api/tutor/speak
 * and plays it. Stops audio on step change or pause.
 */
export function useLessonAudio({ apiBase, enabled = true, voice = 'alloy' }: UseLessonAudioOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    if (!audioRef.current && typeof window !== 'undefined') {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('play', () => setIsSpeaking(true));
      audioRef.current.addEventListener('ended', () => setIsSpeaking(false));
      audioRef.current.addEventListener('pause', () => setIsSpeaking(false));
      audioRef.current.addEventListener('canplaythrough', () => setAudioReady(true));
    }
    return cleanup;
  }, [cleanup]);

  const speakStep = useCallback(async (step: LessonStep | null) => {
    cleanup();

    if (!enabled || !step?.narration?.text || !apiBase) return;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${apiBase}/api/tutor/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: step.narration.text, voice }),
        signal: controller.signal,
      });

      if (!response.ok || controller.signal.aborted) return;

      const blob = await response.blob();
      if (controller.signal.aborted) return;

      const url = URL.createObjectURL(blob);
      currentBlobUrlRef.current = url;

      if (audioRef.current) {
        setAudioReady(false);
        audioRef.current.src = url;
        audioRef.current.load();
        await audioRef.current.play().catch(() => {});
      }
    } catch {
      // Fetch aborted or network error — ignore
    }
  }, [apiBase, enabled, voice, cleanup]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {});
  }, []);

  return { speakStep, stop, pause, resume, isSpeaking, audioReady };
}
