'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Download, Lightbulb, Mic, MicOff, RefreshCw, RotateCcw, Send, Square, TrendingUp, Volume2, VolumeX, WifiOff, X, MessageSquare, Video } from 'lucide-react';

import { TutorFaceMode } from '@/components/tutor-face-mode';
import { AGE_GROUP_META, LAYER_META, type AgeGroup, type ConceptLayer } from '@/lib/concept-types';
import { ROBOT_LAB_CONCEPT_IDS } from '@/lib/concept-catalog';
import { concatFloat32, pcmToWavBlob, resamplePcmTo16k } from '@/lib/audio-utils';
import { useLocalWhisper } from '@/lib/use-local-whisper';
import {
  TUTOR_VOICES,
  DEFAULT_TUTOR_VOICE,
  loadSavedVoice,
  saveVoice,
  type TutorVoice,
} from '@/lib/tutor-voices';
import {
  BADGE_DEFINITIONS,
  applyTutorEvaluation,
  awardBadge,
  completeConceptLayer,
  getConceptProgressSnapshot,
  touchConcept,
  type ConceptProgressSnapshot,
} from '@/lib/progress-store';
import type { ClassroomRestrictions } from '@/lib/platform-types';
import { effectiveMaxHints } from '@/lib/classroom-restrictions';
import { CLOUD_API_URL, cloudHeaders, useCloudAuthToken } from '@/lib/cloud-api';
import { emitSparkEvent, onSparkEvent } from '@/lib/spark-events';
import { useSparkTick } from '@/lib/use-spark-tick';
import { sparkBehavior } from '@/lib/spark-behavior';
import { appendSessionSummary } from '@/lib/spark-memory';
import { useInterjectionTracker, trackInterjectionStart } from '@/lib/use-interjection-tracker';
import { useTutorWebSocket } from '@/lib/use-tutor-websocket';
import { MSG_RESTART, MSG_SPEAK, MSG_TOOL_CALL, MSG_THINKING } from '@/lib/tutor-ws-protocol';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TutorMessage = {
  id: string;
  role: 'tutor' | 'student';
  content: string;
  isStreaming?: boolean;
};

type TutorPanelProps = {
  studentName: string;
  ageGroup: AgeGroup;
  conceptId: string | null;
  conceptTitle: string;
  activeLayer: ConceptLayer;
  apiBase: string;
  drawingPrompt?: string | null;
  pathCount?: number;
  backendReachable: boolean;
  onLayerChange: (layer: ConceptLayer) => void;
  onXPChange?: () => void;
  /** When teacher is in session, tutor uses educator-oriented prompts and audit prefix. */
  sessionActorRole?: 'teacher' | 'student';
  lessonPlanActive?: boolean;
  classroomRestrictions?: ClassroomRestrictions | null;
  /** Active SavedSession id — when set, chat is loaded from and persisted to this session. */
  sessionId?: string | null;
  /** Hide Academy-only affordances (Hint, Go Deeper, layer pills) in sandbox sessions. */
  isSandbox?: boolean;
  /**
   * Build the situational-awareness context (rendered text) for tutor calls.
   * Provided by the parent because scene state lives there. The parent
   * passes a function that takes optional supplements (chat, prompt) and
   * builds the full context. Called fresh on every trigger so the AI
   * always sees current state.
   */
  getContextText?: (extras?: {
    chatExcerpt?: Array<{ role: 'tutor' | 'student'; content: string }>;
    activeDrawingPrompt?: string | null;
    lastPathCount?: number | null;
  }) => string;
  /**
   * Optional structured snapshot for the local response log — feeds the
   * future "hard-code common patterns" optimization. See lib/spark-response-log.ts.
   */
  getContextSignature?: () => { objectCount: number; objectTypes: string[] };
};

type EvaluationNotice = {
  passed: boolean;
  feedback: string;
  suggestNextLayer: boolean;
  nextLayerAvailable: ConceptLayer | null;
  awardedBadges: string[];
  mastered: boolean;
  xpAwarded: number;
  leveledUp: boolean;
  newLevel: number;
  scoreDetails?: { score: number; creativity: number; concept_alignment: number; complexity: number };
};

const LAYERS: ConceptLayer[] = ['intuitive', 'structural', 'precise'];

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Voice input: direct PCM capture + Whisper ───────────────────────────────
//
// Electron has no usable Web Speech API, so we ship our own voice pipeline.
// We capture raw Float32 PCM via Web Audio (MediaStreamSource → ScriptProcessor)
// instead of MediaRecorder, for two reasons:
//
//   1. Live partials: we can transcribe the accumulated samples mid-recording
//      without needing a well-formed WebM/Opus container. decodeAudioData of
//      an unfinished MediaRecorder chunk is flaky; raw Float32 never is.
//   2. Fewer formats: one in-memory PCM buffer feeds both the local Whisper
//      worker and (after WAV encoding) the server-side OpenAI upload.
//
// The stream is resampled to 16 kHz (Whisper's expected rate) before being
// sent to the local worker. Partials fire every 1.5 s on the running buffer
// once the local model is ready.

type VoiceInputOptions = {
  localWhisper: ReturnType<typeof useLocalWhisper>;
  backendReachable: boolean;
  /** `null` = not yet probed; `true`/`false` = latest known status. */
  backendSttAvailable: boolean | null;
  /** Called whenever the backend STT should be flagged unavailable at runtime. */
  onBackendSttUnavailable?: () => void;
  /** Called when a live partial transcript is ready during recording. */
  onPartialTranscript?: (text: string) => void;
};

const MAX_RECORDING_MS = 30_000;
/**
 * Max audio window (native sample rate) fed into local Whisper for *partial*
 * transcriptions. Longer audio = slower inference. Final transcription on
 * stop still uses the full buffer for accuracy.
 */
const PARTIAL_WINDOW_SECONDS = 12;

function useVoiceInput(
  onTranscript: (text: string) => void,
  apiBase: string,
  options: VoiceInputOptions,
) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [usedLocal, setUsedLocal] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Audio graph refs — kept out of state because they change during capture.
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const nativeRateRef = useRef<number>(48_000);

  const partialTimerRef = useRef<number | null>(null);
  const partialInFlightRef = useRef(false);
  const recordingRef = useRef(false);
  const startTimestampRef = useRef<number>(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const apiBaseRef = useRef(apiBase);
  apiBaseRef.current = apiBase;

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const stopPartialTimer = useCallback(() => {
    if (partialTimerRef.current !== null) {
      window.clearInterval(partialTimerRef.current);
      partialTimerRef.current = null;
    }
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  /** Tear down the audio graph and release the mic. Safe to call multiple times. */
  const teardownAudioGraph = useCallback(() => {
    try { processorNodeRef.current?.disconnect(); } catch { /* noop */ }
    try { sourceNodeRef.current?.disconnect(); } catch { /* noop */ }
    try { audioCtxRef.current?.close(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());

    processorNodeRef.current = null;
    sourceNodeRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;
  }, []);

  /**
   * Snapshot the currently buffered PCM as a 16 kHz Float32Array. Pass
   * `windowSeconds` to limit to the tail of the buffer (used for partials so
   * long recordings don't grind Whisper to a halt).
   */
  const snapshotPcm16k = useCallback(async (windowSeconds?: number): Promise<Float32Array> => {
    const native = concatFloat32(pcmChunksRef.current);
    if (native.length === 0) return native;
    const rate = nativeRateRef.current;
    const limit = windowSeconds && windowSeconds > 0
      ? Math.min(native.length, Math.floor(rate * windowSeconds))
      : native.length;
    const slice = native.subarray(native.length - limit);
    return resamplePcmTo16k(slice, rate);
  }, []);

  const runPartial = useCallback(async () => {
    const { localWhisper } = optionsRef.current;
    if (!localWhisper.isReady) return;
    if (partialInFlightRef.current) return;
    if (!recordingRef.current) return;
    const bufferedSamples = pcmChunksRef.current.reduce((s, c) => s + c.length, 0);
    if (bufferedSamples < nativeRateRef.current * 0.6) return;

    partialInFlightRef.current = true;
    try {
      // Bounded window keeps partial latency flat regardless of utterance
      // length. We still show the previous partial in the UI while this runs,
      // so the student never sees a regression.
      const pcm = await snapshotPcm16k(PARTIAL_WINDOW_SECONDS);
      if (!recordingRef.current) return;
      if (pcm.length < 16_000 * 0.4) return;
      const text = await localWhisper.transcribe(pcm);
      if (!recordingRef.current) return;
      const trimmed = text?.trim();
      if (trimmed) {
        optionsRef.current.onPartialTranscript?.(trimmed);
      }
    } catch (err) {
      console.debug('[VoiceInput] partial transcription skipped:', err);
    } finally {
      partialInFlightRef.current = false;
    }
  }, [snapshotPcm16k]);

  const finalizeAndTranscribe = useCallback(async () => {
    setIsTranscribing(true);
    try {
      const { localWhisper, backendReachable, backendSttAvailable, onBackendSttUnavailable } = optionsRef.current;
      const pcm16k = await snapshotPcm16k();
      if (pcm16k.length === 0) return;

      const backendUsable =
        backendReachable &&
        backendSttAvailable !== false &&
        Boolean(apiBaseRef.current);

      const tryLocal = async () => {
        if (!localWhisper.isReady) return false;
        setUsedLocal(true);
        // Final transcription uses the full buffer — partial's sliding
        // window was just for latency, here we want accuracy.
        const text = await localWhisper.transcribe(pcm16k);
        if (text?.trim()) onTranscriptRef.current(text.trim());
        return true;
      };

      if (!backendUsable) {
        if (!(await tryLocal())) {
          console.warn('[VoiceInput] no transcription path available (local model not ready yet)');
        }
        return;
      }

      try {
        setUsedLocal(false);
        const wav = pcmToWavBlob(pcm16k, 16_000);
        const fd = new FormData();
        fd.append('audio', wav, 'recording.wav');
        const res = await fetch(`${apiBaseRef.current}/api/tutor/transcribe`, {
          method: 'POST',
          body: fd,
        });

        if (!res.ok) {
          let errInfo = '';
          try {
            const errBody = (await res.json()) as { error?: string };
            errInfo = errBody.error ?? '';
          } catch { /* body may not be JSON */ }
          console.warn('[VoiceInput] backend transcribe returned', res.status, errInfo);
          onBackendSttUnavailable?.();
          await tryLocal();
          return;
        }

        const data = (await res.json()) as { text?: string; error?: string };
        const text = data.text?.trim();
        if (text) {
          onTranscriptRef.current(text);
        } else {
          await tryLocal();
        }
      } catch (err) {
        console.warn('[VoiceInput] backend transcription failed, trying local:', err);
        onBackendSttUnavailable?.();
        await tryLocal();
      }
    } catch (err) {
      console.warn('[VoiceInput] transcription failed:', err);
    } finally {
      setIsTranscribing(false);
    }
  }, [snapshotPcm16k]);

  const stopListening = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    stopPartialTimer();
    stopElapsedTimer();
    setIsListening(false);
    setElapsedMs(0);

    // Tear the audio graph down before transcribing so the mic indicator
    // turns off immediately.
    teardownAudioGraph();
    void finalizeAndTranscribe();
  }, [finalizeAndTranscribe, stopElapsedTimer, stopPartialTimer, teardownAudioGraph]);

  /** Cancel recording without firing transcription. Used for the "clear" button. */
  const cancelListening = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    stopPartialTimer();
    stopElapsedTimer();
    setIsListening(false);
    setElapsedMs(0);
    setIsTranscribing(false);
    pcmChunksRef.current = [];
    teardownAudioGraph();
  }, [stopElapsedTimer, stopPartialTimer, teardownAudioGraph]);

  const startListening = useCallback(async () => {
    if (recordingRef.current) return;

    // Kick off the local model download early so it's ready for the next
    // utterance (or available as a fallback if the backend fails).
    const { localWhisper } = optionsRef.current;
    if (localWhisper.status === 'idle') {
      try { localWhisper.loadModel(); } catch { /* noop */ }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;
      pcmChunksRef.current = [];

      const AudioCtx: typeof AudioContext =
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      nativeRateRef.current = ctx.sampleRate || 48_000;

      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      // ScriptProcessorNode is deprecated but ubiquitous and requires no
      // separate worklet file — good tradeoff for a local desktop app.
      const bufferSize = 4096;
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
      processorNodeRef.current = processor;
      processor.onaudioprocess = (e) => {
        if (!recordingRef.current) return;
        const input = e.inputBuffer.getChannelData(0);
        // Must copy — the buffer is recycled by the Web Audio graph.
        pcmChunksRef.current.push(new Float32Array(input));
      };

      source.connect(processor);
      // Connecting to destination is required in some browsers to pump the
      // graph even though we don't want to hear ourselves — a muted gain
      // keeps it silent without dropping events.
      const muted = ctx.createGain();
      muted.gain.value = 0;
      processor.connect(muted);
      muted.connect(ctx.destination);

      recordingRef.current = true;
      setIsListening(true);
      startTimestampRef.current = Date.now();
      setElapsedMs(0);

      stopPartialTimer();
      stopElapsedTimer();
      // Faster partials (every 800 ms) combined with the sliding window
      // keeps inference cheap but the feedback frequent.
      partialTimerRef.current = window.setInterval(() => {
        void runPartial();
      }, 800);
      elapsedTimerRef.current = window.setInterval(() => {
        if (!recordingRef.current) return;
        setElapsedMs(Date.now() - startTimestampRef.current);
      }, 200);
      autoStopTimerRef.current = window.setTimeout(() => {
        // Hard cap the utterance to keep Whisper fast and avoid runaway mics.
        console.info('[VoiceInput] hit 30s cap — auto-stopping');
        stopListening();
      }, MAX_RECORDING_MS);
    } catch (err) {
      console.warn('[VoiceInput] mic access failed:', err);
      recordingRef.current = false;
      setIsListening(false);
      setElapsedMs(0);
      teardownAudioGraph();
    }
  }, [runPartial, stopElapsedTimer, stopListening, stopPartialTimer, teardownAudioGraph]);

  useEffect(() => () => {
    recordingRef.current = false;
    stopPartialTimer();
    stopElapsedTimer();
    teardownAudioGraph();
  }, [stopElapsedTimer, stopPartialTimer, teardownAudioGraph]);

  return {
    isListening,
    isTranscribing,
    usedLocal,
    elapsedMs,
    maxMs: MAX_RECORDING_MS,
    startListening,
    stopListening,
    cancelListening,
  };
}

// ─── Text-to-speech hook ──────────────────────────────────────────────────────
//
// Primary path: backend streams MP3 from ElevenLabs (character voices like
// Mark/Lori). Fallback: Web Speech API when backend is unreachable.
//
// We support *chunked* playback: instead of waiting for the full tutor
// message before calling ElevenLabs (which means waiting for ~100 tokens of
// streamed text AND then a full MP3 synthesis), we split the message into
// sentence chunks as they stream in and queue each chunk independently.
// The first audible word therefore lands within a few hundred ms of the
// first sentence being complete.

const TTS_ENABLED_STORAGE_KEY = 'sketchbot.tutor.ttsEnabled';

/**
 * Max characters sent to TTS per tutor reply (one stream or one-shot).
 * Keep in sync with `TTS_SPOKEN_CHAR_BUDGET` in
 * services/local-runtime/app/services/tutor_service.py (model is instructed there too).
 */
const TTS_MAX_SPOKEN_CHARS = 380;

/** Matches a line that is exactly --- between newlines (spoken vs text-only sections). */
const SPOKEN_DETAIL_DELIM = /(?:\r\n|\r|\n)---\s*(?:\r\n|\r|\n)/;

/** Text before the first --- is all that TTS should read (see tutor_service prompts). */
function extractSpokenChannel(text: string): string {
  const s = text.trim();
  const m = SPOKEN_DETAIL_DELIM.exec(s);
  if (m) return s.slice(0, m.index).trim();
  return s;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*] /gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

/**
 * Split a (possibly still-streaming) block of text into complete sentence
 * chunks plus a tail of "not yet terminated" text. Callers keep appending to
 * the message and we emit chunks as their terminators arrive.
 *
 * Returns `{ chunks, rest }` where `rest` is the suffix without a sentence
 * terminator yet.
 */
function splitIntoSentences(text: string): { chunks: string[]; rest: string } {
  if (!text) return { chunks: [], rest: '' };
  const chunks: string[] = [];
  // Match up to a sentence-ending punctuation followed by whitespace or EOS.
  // Keep the punctuation with the chunk.
  const re = /[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g;
  const pieces = text.match(re) ?? [];
  for (const piece of pieces) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    if (/[.!?]$/.test(trimmed)) {
      chunks.push(trimmed);
    } else {
      return { chunks, rest: trimmed };
    }
  }
  return { chunks, rest: '' };
}

/** Fit `text` into at most `maxLen` characters, preferring a word boundary (reduces clipped TTS). */
function fitTtsSegment(text: string, maxLen: number): string {
  const t = text.trim();
  if (maxLen <= 0 || !t) return '';
  if (t.length <= maxLen) return t;
  let s = t.slice(0, maxLen);
  const lastSpace = s.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.35 && lastSpace > 0) {
    s = s.slice(0, lastSpace);
  } else if (lastSpace > 0) {
    s = s.slice(0, lastSpace);
  }
  return s.trimEnd();
}

function countWords(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

type TTSOptions = {
  apiBase: string;
  cloudApiBase: string;
  authToken: string | null;
  backendReachable: boolean;
};

type QueueItem = {
  id: number;
  text: string;
  ageGroup: AgeGroup;
  /** Tutor bubble id this audio belongs to (for karaoke highlight). */
  messageId: string;
  /** Global word index of first word in this chunk (within the utterance). */
  wordOffset: number;
  wordCount: number;
  /** Pre-fetched MP3 blob URL (primed during streaming for minimum latency). */
  primedUrl?: string | null;
  primePromise?: Promise<string | null>;
};

export type TutorTtsHighlight = {
  messageId: string | null;
  /** Index into whitespace-split words of the spoken plain text for that message. */
  activeWordIndex: number;
};

function useTTS({ apiBase, cloudApiBase, authToken, backendReachable }: TTSOptions) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(TTS_ENABLED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [voice, setVoiceState] = useState<TutorVoice>(() => loadSavedVoice());
  const [speaking, setSpeaking] = useState(false);
  const [highlight, setHighlight] = useState<TutorTtsHighlight>({
    messageId: null,
    activeWordIndex: 0,
  });

  const supported =
    typeof window !== 'undefined' && ('speechSynthesis' in window || true); // backend path always possible

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Playback queue state. queueRef holds items not yet played. We serialize
  // via a running boolean + on-ended handler rather than a Promise chain so
  // cancellation is instant.
  const queueRef = useRef<QueueItem[]>([]);
  const streamBufferRef = useRef<string>('');
  const streamActiveRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const cancelTokenRef = useRef<number>(0);
  const itemIdRef = useRef<number>(0);
  /** Characters already committed to TTS this turn (streaming or one-shot). */
  const ttsSpokenCharsRef = useRef<number>(0);
  /** Leftover streaming text without a sentence terminator yet. */
  const cleanedPendingRef = useRef<string>('');
  /** Current tutor message id for queued TTS (karaoke sync). */
  const utteranceMessageIdRef = useRef<string | null>(null);
  /** Running word offset for the current utterance (resets per streamBegin / speak). */
  const utteranceWordOffsetRef = useRef<number>(0);
  const lastHighlightWordRef = useRef<number>(-1);

  // Stable references to the hook config so queue drain uses the latest
  // values even when captured inside long-lived closures.
  const optsRef = useRef({ enabled, apiBase, cloudApiBase, authToken, backendReachable, voice });
  optsRef.current = { enabled, apiBase, cloudApiBase, authToken, backendReachable, voice };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.addEventListener('play', () => setSpeaking(true));
      audio.addEventListener('pause', () => {
        // Only clear "speaking" when the pause wasn't caused by a queue advance.
        if (queueRef.current.length === 0 && !isProcessingRef.current) setSpeaking(false);
      });
      audio.addEventListener('error', () => setSpeaking(false));
      audioRef.current = audio;
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(TTS_ENABLED_STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
  }, [enabled]);

  /**
   * Kick off the MP3 fetch for a queue item before it's actually played.
   * This is the key to low-latency chunked playback: while sentence N is
   * playing, N+1 is already being synthesized by ElevenLabs.
   */
  const primeItem = useCallback((item: QueueItem, token: number) => {
    if (item.primePromise) return item.primePromise;
    const { cloudApiBase: base, authToken: tok, backendReachable: reachable, voice: v } = optsRef.current;
    if (!reachable || !base) {
      item.primedUrl = null;
      return Promise.resolve(null);
    }
    // Auth token race: useCloudAuthToken() resolves async after first render.
    // If we fire the speak call now, /api/tutor/speak returns 401 and Spark
    // is silent for the first greeting. Defer instead — leave primePromise
    // unset so a later processQueue tick will retry once the token is up.
    if (!tok) {
      // Don't cache a null result — caller will reprime when token lands.
      return Promise.resolve(null);
    }
    item.primePromise = (async () => {
      try {
        const response = await fetch(`${base}/api/tutor/speak`, {
          method: 'POST',
          headers: cloudHeaders(tok),
          body: JSON.stringify({ text: item.text, voice: v.id, provider: 'elevenlabs' }),
        });
        if (token !== cancelTokenRef.current) return null;
        if (!response.ok) {
          console.warn('[TTS] prime returned', response.status);
          return null;
        }
        const blob = await response.blob();
        if (token !== cancelTokenRef.current) return null;
        const url = URL.createObjectURL(blob);
        item.primedUrl = url;
        return url;
      } catch (err) {
        if (token === cancelTokenRef.current) console.warn('[TTS] prime failed', err);
        return null;
      }
    })();
    return item.primePromise;
  }, []);

  const emitWordHighlight = useCallback((messageId: string, globalWordIndex: number) => {
    if (globalWordIndex === lastHighlightWordRef.current) return;
    lastHighlightWordRef.current = globalWordIndex;
    setHighlight({ messageId, activeWordIndex: globalWordIndex });
  }, []);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (queueRef.current.length === 0) return;
    isProcessingRef.current = true;
    const myToken = cancelTokenRef.current;

    try {
      while (queueRef.current.length > 0 && myToken === cancelTokenRef.current) {
        const item = queueRef.current.shift()!;
        if (queueRef.current[0]) primeItem(queueRef.current[0], myToken);

        const url = await (item.primePromise ?? primeItem(item, myToken));
        if (myToken !== cancelTokenRef.current) return;

        const applyLocalProgress = (t01: number) => {
          const clamped = Math.min(1, Math.max(0, t01));
          const local = Math.min(
            item.wordCount - 1,
            Math.floor(clamped * item.wordCount),
          );
          emitWordHighlight(item.messageId, item.wordOffset + local);
        };

        if (!url) {
          await new Promise<void>((resolve) => {
            if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
              resolve();
              return;
            }
            const utter = new SpeechSynthesisUtterance(item.text);
            utter.rate = item.ageGroup === 'explorer' ? 0.88 : item.ageGroup === 'builder' ? 0.94 : 1.0;
            utter.pitch = item.ageGroup === 'explorer' ? 1.15 : 1.0;
            const estMs = Math.max(600, item.wordCount * 380);
            const t0 = performance.now();
            applyLocalProgress(0);
            const tick = window.setInterval(() => {
              if (myToken !== cancelTokenRef.current) {
                window.clearInterval(tick);
                return;
              }
              const elapsed = performance.now() - t0;
              applyLocalProgress(elapsed / estMs);
            }, 45);
            utter.onend = () => {
              window.clearInterval(tick);
              applyLocalProgress(1);
              resolve();
            };
            utter.onerror = () => {
              window.clearInterval(tick);
              resolve();
            };
            try { window.speechSynthesis.speak(utter); } catch { window.clearInterval(tick); resolve(); }
          });
          continue;
        }

        const audio = audioRef.current;
        if (!audio) {
          URL.revokeObjectURL(url);
          continue;
        }
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
          };
          const cleanup = () => {
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onErr);
            audio.removeEventListener('timeupdate', onTime);
            if (currentBlobUrlRef.current === url) currentBlobUrlRef.current = null;
            URL.revokeObjectURL(url);
          };
          const onEnded = () => {
            applyLocalProgress(1);
            finish();
          };
          const onErr = () => {
            finish();
          };
          const onTime = () => {
            const d = audio.duration;
            if (!d || !Number.isFinite(d) || d <= 0) return;
            applyLocalProgress(audio.currentTime / d);
          };
          audio.addEventListener('ended', onEnded);
          audio.addEventListener('error', onErr);
          audio.addEventListener('timeupdate', onTime);
          currentBlobUrlRef.current = url;
          audio.src = url;
          audio.load();
          applyLocalProgress(0);
          const startPlayback = () => {
            void audio.play().catch(() => { finish(); });
          };
          if (audio.readyState >= 2) startPlayback();
          else audio.addEventListener('canplay', startPlayback, { once: true });
        });
        if (myToken !== cancelTokenRef.current) return;
      }
    } finally {
      isProcessingRef.current = false;
      if (queueRef.current.length === 0) {
        setSpeaking(false);
        lastHighlightWordRef.current = -1;
        setHighlight({ messageId: null, activeWordIndex: 0 });
      }
    }
  }, [emitWordHighlight, primeItem]);

  const cancelAll = useCallback(() => {
    cancelTokenRef.current += 1;
    streamActiveRef.current = false;
    streamBufferRef.current = '';
    utteranceMessageIdRef.current = null;
    utteranceWordOffsetRef.current = 0;
    lastHighlightWordRef.current = -1;

    // Clean up primed URLs sitting in the queue.
    for (const q of queueRef.current) {
      if (q.primedUrl) URL.revokeObjectURL(q.primedUrl);
    }
    queueRef.current = [];

    if (audioRef.current) {
      audioRef.current.pause();
      try { audioRef.current.currentTime = 0; } catch { /* ignore */ }
      audioRef.current.src = '';
    }
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isProcessingRef.current = false;
    ttsSpokenCharsRef.current = 0;
    setSpeaking(false);
    setHighlight({ messageId: null, activeWordIndex: 0 });
  }, []);

  const enqueue = useCallback((text: string, ageGroup: AgeGroup) => {
    const cleaned = stripMarkdown(text);
    if (!cleaned) return;
    if (!optsRef.current.enabled) return;

    const used = ttsSpokenCharsRef.current;
    if (used >= TTS_MAX_SPOKEN_CHARS) return;
    const remaining = TTS_MAX_SPOKEN_CHARS - used;
    const segment = fitTtsSegment(cleaned, remaining);
    if (!segment) return;
    ttsSpokenCharsRef.current += segment.length;

    const mid = utteranceMessageIdRef.current ?? '';
    const wc = Math.max(1, countWords(segment));
    const wordOffset = utteranceWordOffsetRef.current;
    utteranceWordOffsetRef.current += wc;

    const item: QueueItem = {
      id: ++itemIdRef.current,
      text: segment,
      ageGroup,
      messageId: mid,
      wordOffset,
      wordCount: wc,
    };
    queueRef.current.push(item);
    setSpeaking(true);
    // Prime the first item immediately so it's ready to play with ~no extra delay.
    if (queueRef.current.length === 1) primeItem(item, cancelTokenRef.current);
    void processQueue();
  }, [primeItem, processQueue]);

  /** One-shot: stop whatever is currently speaking, then speak `text`. */
  const speak = useCallback((text: string, ageGroup: AgeGroup, messageId: string) => {
    const cleaned = stripMarkdown(text);
    const spokenOnly = extractSpokenChannel(cleaned);
    if (!spokenOnly) return;
    cancelAll();
    if (!optsRef.current.enabled) return;

    utteranceMessageIdRef.current = messageId;
    utteranceWordOffsetRef.current = 0;
    lastHighlightWordRef.current = -1;

    // For one-shots, split into sentences too so very long messages still
    // start speaking quickly.
    const { chunks, rest } = splitIntoSentences(spokenOnly);
    const toEnqueue = [...chunks];
    if (rest) toEnqueue.push(rest);
    for (const piece of toEnqueue) {
      enqueue(piece, ageGroup);
      if (ttsSpokenCharsRef.current >= TTS_MAX_SPOKEN_CHARS) break;
    }
    // Offline path: `processQueue` speaks each queued chunk via Web Speech
    // when the backend MP3 prime fails — no separate full-text utterance.
  }, [cancelAll, enqueue]);

  /**
   * Streaming mode: call `streamBegin(messageId)` when tutor starts, `streamFeed()`
   * whenever the message grows, `streamEnd()` when streaming closes. New
   * complete sentences are auto-enqueued as they arrive.
   */
  const streamBegin = useCallback((messageId: string) => {
    cancelAll();
    cleanedPendingRef.current = '';
    utteranceMessageIdRef.current = messageId;
    utteranceWordOffsetRef.current = 0;
    lastHighlightWordRef.current = -1;
    if (!optsRef.current.enabled) return;
    streamActiveRef.current = true;
    streamBufferRef.current = '';
  }, [cancelAll]);

  const streamFeed = useCallback((fullText: string, ageGroup: AgeGroup) => {
    if (!streamActiveRef.current) return;
    if (!optsRef.current.enabled) return;
    const cleaned = stripMarkdown(fullText);
    // Only TTS the "spoken" section (before ---); stays aligned with the text stream.
    const spokenOnly = extractSpokenChannel(cleaned);
    const buffered = streamBufferRef.current;
    if (spokenOnly.length <= buffered.length) return;
    if (!spokenOnly.startsWith(buffered)) {
      streamBufferRef.current = spokenOnly;
      return;
    }
    const delta = spokenOnly.slice(buffered.length);
    // Accumulate the delta and split on sentence terminators. Anything
    // without a terminator is left pending for the next feed.
    const pending = (cleanedPendingRef.current ?? '') + delta;
    const { chunks, rest } = splitIntoSentences(pending);
    cleanedPendingRef.current = rest;
    streamBufferRef.current = spokenOnly;
    // Only speak sentences that are at least a few words long — avoids
    // the "H." / "Oh." mid-token artifacts.
    for (const chunk of chunks) {
      if (ttsSpokenCharsRef.current >= TTS_MAX_SPOKEN_CHARS) break;
      if (chunk.split(/\s+/).length >= 2) {
        enqueue(chunk, ageGroup);
      } else {
        // Prepend stubby chunk to the pending buffer so it joins the next one.
        cleanedPendingRef.current = chunk + ' ' + (cleanedPendingRef.current ?? '');
      }
    }
  }, [enqueue]);

  const streamEnd = useCallback((ageGroup: AgeGroup) => {
    if (!streamActiveRef.current) return;
    streamActiveRef.current = false;
    const tail = (cleanedPendingRef.current ?? '').trim();
    cleanedPendingRef.current = '';
    if (tail) enqueue(tail, ageGroup);
  }, [enqueue]);

  const stopSpeaking = useCallback(() => {
    cancelAll();
  }, [cancelAll]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      if (prev) cancelAll();
      return !prev;
    });
  }, [cancelAll]);

  const setVoice = useCallback((nextVoice: TutorVoice) => {
    setVoiceState(nextVoice);
    saveVoice(nextVoice);
    cancelAll();
  }, [cancelAll]);

  useEffect(() => () => { cancelAll(); }, [cancelAll]);

  return {
    enabled,
    speaking,
    highlight,
    supported,
    voice,
    setVoice,
    speak,
    streamBegin,
    streamFeed,
    streamEnd,
    stopSpeaking,
    toggle,
  };
}

// ─── Tutor intro messages (offline fallback / first-load) ─────────────────────

function getOfflineGreeting(
  name: string,
  ageGroup: AgeGroup,
  conceptTitle: string,
): string {
  const { label } = AGE_GROUP_META[ageGroup];
  if (ageGroup === 'explorer') {
    return `Hi ${name}! I'm Sketch, your robot tutor! 🤖 Today we're going to explore **${conceptTitle}** together. Ready to make something awesome?`;
  }
  if (ageGroup === 'builder') {
    return `Hey ${name}! Ready to level up? We're diving into **${conceptTitle}** — this is where robotics gets really interesting.`;
  }
  return `Welcome, ${name}. Let's explore **${conceptTitle}**. We'll start with the intuitive layer — you can always go deeper from there.`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TutorPanel({
  studentName,
  ageGroup,
  conceptId,
  conceptTitle,
  activeLayer,
  apiBase,
  drawingPrompt,
  pathCount,
  backendReachable,
  onLayerChange,
  onXPChange,
  sessionActorRole: sessionActorRoleProp,
  lessonPlanActive = false,
  classroomRestrictions,
  sessionId = null,
  isSandbox = false,
  getContextText,
  getContextSignature,
}: TutorPanelProps) {
  const sessionActorRole: 'teacher' | 'student' = sessionActorRoleProp ?? 'student';
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  // Mirror of messages so unmount-time effects (e.g., session summary) can
  // read the latest chat excerpt without taking it as an effect dep.
  const messagesRef = useRef<TutorMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  /** 'chat' = traditional scrollback, 'face' = video-call style with big Spark.
   *  Defaults to 'face' (kid-friendly), persisted per browser. Educators can
   *  flip to chat for transcript/audit. */
  const [displayMode, setDisplayMode] = useState<'chat' | 'face'>(() => {
    if (typeof window === 'undefined') return 'face';
    try {
      const saved = window.localStorage.getItem('sketchbot.tutor.displayMode');
      return saved === 'chat' ? 'chat' : 'face';
    } catch {
      return 'face';
    }
  });
  // Persist whenever user toggles
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('sketchbot.tutor.displayMode', displayMode);
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [displayMode]);
  // Load chat history from the active SavedSession on mount / when sessionId changes
  const sessionLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId || sessionLoadedRef.current === sessionId) return;
    sessionLoadedRef.current = sessionId;
    try {
      // Lazy import to avoid SSR localStorage access
      void (async () => {
        const { getSession } = await import('@/lib/session-storage');
        const saved = getSession(studentName || 'guest', sessionId);
        if (saved && saved.chat.length > 0) {
          setMessages(
            saved.chat.map((m) => ({
              id: m.id,
              role: m.role === 'tutor' ? 'tutor' : 'student',
              content: m.text,
            })),
          );
        }
      })();
    } catch {
      // ignore — session storage failures shouldn't break the panel
    }
  }, [sessionId, studentName]);

  // Persist chat history (debounced) whenever messages change.
  // Also flushes immediately on the global "save now" event.
  useEffect(() => {
    if (!sessionId) return;
    const SAVE_NOW = 'sketchbot:save-now';
    const flush = () => {
      void (async () => {
        const { updateSession } = await import('@/lib/session-storage');
        updateSession(studentName || 'guest', sessionId, {
          chat: messages
            .filter((m) => !m.isStreaming) // don't persist mid-stream tokens
            .map((m) => ({
              id: m.id,
              role: m.role === 'tutor' ? 'tutor' : 'user',
              text: m.content,
              ts: Date.now(),
            })),
        });
      })();
    };
    const handle = setTimeout(flush, 500);
    const onSaveNow = () => { clearTimeout(handle); flush(); };
    window.addEventListener(SAVE_NOW, onSaveNow);
    return () => {
      clearTimeout(handle);
      window.removeEventListener(SAVE_NOW, onSaveNow);
    };
  }, [messages, sessionId, studentName]);
  const [studentInput, setStudentInput] = useState('');
  /** True while any tutor SSE reply is in flight (greeting, hint, student reply, etc.). */
  const [tutorStreaming, setTutorStreaming] = useState(false);
  const [progressSnapshot, setProgressSnapshot] = useState<ConceptProgressSnapshot | null>(null);
  const [evaluationNotice, setEvaluationNotice] = useState<EvaluationNotice | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** Scroll spoken karaoke line into view as the active word moves. */
  const activeWordScrollRef = useCallback((node: HTMLSpanElement | null) => {
    if (!node) return;
    requestAnimationFrame(() => {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, []);
  /** `undefined` = effect has never run yet (distinguishes from `conceptId === null`). */
  const prevConceptRef = useRef<string | null | undefined>(undefined);
  const prevLayerRef = useRef<ConceptLayer | undefined>(undefined);
  const lastEvaluatedKeyRef = useRef<string | null>(null);
  const hintsUsedRef = useRef(0);
  const lastSpokenMsgRef = useRef<string | null>(null);
  const streamSpokeItRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cloudAuthToken = useCloudAuthToken();
  // Mirror to a ref so unmount-time effects (e.g., the session summarize
  // call) read the LATEST token rather than whatever was captured at
  // mount. Otherwise a session that mounted before Supabase resolved
  // sees null on cleanup → 401 Unauthorized.
  const cloudAuthTokenRef = useRef<string | null | undefined>(cloudAuthToken);
  useEffect(() => { cloudAuthTokenRef.current = cloudAuthToken; }, [cloudAuthToken]);
  const tts = useTTS({ apiBase, cloudApiBase: CLOUD_API_URL, authToken: cloudAuthToken ?? null, backendReachable });
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const voicePickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showVoicePicker) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (voicePickerRef.current && target && !voicePickerRef.current.contains(target)) {
        setShowVoicePicker(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowVoicePicker(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showVoicePicker]);
  const localWhisper = useLocalWhisper();

  // Server-side STT availability: `null` until probed, then `true`/`false`.
  // Re-probes whenever the backend becomes reachable again.
  const [backendSttAvailable, setBackendSttAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    if (!backendReachable || !apiBase) {
      setBackendSttAvailable(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/tutor/transcribe/status`);
        if (cancelled) return;
        if (!res.ok) { setBackendSttAvailable(false); return; }
        const data = (await res.json()) as { available?: boolean };
        setBackendSttAvailable(Boolean(data.available));
      } catch {
        if (!cancelled) setBackendSttAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, [backendReachable, apiBase]);

  // Remembers the input text at the moment recording started, so we can
  // render "<existing> <partial>" while live partials stream in without
  // clobbering what the student already typed.
  const baseInputOnRecordRef = useRef('');
  const [partialTranscript, setPartialTranscript] = useState('');

  const speech = useVoiceInput(
    (transcript) => {
      const base = baseInputOnRecordRef.current;
      setStudentInput(base ? `${base} ${transcript}` : transcript);
      baseInputOnRecordRef.current = '';
      setPartialTranscript('');
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    apiBase,
    {
      localWhisper,
      backendReachable,
      backendSttAvailable,
      onBackendSttUnavailable: () => setBackendSttAvailable(false),
      onPartialTranscript: (text) => setPartialTranscript(text),
    },
  );

  // Capture the existing input when recording starts so partials layer on top
  // of it.
  useEffect(() => {
    if (speech.isListening) {
      baseInputOnRecordRef.current = studentInput;
      setPartialTranscript('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.isListening]);

  // Eagerly prefetch the offline voice model. It's required for live
  // partials even when the backend path is healthy (partials always run
  // locally), and it acts as the fallback if the backend path fails. We
  // give the UI a brief idle moment before kicking off the ~150 MB
  // download so it doesn't fight initial concept loads for bandwidth.
  useEffect(() => {
    if (localWhisper.status !== 'idle') return;
    const t = window.setTimeout(() => {
      if (localWhisper.status === 'idle') localWhisper.loadModel();
    }, 800);
    return () => window.clearTimeout(t);
  }, [localWhisper]);

  // Live preview: show the streamed partial below whatever the student had in
  // the input before they started speaking.
  const inputDisplayValue = speech.isListening && partialTranscript
    ? (baseInputOnRecordRef.current
        ? `${baseInputOnRecordRef.current} ${partialTranscript}`
        : partialTranscript)
    : studentInput;

  // Scroll to bottom when messages change
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  // TTS streaming is wired directly into streamTutorMessage (via
  // tts.streamBegin / tts.streamFeed / tts.streamEnd) so sentences are
  // spoken as they arrive instead of waiting for the whole message.
  // This effect just handles the non-streamed case (e.g. offline fallback
  // greeting that's appended in one shot).
  useEffect(() => {
    const last = messages.at(-1);
    if (!last || last.role !== 'tutor' || last.isStreaming) return;
    if (last.content === lastSpokenMsgRef.current) return;
    if (streamSpokeItRef.current) {
      // The streaming path handled this one. Just mark as spoken so we
      // don't fire again if the component re-renders.
      streamSpokeItRef.current = false;
      lastSpokenMsgRef.current = last.content;
      return;
    }
    lastSpokenMsgRef.current = last.content;
    tts.speak(last.content, ageGroup, last.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Send tutor message when concept or layer changes
  useEffect(() => {
    // Wait for auth check to settle before firing — avoids a 401 because the
    // Supabase session hasn't been read yet on first render.
    if (cloudAuthToken === undefined) return;

    // The previous "skip concept_change in sandbox" guard removed the
    // greeting entirely. With the new _OUTPUT_CHANNELS rule (1–3
    // sentences, no `---` block, no bullet lists) the sandbox greeting
    // is now a single warm short hello — fine to fire. So we let
    // concept_change run normally; concept_id falls back to "free-draw"
    // for sandbox and the brief format keeps it friendly, not verbose.

    const conceptChanged =
      prevConceptRef.current === undefined || conceptId !== prevConceptRef.current;
    const layerChanged =
      prevLayerRef.current === undefined || activeLayer !== prevLayerRef.current;
    prevConceptRef.current = conceptId;
    prevLayerRef.current = activeLayer;

    if (!conceptChanged && !layerChanged) return;

    // Record progress touch (students only — teachers don't mutate learner progress here)
    if (conceptId && studentName && sessionActorRole !== 'teacher') {
      touchConcept(studentName, conceptId, activeLayer);
      setProgressSnapshot(getConceptProgressSnapshot(studentName, conceptId));
    }
    setEvaluationNotice(null);

    if (!backendReachable || !apiBase) {
      const greeting = getOfflineGreeting(studentName, ageGroup, conceptTitle || 'this concept');
      if (conceptChanged) {
        setMessages([{ id: genId(), role: 'tutor', content: greeting }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: genId(), role: 'tutor', content: `Let's go deeper — we're now at the **${activeLayer}** layer. ${greeting}` },
        ]);
      }
      return;
    }

    if (conceptChanged) {
      // New concept — clear the feed and start fresh
      setMessages([]);
      void streamTutorMessage({
        trigger: 'concept_change',
        concept_id: conceptId ?? 'free-draw',
        layer: activeLayer,
      });
    } else {
      // Layer change within same concept — tutor bridges the transition
      void streamTutorMessage({
        trigger: 'layer_change',
        concept_id: conceptId ?? 'free-draw',
        layer: activeLayer,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId, activeLayer, sessionActorRole, cloudAuthToken === undefined]);

  useEffect(() => {
    hintsUsedRef.current = 0;
  }, [conceptId]);

  // Notify tutor when a drawing is submitted
  useEffect(() => {
    if (sessionActorRole === 'teacher') return;
    // Robot challenges don't use the drawing evaluation pipeline
    if (conceptId && (ROBOT_LAB_CONCEPT_IDS as readonly string[]).includes(conceptId)) return;
    if (!drawingPrompt) return;
    if (!messages.length) return; // Don't react before greeting loads

     const evaluationKey = `${conceptId ?? 'free-draw'}|${activeLayer}|${drawingPrompt}|${pathCount ?? 0}`;
     if (lastEvaluatedKeyRef.current === evaluationKey) return;
     lastEvaluatedKeyRef.current = evaluationKey;

    if (backendReachable && apiBase) {
      void (async () => {
        await streamTutorMessage({
          trigger: 'drawing_submitted',
          concept_id: conceptId ?? 'free-draw',
          layer: activeLayer,
          drawing_prompt: drawingPrompt,
          path_count: pathCount ?? 0,
        });

        try {
          const response = await fetch(`${CLOUD_API_URL}/api/tutor/evaluate`, {
            method: 'POST',
            headers: cloudHeaders(cloudAuthToken),
            body: JSON.stringify({
              student_name: studentName,
              age_group: ageGroup,
              actor_role: sessionActorRole,
              concept_id: conceptId ?? 'free-draw',
              layer: activeLayer,
              drawing_prompt: drawingPrompt,
              path_count: pathCount ?? 0,
            }),
          });

          if (!response.ok) {
            throw new Error('Tutor evaluation unavailable');
          }

          const evaluation = (await response.json()) as {
            passed?: boolean;
            feedback?: string;
            suggest_next_layer?: boolean;
            score?: number;
            creativity?: number;
            concept_alignment?: number;
            complexity?: number;
          };

          const scoreDetails = (typeof evaluation.score === 'number')
            ? {
                score: evaluation.score,
                creativity: evaluation.creativity ?? 50,
                concept_alignment: evaluation.concept_alignment ?? 50,
                complexity: evaluation.complexity ?? 50,
              }
            : undefined;

          const result =
            conceptId && studentName
              ? applyTutorEvaluation(
                  studentName,
                  conceptId,
                  activeLayer,
                  Boolean(evaluation.passed),
                  Boolean(evaluation.suggest_next_layer),
                  scoreDetails,
                )
              : null;

          if (result) {
            setProgressSnapshot(result.snapshot);
            setEvaluationNotice({
              passed: Boolean(evaluation.passed),
              feedback: evaluation.feedback || 'Nice work. Keep exploring this concept.',
              suggestNextLayer: Boolean(evaluation.suggest_next_layer),
              nextLayerAvailable: result.next_layer_available,
              awardedBadges: result.awarded_badges,
              mastered: result.newly_mastered || result.snapshot.mastered,
              xpAwarded: result.xpAwarded,
              leveledUp: result.leveledUp,
              newLevel: result.newLevel,
              scoreDetails: result.scoreDetails,
            });
            onXPChange?.();
            // Spark reactions: cheer on pass, encourage on miss; bigger
            // milestones (level-up, mastered) fire their own events on top so
            // the coordinator can play a richer scene.
            if (evaluation.passed) {
              emitSparkEvent('tutor.evaluation.pass', { xp: result.xpAwarded });
              if (result.leveledUp) emitSparkEvent('tutor.level-up', { level: result.newLevel });
              if (result.newly_mastered) emitSparkEvent('tutor.concept-mastered');
            } else {
              emitSparkEvent('tutor.evaluation.fail');
            }
          }
        } catch {
          setEvaluationNotice({
            passed: false,
            feedback: 'Sketch is still thinking about how this drawing shows the concept. Try another variation or ask for a hint.',
            suggestNextLayer: false,
            nextLayerAvailable: null,
            awardedBadges: [],
            mastered: false,
            xpAwarded: 0,
            leveledUp: false,
            newLevel: 1,
          });
          emitSparkEvent('tutor.evaluation.fail');
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingPrompt]);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setTutorStreaming(false);
    tts.stopSpeaking();
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
    );
  }, [tts]);

  const clearConversation = useCallback(() => {
    stopStreaming();
    setMessages([]);
    setEvaluationNotice(null);
    // Tell backend to clear session too
    if (apiBase && studentName) {
      void fetch(`${apiBase}/api/tutor/clear-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_name: studentName }),
      }).catch(() => {});
    }
  }, [apiBase, studentName, stopStreaming]);

  const streamTutorMessage = async (body: Record<string, unknown>) => {
    abortControllerRef.current?.abort();

    const tutorMsgId = genId();
    const myController = new AbortController();
    setMessages((prev) => [
      ...prev,
      { id: tutorMsgId, role: 'tutor', content: '', isStreaming: true },
    ]);

    abortControllerRef.current = myController;
    setTutorStreaming(true);

    // Chunked TTS: sentences from the spoken section (before ---) queue as they complete.
    tts.streamBegin(tutorMsgId);
    streamSpokeItRef.current = true;

    // Pull a fresh situational-awareness preamble from the parent. The
    // tutor backend treats `context_text` as an uncached system block — see
    // services/local-runtime/app/services/tutor_service.py.
    const contextText = getContextText?.() ?? '';

    try {
      const res = await fetch(`${CLOUD_API_URL}/api/tutor/message`, {
        method: 'POST',
        headers: cloudHeaders(cloudAuthToken),
        signal: myController.signal,
        body: JSON.stringify({
          student_name: studentName,
          age_group: ageGroup,
          actor_role: sessionActorRole,
          context_text: contextText,
          ...body,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error('Tutor unavailable');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? ''; // last element may be incomplete

        for (const event of events) {
          for (const line of event.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;

            try {
              const msg = JSON.parse(raw) as { type: string; text?: string; message?: string };
              if (msg.type === 'token' && msg.text) {
                accumulated += msg.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === tutorMsgId
                      ? { ...m, content: accumulated, isStreaming: true }
                      : m,
                  ),
                );
                tts.streamFeed(accumulated, ageGroup);
              } else if (msg.type === 'done') {
                // Stream finished — mark complete
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === tutorMsgId ? { ...m, isStreaming: false } : m,
                  ),
                );
                tts.streamEnd(ageGroup);
                return;
              } else if (msg.type === 'error') {
                // Backend signalled an error — show the real message so it's diagnosable
                tts.stopSpeaking();
                const errText = msg.message
                  ? `⚠️ Sketch ran into a problem: ${msg.message}`
                  : getOfflineGreeting(studentName, ageGroup, conceptTitle || 'this concept');
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === tutorMsgId
                      ? { ...m, content: errText, isStreaming: false }
                      : m,
                  ),
                );
                return;
              }
            } catch {
              // Ignore malformed events
            }
          }
        }
      }

      // EOF without a done event — still mark complete
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tutorMsgId ? { ...m, isStreaming: false } : m,
        ),
      );
      tts.streamEnd(ageGroup);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User stopped the stream — just mark it done, keep whatever was received
        setMessages((prev) =>
          prev.map((m) => (m.id === tutorMsgId ? { ...m, isStreaming: false } : m)),
        );
        tts.streamEnd(ageGroup);
        return;
      }
      // Network/other error — replace placeholder with offline fallback
      streamSpokeItRef.current = false; // let the main effect speak the fallback greeting
      tts.stopSpeaking();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tutorMsgId
            ? {
                ...m,
                content: getOfflineGreeting(studentName, ageGroup, conceptTitle || 'this concept'),
                isStreaming: false,
              }
            : m,
        ),
      );
    } finally {
      setTutorStreaming(false);
      if (abortControllerRef.current === myController) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleSend = async () => {
    const text = studentInput.trim();
    if (!text || tutorStreaming) return;

    setStudentInput('');
    setMessages((prev) => [...prev, { id: genId(), role: 'student', content: text }]);

    await streamTutorMessage({
      trigger: sessionActorRole === 'teacher' ? 'teacher_reply' : 'student_reply',
      concept_id: conceptId ?? 'free-draw',
      layer: activeLayer,
      student_message: text,
    });
  };

  const handleHint = async () => {
    const cap = effectiveMaxHints(classroomRestrictions ?? undefined);
    if (cap !== null && hintsUsedRef.current >= cap) {
      window.alert('No more hints for this session — your teacher set a limit.');
      return;
    }
    if (cap !== null) {
      hintsUsedRef.current += 1;
    }
    await streamTutorMessage({
      trigger: sessionActorRole === 'teacher' ? 'teacher_hint_request' : 'hint_request',
      concept_id: conceptId ?? 'free-draw',
      layer: activeLayer,
      drawing_prompt: drawingPrompt ?? '',
      path_count: pathCount ?? 0,
    });
  };

  // Layer 3 — proactive nudges. The behavior coordinator emits
  // `spark.nudge.struggle` after consecutive failures and `spark.nudge.idle`
  // after a long stretch of inactivity. We respond by quietly triggering the
  // same flow as the Hint button — but only when a concept is active and
  // we're not already streaming a reply, to avoid talking over ourselves.
  useEffect(() => {
    return onSparkEvent((detail) => {
      if (detail.kind !== 'spark.nudge.struggle' && detail.kind !== 'spark.nudge.idle') return;
      if (tutorStreaming) return;
      if (!conceptId) return; // sandbox / free-draw → don't pester
      const cap = effectiveMaxHints(classroomRestrictions ?? undefined);
      if (cap !== null && hintsUsedRef.current >= cap) return;
      void handleHint();
    });
    // handleHint closes over latest props/state via refs that update; this is
    // intentionally mounted once — see the streaming/cap guards above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId, tutorStreaming, classroomRestrictions, sessionActorRole, activeLayer, drawingPrompt, pathCount]);

  // End-of-session reflection (Level 1 learning). When the session unmounts
  // — user navigates home, switches concept, or closes the app — fire a
  // non-blocking summary call and append the result to spark-memory so the
  // next session opens with "I remember last time you...".
  useEffect(() => {
    return () => {
      const start = sparkBehavior.getSessionStart();
      const durationSec = Math.max(0, Math.round((Date.now() - start) / 1000));
      // Don't summarize a session that didn't really happen.
      if (durationSec < 30) return;
      const ctx = getContextText?.() ?? '';
      if (!ctx.trim()) return;
      // Read the LATEST auth token from the ref — closure-captured value
      // is stale if the effect mounted before Supabase resolved. If still
      // null at unmount (signed-out session), bail rather than 401.
      const tok = cloudAuthTokenRef.current;
      if (!tok) return;
      const chatExcerpt = messagesRef.current
        .slice(-6)
        .map((m) => `${m.role === 'tutor' ? 'Spark' : 'Student'}: ${m.content}`)
        .join('\n');
      const studentKey = studentName || 'guest';
      // Fire-and-forget — we're unmounting, so no UI feedback path.
      void fetch(`${CLOUD_API_URL}/api/tutor/summarize`, {
        method: 'POST',
        headers: cloudHeaders(tok),
        body: JSON.stringify({
          student_name: studentName,
          age_group: ageGroup,
          actor_role: sessionActorRole,
          concept_id: conceptId ?? 'free-draw',
          layer: activeLayer,
          context_text: ctx,
          chat_excerpt: chatExcerpt,
          duration_sec: durationSec,
        }),
        keepalive: true, // survive the page/window unload
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((result: { summary?: string; struggled_with?: string; excelled_at?: string; sentiment?: 'positive' | 'neutral' | 'frustrated' } | null) => {
          if (!result || !result.summary) return;
          appendSessionSummary(studentKey, {
            sessionId: sessionId ?? null,
            conceptId: conceptId ?? null,
            durationSec,
            endedAt: Date.now(),
            summary: result.summary,
            struggledWith: result.struggled_with,
            excelledAt: result.excelled_at,
            sentiment: result.sentiment ?? 'neutral',
          });
        })
        .catch(() => { /* best-effort, silent failure */ });
    };
    // Mounted once per session id. The deps below control when "the session
    // ends" — i.e., when sessionId or conceptId changes the cleanup fires
    // and a fresh effect mounts for the new session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, conceptId]);

  // Level 2 learning — watches the event bus and resolves interjection
  // outcomes (engaged/ignored) once 60s of no-activity have passed or the
  // user does something. Outcomes accumulate in spark-memory and feed the
  // next tick's prompt.
  useInterjectionTracker({
    studentName,
    enabled: backendReachable && !!getContextText,
  });

  // Agentic tick — adaptive observation loop. Most ticks return silently;
  // when Spark genuinely has something to say, drop the message into the
  // chat thread. The existing non-stream TTS effect (above) speaks it.
  useSparkTick({
    enabled: backendReachable && !!CLOUD_API_URL && !tutorStreaming && !!getContextText,
    studentName,
    ageGroup,
    actorRole: sessionActorRole,
    conceptId,
    layer: activeLayer,
    cloudAuthToken,
    getContextText: () => getContextText?.({
      // Last 6 chat messages (oldest → newest) so Spark sees the
      // conversational thread and avoids repeating himself.
      chatExcerpt: messagesRef.current.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      activeDrawingPrompt: drawingPrompt ?? null,
      lastPathCount: typeof pathCount === 'number' ? pathCount : null,
    }) ?? '',
    getContextSignature,
    onObservation: (obs) => {
      if (!obs.speak || !obs.message.trim()) return;
      // Don't pile up if the user is already mid-conversation with the tutor.
      if (tutorStreaming) return;
      const text = obs.message.trim();
      // Stop any in-progress TTS before queuing the new line. Without this,
      // Spark would keep reading the previous interjection while the world
      // has changed underneath it — the kid does something new, Spark is
      // still mid-sentence about the old context.
      tts.stopSpeaking();
      setMessages((prev) => [
        ...prev,
        { id: genId(), role: 'tutor', content: text },
      ]);
      // Record the interjection so we can later see whether the kid
      // engaged with it. The tracker's bus listener handles resolution.
      if (studentName) trackInterjectionStart(studentName, 'speak', text);
    },
  });

  // ─── Plan B Phase 1: persistent WebSocket connection to TutorAgent ──
  // Phase 1 dry run — we open the connection, forward bus events, and
  // log whatever the server pushes. Behaviour does NOT change yet; the
  // observation tick still owns Spark's voice. Phase 2 will route the
  // server's `speak` messages into the chat thread (replacing the tick
  // path) once we've validated the wire is solid.
  const tutorWs = useTutorWebSocket({
    enabled:
      backendReachable &&
      !!CLOUD_API_URL &&
      !!sessionId &&
      !!studentName &&
      sessionActorRole === 'student' &&
      cloudAuthToken !== undefined &&
      cloudAuthToken !== null,
    cloudAuthToken,
    sessionId: sessionId ?? null,
    studentName,
    ageGroup,
    actorRole: sessionActorRole,
    conceptId,
    layer: activeLayer,
    onMessage: (msg) => {
      // Phase 1: observe-only logging. Each message type is logged so
      // we can verify the server is talking to us. No UI side-effects.
      if (msg.type === MSG_SPEAK) {
        console.info('[tutor-ws] speak (phase 1, ignored):', msg.message);
      } else if (msg.type === MSG_TOOL_CALL) {
        console.info('[tutor-ws] tool_call (phase 1, ignored):', msg.tool_id, msg.input);
      } else if (msg.type === MSG_THINKING) {
        console.info('[tutor-ws] thinking:', msg.status);
      } else if (msg.type === MSG_RESTART) {
        console.info('[tutor-ws] server restarting; will reconnect:', msg.reason);
      }
    },
  });

  // Surface the agent connection status on window for ad-hoc DevTools
  // inspection during Phase 1 verification: `__sparkWs.status`,
  // `__sparkWs.agentId`. Removed before final launch.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __sparkWs?: unknown }).__sparkWs = {
        status: tutorWs.status,
        agentId: tutorWs.agentId,
      };
    }
  }, [tutorWs.status, tutorWs.agentId]);

  const handleGoDeeper = () => {
    const currentIdx = LAYERS.indexOf(activeLayer);
    if (currentIdx < LAYERS.length - 1) {
      const nextLayer = LAYERS[currentIdx + 1];
      if (conceptId && studentName && sessionActorRole !== 'teacher') {
        completeConceptLayer(studentName, conceptId, activeLayer);
        touchConcept(studentName, conceptId, nextLayer);
        awardBadge(studentName, 'went-deeper');
        setProgressSnapshot(getConceptProgressSnapshot(studentName, conceptId));
        onXPChange?.();
      }
      setEvaluationNotice(null);
      onLayerChange(nextLayer);
      emitSparkEvent('tutor.layer-up', { layer: nextLayer });
    }
  };

  const canGoDeeper = LAYERS.indexOf(activeLayer) < LAYERS.length - 1;

  // Starter chips — context-aware quick replies shown before first user message
  // Suggested-prompt chips were noisy and discouraged direct interaction —
  // disabled in favour of emphasising the mic + text input. Re-enable by
  // returning a non-empty array if needed for guided onboarding.
  const starterChips: string[] = [];

  return (
    <div className="tutor-panel" data-tour="session-tutor">
      {/* Header */}
      <div className="tutor-panel-header">
        <div className="tutor-header-top">
          <div className={`tutor-avatar-large ${tts.speaking ? 'speaking' : ''}`}>🤖</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="tutor-name">Sketch</div>
            <div className="tutor-concept-label">
              {conceptTitle || 'Free Draw'} · {AGE_GROUP_META[ageGroup].label}
              {sessionActorRole === 'teacher' ? (
                <span>
                  {' '}
                  · Educator{lessonPlanActive ? ' · co-planning' : ''}
                </span>
              ) : null}
            </div>
          </div>
          {/* Chat ↔ Face mode toggle */}
          <button
            type="button"
            className={`tutor-icon-btn ${displayMode === 'face' ? 'active' : ''}`}
            onClick={() => setDisplayMode((m) => (m === 'face' ? 'chat' : 'face'))}
            title={displayMode === 'face' ? 'Switch to chat' : 'Switch to face mode (video call with Spark)'}
            aria-label={displayMode === 'face' ? 'Show chat history' : 'Show Spark face mode'}
          >
            {displayMode === 'face' ? <MessageSquare size={13} /> : <Video size={13} />}
          </button>
          {/* Clear conversation */}
          <button
            type="button"
            className="tutor-icon-btn"
            onClick={clearConversation}
            title="New conversation"
            aria-label="Clear conversation"
          >
            <RotateCcw size={13} />
          </button>
          {/* Voice picker (Mark / Lori) */}
          <div className="tutor-voice-picker" ref={voicePickerRef}>
            <button
              type="button"
              className={`tutor-icon-btn ${showVoicePicker ? 'active' : ''}`}
              onClick={() => setShowVoicePicker((v) => !v)}
              title={`Voice: ${tts.voice.label}`}
              aria-label="Choose Sketch voice"
              aria-haspopup="menu"
              aria-expanded={showVoicePicker}
            >
              <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>{tts.voice.emoji}</span>
            </button>
            {showVoicePicker && (
              <div className="tutor-voice-menu" role="menu">
                <div className="tutor-voice-menu-header">Sketch&apos;s voice</div>
                {TUTOR_VOICES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={tts.voice.id === option.id}
                    className={`tutor-voice-option ${tts.voice.id === option.id ? 'active' : ''}`}
                    onClick={() => {
                      tts.setVoice(option);
                      setShowVoicePicker(false);
                      if (!tts.enabled) tts.toggle();
                      // Re-speak the latest tutor message so the student hears a sample.
                      const last = messages.at(-1);
                      if (last && last.role === 'tutor' && !last.isStreaming) {
                        lastSpokenMsgRef.current = null;
                        setTimeout(() => tts.speak(last.content, ageGroup, last.id), 50);
                      }
                    }}
                  >
                    <span className="tutor-voice-emoji">{option.emoji}</span>
                    <span className="tutor-voice-meta">
                      <span className="tutor-voice-label">{option.label}</span>
                      <span className="tutor-voice-desc">{option.description}</span>
                    </span>
                    {tts.voice.id === option.id && <span className="tutor-voice-check">✓</span>}
                  </button>
                ))}
                <div className="tutor-voice-menu-footer">
                  Powered by ElevenLabs
                </div>
              </div>
            )}
          </div>
          {tts.supported && (
            <button
              type="button"
              className={`tutor-icon-btn ${tts.enabled ? 'active' : ''}`}
              onClick={() => { tts.toggle(); if (tts.speaking) tts.stopSpeaking(); }}
              title={tts.enabled ? 'Mute Sketch' : 'Let Sketch speak'}
              aria-label={tts.enabled ? 'Mute tutor voice' : 'Enable tutor voice'}
            >
              {tts.enabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Face mode replaces the chat scrollback when toggled on */}
      {displayMode === 'face' && (
        <TutorFaceMode
          messages={messages}
          ttsSpeaking={tts.speaking}
          ttsHighlight={tts.highlight}
          sparkVariant={tts.voice.alias}
          onExit={() => setDisplayMode('chat')}
        />
      )}

      {/* Message feed (chat mode) */}
      <div
        ref={feedRef}
        className="tutor-feed"
        style={displayMode === 'face' ? { display: 'none' } : undefined}
      >
        {messages.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: '0.82rem', textAlign: 'center', paddingTop: 20, lineHeight: 1.5 }}>
            {isSandbox
              ? 'Spark is watching. Build something or say hi.'
              : tutorStreaming
                ? 'Connecting to tutor…'
                : 'Say hi to Spark, or just start exploring.'}
          </div>
        )}
        {messages.map((msg) => {
          const karaoke =
            msg.role === 'tutor' &&
            tts.enabled &&
            tts.highlight.messageId === msg.id;
          return (
            <div key={msg.id} className={`tutor-msg-row ${msg.role === 'student' ? 'from-student' : ''}`}>
              {msg.role === 'tutor' && (
                <div className="tutor-msg-avatar">🤖</div>
              )}
              <div className="tutor-msg-bubble">
                {msg.role === 'tutor' ? (
                  renderTutorBubbleContent(msg.content, {
                    karaoke,
                    activeWordIndex: tts.highlight.activeWordIndex,
                    activeWordRef: karaoke ? activeWordScrollRef : undefined,
                  })
                ) : (
                  renderMessage(msg.content)
                )}
                {msg.isStreaming && <span className="tutor-cursor" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Starter chips */}
      {starterChips.length > 0 && (
        <div className="tutor-starter-chips">
          {starterChips.map((chip) => (
            <button
              key={chip}
              type="button"
              className="tutor-chip"
              disabled={tutorStreaming}
              onClick={() => {
                setStudentInput(chip);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Action buttons — Hint / Go Deeper are Academy-only.
          In sandbox we still show Stop while streaming so the user can
          interrupt Spark. */}
      <div className="tutor-actions">
        {tutorStreaming ? (
          <button
            type="button"
            className="tutor-action-btn stop"
            onClick={stopStreaming}
          >
            <Square size={11} />
            Stop
          </button>
        ) : !isSandbox ? (
          <button
            type="button"
            className="tutor-action-btn"
            onClick={handleHint}
            disabled={tutorStreaming}
          >
            <Lightbulb size={12} />
            Hint
          </button>
        ) : null}
        {!isSandbox && canGoDeeper && !tutorStreaming && (
          <button
            type="button"
            className="tutor-action-btn deeper"
            onClick={handleGoDeeper}
          >
            <TrendingUp size={12} />
            Go Deeper
          </button>
        )}
      </div>

      {evaluationNotice && !(conceptId && (ROBOT_LAB_CONCEPT_IDS as readonly string[]).includes(conceptId)) && (
        <div className={`tutor-evaluation-card ${evaluationNotice.passed ? 'passed' : 'pending'}`}>
          <div className="tutor-evaluation-title">
            {evaluationNotice.mastered
              ? 'Concept mastered'
              : evaluationNotice.passed
                ? 'Layer completed'
                : 'Keep exploring'}
          </div>
          <div className="tutor-evaluation-copy">{evaluationNotice.feedback}</div>

          {evaluationNotice.scoreDetails && (
            <div className="score-breakdown">
              <div className="score-breakdown-header">
                <span className="score-breakdown-overall">{evaluationNotice.scoreDetails.score}</span>
                <span className="score-breakdown-label">Overall Score</span>
              </div>
              {([
                { key: 'creativity', label: 'Creativity', color: 'var(--pink)' },
                { key: 'concept_alignment', label: 'Concept Fit', color: 'var(--blue)' },
                { key: 'complexity', label: 'Complexity', color: 'var(--violet)' },
              ] as const).map(({ key, label, color }) => (
                <div key={key} className="score-bar-row">
                  <span className="score-bar-label">{label}</span>
                  <div className="score-bar-track">
                    <div
                      className="score-bar-fill"
                      style={{
                        width: `${evaluationNotice.scoreDetails![key]}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="score-bar-value">{evaluationNotice.scoreDetails![key]}</span>
                </div>
              ))}
            </div>
          )}

          {evaluationNotice.xpAwarded > 0 && (
            <div className="eval-xp-award">
              <span className="eval-xp-badge">+{evaluationNotice.xpAwarded} XP</span>
              {evaluationNotice.leveledUp && (
                <span className="eval-level-up">Level {evaluationNotice.newLevel}!</span>
              )}
            </div>
          )}

          {evaluationNotice.awardedBadges.length > 0 && (
            <div className="tutor-evaluation-badges">
              {evaluationNotice.awardedBadges.map((badgeId) => {
                const badge = BADGE_DEFINITIONS[badgeId];
                return (
                  <span key={badgeId} className="tutor-evaluation-badge">
                    {badge?.emoji ?? '🏅'} {badge?.name ?? badgeId}
                  </span>
                );
              })}
            </div>
          )}
          {evaluationNotice.suggestNextLayer && evaluationNotice.nextLayerAvailable && (
            <button type="button" className="tutor-next-layer-btn" onClick={handleGoDeeper}>
              Move into {LAYER_META[evaluationNotice.nextLayerAvailable].label}
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      )}

      {/* Offline voice model status — teacher / educator view only.
          For students this would just be technical noise ("server voice off",
          "download offline model") that disrupts the tutor relationship and
          exposes infrastructure details kids don't need. The mic still
          falls back to the offline model automatically when needed. */}
      {sessionActorRole === 'teacher' && (!backendReachable || backendSttAvailable === false) && localWhisper.status === 'idle' && (
        <div className="tutor-whisper-bar">
          <WifiOff size={12} />
          <span>
            {backendReachable && backendSttAvailable === false
              ? 'Server voice off — use the offline model.'
              : 'Backend offline — voice unavailable.'}
          </span>
          <button
            type="button"
            className="tutor-whisper-download-btn"
            onClick={localWhisper.loadModel}
          >
            <Download size={11} />
            Download offline model
          </button>
        </div>
      )}
      {sessionActorRole === 'teacher' && localWhisper.isLoading && (
        <div className="tutor-whisper-bar">
          <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
          <span>
            {localWhisper.status === 'downloading'
              ? `Downloading voice model… ${localWhisper.progress}%`
              : 'Loading voice model…'}
          </span>
          {localWhisper.status === 'downloading' && (
            <div className="tutor-whisper-progress">
              <div
                className="tutor-whisper-progress-fill"
                style={{ width: `${localWhisper.progress}%` }}
              />
            </div>
          )}
        </div>
      )}
      {sessionActorRole === 'teacher' && localWhisper.status === 'error' && (
        <div className="tutor-whisper-bar error">
          <span>Offline model failed to load.</span>
          <button
            type="button"
            className="tutor-whisper-download-btn"
            onClick={localWhisper.loadModel}
          >
            Retry
          </button>
        </div>
      )}

      {/* Student reply input */}
      {(speech.isListening || speech.isTranscribing) && (() => {
        let statusLabel: React.ReactNode;
        if (speech.isTranscribing) {
          statusLabel = speech.usedLocal ? 'Transcribing locally…' : 'Transcribing…';
        } else if (partialTranscript) {
          statusLabel = (
            <>
              <span style={{ opacity: 0.7, marginRight: 6, flexShrink: 0 }}>Listening…</span>
              <span className="tutor-listening-partial">&ldquo;{partialTranscript}&rdquo;</span>
            </>
          );
        } else if (localWhisper.isLoading) {
          statusLabel = `Listening… (voice model ${
            localWhisper.status === 'downloading' ? `${localWhisper.progress}%` : 'loading'
          })`;
        } else if (!localWhisper.isReady) {
          statusLabel = 'Listening… (waiting for voice model)';
        } else {
          statusLabel = 'Listening… click mic to send';
        }

        const remainingSec = Math.max(0, Math.ceil((speech.maxMs - speech.elapsedMs) / 1000));
        const pct = Math.min(100, (speech.elapsedMs / speech.maxMs) * 100);

        return (
          <div className="tutor-listening-bar">
            <span className="tutor-listening-dot" />
            <div className="tutor-listening-text">{statusLabel}</div>
            {speech.isListening && (
              <>
                <span className={`tutor-listening-timer ${remainingSec <= 5 ? 'warn' : ''}`}>
                  {remainingSec}s
                </span>
                <button
                  type="button"
                  className="tutor-listening-cancel"
                  onClick={() => { speech.cancelListening(); setPartialTranscript(''); }}
                  title="Cancel (discard)"
                  aria-label="Cancel recording"
                >
                  <X size={12} />
                </button>
              </>
            )}
            {speech.isListening && (
              <span
                className="tutor-listening-progress"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
            )}
          </div>
        );
      })()}
      <div className="tutor-input-row">
        <button
          type="button"
          className={`tutor-mic-btn ${speech.isListening ? 'recording' : ''} ${speech.isTranscribing ? 'transcribing' : ''}`}
          onClick={speech.isListening ? speech.stopListening : () => void speech.startListening()}
          disabled={speech.isTranscribing || tutorStreaming}
          title={(() => {
            if (speech.isListening) return 'Stop recording & send';
            if (backendReachable && backendSttAvailable !== false) return 'Hold to speak';
            if (localWhisper.isReady) return 'Speak (offline voice model)';
            if (localWhisper.isLoading) return 'Loading offline voice model…';
            return 'Tap to speak (will download offline voice model)';
          })()}
          aria-label={speech.isListening ? 'Stop voice input' : 'Start voice input'}
        >
          {speech.isTranscribing ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : speech.isListening ? <MicOff size={14} /> : <Mic size={14} />}
          {((!backendReachable || backendSttAvailable === false) && localWhisper.isReady) && (
            <span className="tutor-mic-offline-badge" title="Using offline voice model" />
          )}
        </button>
        <div className="tutor-input-wrap">
          <textarea
            ref={inputRef}
            className="tutor-input"
            placeholder={speech.isListening ? 'Listening…' : 'Reply to Sketch…'}
            value={inputDisplayValue}
            rows={1}
            readOnly={speech.isListening && Boolean(partialTranscript)}
            onChange={(e) => {
              if (speech.isListening) return;
              setStudentInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          {(inputDisplayValue.length > 0 || partialTranscript) && !tutorStreaming && (
            <button
              type="button"
              className="tutor-input-clear"
              title="Clear prompt"
              aria-label="Clear prompt"
              onClick={() => {
                if (speech.isListening) {
                  speech.cancelListening();
                }
                setStudentInput('');
                setPartialTranscript('');
                baseInputOnRecordRef.current = '';
                setTimeout(() => inputRef.current?.focus(), 20);
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="tutor-send-btn"
          onClick={() => void handleSend()}
          disabled={!studentInput.trim() || tutorStreaming}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Render message with rich markdown ────────────────────────────────────────

function renderInline(text: string, keyPrefix: string): ReactNode {
  // Handle: **bold**, *italic*, `inline code`
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-i${i}`;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={key} className="tutor-inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return <span key={key}>{part}</span>;
  });
}

/** Renders markdown-ish body (used for spoken + detail sections). */
function renderMessageParts(text: string): ReactNode {
  if (!text) return null;

  // Split out fenced code blocks first (``` ... ```)
  const topParts = text.split(/(```[\s\S]*?```)/g);

  return topParts.map((part, partIdx) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3);
      const firstNewline = inner.indexOf('\n');
      const lang = firstNewline > 0 ? inner.slice(0, firstNewline).trim() : '';
      const codeContent = lang ? inner.slice(firstNewline + 1) : inner;
      return (
        <pre key={`cb-${partIdx}`} className="tutor-code-block">
          {lang && <span className="tutor-code-block-lang">{lang}</span>}
          <code>{codeContent.replace(/\n$/, '')}</code>
        </pre>
      );
    }

    // Split into paragraphs on blank lines
    const paragraphs = part.split(/\n{2,}/);
    return paragraphs.map((para, paraIdx) => {
      const key = `p${partIdx}-${paraIdx}`;
      if (!para.trim()) return null;

      const lines = para.split('\n');

      // Bullet list: lines starting with "- " or "* "
      const isBulletList = lines.some((l) => /^[-*] /.test(l.trim()));
      if (isBulletList) {
        return (
          <ul key={key} className="tutor-list">
            {lines
              .filter((l) => /^[-*] /.test(l.trim()))
              .map((line, li) => {
                const content = line.trim().replace(/^[-*] /, '');
                return <li key={`${key}-li${li}`}>{renderInline(content, `${key}-li${li}`)}</li>;
              })}
          </ul>
        );
      }

      // Normal paragraph — join lines with spaces, preserve single newlines as breaks
      return (
        <p key={key} className="tutor-para">
          {lines.map((line, li) => (
            <span key={`${key}-ln${li}`}>
              {li > 0 && <br />}
              {renderInline(line, `${key}-ln${li}`)}
            </span>
          ))}
        </p>
      );
    });
  });
}

function clampWordHighlightIndex(plain: string, idx: number): number {
  const words = plain.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  return Math.min(Math.max(0, idx), words.length - 1);
}

function renderPlainWordsWithHighlight(
  plain: string,
  activeIdx: number,
  activeWordRef?: (el: HTMLSpanElement | null) => void,
): ReactNode {
  if (!plain) return null;
  const safeIdx = clampWordHighlightIndex(plain, activeIdx);
  const tokens = plain.split(/(\s+)/);
  let wi = 0;
  return tokens.map((tok, i) => {
    if (/^\s+$/.test(tok)) {
      return <span key={`sp-${i}`}>{tok}</span>;
    }
    const idx = wi;
    wi += 1;
    const isPast = idx < safeIdx;
    const isActive = idx === safeIdx;
    return (
      <span
        key={`w-${i}`}
        ref={isActive ? activeWordRef : undefined}
        className={`tutor-tts-word ${isActive ? 'tutor-tts-word--active' : ''} ${isPast ? 'tutor-tts-word--past' : ''}`}
      >
        {tok}
      </span>
    );
  });
}

function renderTutorBubbleContent(
  raw: string,
  options: {
    karaoke: boolean;
    activeWordIndex: number;
    activeWordRef?: (el: HTMLSpanElement | null) => void;
  },
): ReactNode {
  const { karaoke, activeWordIndex, activeWordRef } = options;
  const m = SPOKEN_DETAIL_DELIM.exec(raw);
  if (m) {
    const before = raw.slice(0, m.index).trim();
    const after = raw.slice(m.index + m[0].length).trim();
    const plainSpoken = stripMarkdown(before);
    return (
      <div className="tutor-msg-parts">
        <div className={`tutor-msg-spoken ${karaoke ? 'tutor-msg-spoken-karaoke' : ''}`}>
          {karaoke
            ? renderPlainWordsWithHighlight(plainSpoken, activeWordIndex, activeWordRef)
            : renderMessageParts(before)}
        </div>
        <div className="tutor-msg-detail" aria-label="Written detail">
          {renderMessageParts(after)}
        </div>
      </div>
    );
  }
  if (karaoke) {
    const plain = extractSpokenChannel(stripMarkdown(raw));
    return renderPlainWordsWithHighlight(plain, activeWordIndex, activeWordRef);
  }
  return renderMessageParts(raw);
}

function renderMessage(text: string): ReactNode {
  if (!text) return null;
  const m = SPOKEN_DETAIL_DELIM.exec(text);
  if (m) {
    const before = text.slice(0, m.index).trim();
    const after = text.slice(m.index + m[0].length).trim();
    return (
      <div className="tutor-msg-parts">
        <div className="tutor-msg-spoken">{renderMessageParts(before)}</div>
        <div className="tutor-msg-detail" aria-label="Written detail">
          {renderMessageParts(after)}
        </div>
      </div>
    );
  }
  return renderMessageParts(text);
}
