'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Lightbulb, Mic, MicOff, RefreshCw, RotateCcw, Send, Square, TrendingUp, Volume2, VolumeX } from 'lucide-react';
import { AGE_GROUP_META, LAYER_META, type AgeGroup, type ConceptLayer } from '@/lib/concept-types';
import {
  BADGE_DEFINITIONS,
  applyTutorEvaluation,
  awardBadge,
  completeConceptLayer,
  getConceptProgressSnapshot,
  touchConcept,
  type ConceptProgressSnapshot,
} from '@/lib/progress-store';

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
};

type EvaluationNotice = {
  passed: boolean;
  feedback: string;
  suggestNextLayer: boolean;
  nextLayerAvailable: ConceptLayer | null;
  awardedBadges: string[];
  mastered: boolean;
};

const LAYERS: ConceptLayer[] = ['intuitive', 'structural', 'precise'];

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Voice input via MediaRecorder + Whisper ─────────────────────────────────
// Web Speech API doesn't work in Electron (requires Google's proprietary
// speech service bundled with Chrome, not available in Electron/Chromium).
// Instead: record with MediaRecorder → POST audio blob → backend Whisper.

function useVoiceInput(onTranscript: (text: string) => void, apiBase: string) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopListening = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop(); // triggers onstop → sends to backend
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      // Pick a supported MIME type
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(
        (m) => MediaRecorder.isTypeSupported(m),
      ) ?? '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Always release the mic
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (chunksRef.current.length === 0) return;
        setIsTranscribing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
          const fd = new FormData();
          fd.append('audio', blob, 'recording.webm');

          const res = await fetch(`${apiBase}/api/tutor/transcribe`, {
            method: 'POST',
            body: fd,
          });
          if (res.ok) {
            const data = (await res.json()) as { text?: string };
            if (data.text?.trim()) onTranscript(data.text.trim());
          }
        } catch (err) {
          console.warn('[VoiceInput] transcription failed:', err);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
    } catch (err) {
      console.warn('[VoiceInput] mic access failed:', err);
      setIsListening(false);
    }
  }, [apiBase, onTranscript]);

  // Cleanup on unmount
  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { isListening, isTranscribing, startListening, stopListening };
}

// ─── Text-to-speech hook ──────────────────────────────────────────────────────

function useTTS() {
  const [enabled, setEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const speak = useCallback((text: string, ageGroup: AgeGroup) => {
    if (!enabled || !supported) return;
    window.speechSynthesis.cancel();

    // Strip markdown so the voice reads cleanly
    const cleaned = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^[-*] /gm, '')
      .replace(/\n+/g, ' ')
      .trim();

    if (!cleaned) return;

    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.rate = ageGroup === 'explorer' ? 0.88 : ageGroup === 'builder' ? 0.94 : 1.0;
    utterance.pitch = ageGroup === 'explorer' ? 1.15 : 1.0;
    utterance.volume = 1;

    // Prefer a friendly voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) =>
      /Google|Samantha|Karen|Susan|Moira|Tessa/i.test(v.name),
    );
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [enabled, supported]);

  const stopSpeaking = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      if (prev && supported) window.speechSynthesis.cancel();
      return !prev;
    });
  }, [supported]);

  return { enabled, speaking, supported, speak, stopSpeaking, toggle };
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
}: TutorPanelProps) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [studentInput, setStudentInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [progressSnapshot, setProgressSnapshot] = useState<ConceptProgressSnapshot | null>(null);
  const [evaluationNotice, setEvaluationNotice] = useState<EvaluationNotice | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevConceptRef = useRef<string | null>(null);
  const prevLayerRef = useRef<ConceptLayer>('intuitive');
  const lastEvaluatedKeyRef = useRef<string | null>(null);
  const lastSpokenMsgRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const tts = useTTS();
  const speech = useVoiceInput((transcript) => {
    setStudentInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, apiBase);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  // TTS — speak the most recent tutor message once streaming ends
  useEffect(() => {
    const last = messages.at(-1);
    if (!last || last.role !== 'tutor' || last.isStreaming) return;
    if (last.content === lastSpokenMsgRef.current) return;
    lastSpokenMsgRef.current = last.content;
    tts.speak(last.content, ageGroup);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Send tutor message when concept or layer changes
  useEffect(() => {
    const conceptChanged = conceptId !== prevConceptRef.current;
    const layerChanged = activeLayer !== prevLayerRef.current;
    prevConceptRef.current = conceptId;
    prevLayerRef.current = activeLayer;

    if (!conceptChanged && !layerChanged) return;

    // Record progress touch
    if (conceptId && studentName) {
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
  }, [conceptId, activeLayer]);

  // Notify tutor when a drawing is submitted
  useEffect(() => {
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
          const response = await fetch(`${apiBase}/api/tutor/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student_name: studentName,
              age_group: ageGroup,
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
          };

          const result =
            conceptId && studentName
              ? applyTutorEvaluation(
                  studentName,
                  conceptId,
                  activeLayer,
                  Boolean(evaluation.passed),
                  Boolean(evaluation.suggest_next_layer),
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
            });
          }
        } catch {
          setEvaluationNotice({
            passed: false,
            feedback: 'Sketch is still thinking about how this drawing shows the concept. Try another variation or ask for a hint.',
            suggestNextLayer: false,
            nextLayerAvailable: null,
            awardedBadges: [],
            mastered: false,
          });
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingPrompt]);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsSending(false);
    // Mark any in-progress message as complete
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
    );
  }, []);

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
    const tutorMsgId = genId();
    setMessages((prev) => [
      ...prev,
      { id: tutorMsgId, role: 'tutor', content: '', isStreaming: true },
    ]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`${apiBase}/api/tutor/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          student_name: studentName,
          age_group: ageGroup,
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
              } else if (msg.type === 'done') {
                // Stream finished — mark complete
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === tutorMsgId ? { ...m, isStreaming: false } : m,
                  ),
                );
                return;
              }
              // msg.type === 'error' falls through to the catch below on next iteration
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
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User stopped the stream — just mark it done, keep whatever was received
        setMessages((prev) =>
          prev.map((m) => (m.id === tutorMsgId ? { ...m, isStreaming: false } : m)),
        );
        return;
      }
      // Network/other error — replace placeholder with offline fallback
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
      if (abortControllerRef.current?.signal.aborted === false) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleSend = async () => {
    const text = studentInput.trim();
    if (!text || isSending) return;

    setStudentInput('');
    setMessages((prev) => [...prev, { id: genId(), role: 'student', content: text }]);
    setIsSending(true);

    try {
      await streamTutorMessage({
        trigger: 'student_reply',
        concept_id: conceptId ?? 'free-draw',
        layer: activeLayer,
        student_message: text,
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleHint = async () => {
    setIsSending(true);
    try {
      await streamTutorMessage({
        trigger: 'hint_request',
        concept_id: conceptId ?? 'free-draw',
        layer: activeLayer,
        drawing_prompt: drawingPrompt ?? '',
        path_count: pathCount ?? 0,
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleGoDeeper = () => {
    const currentIdx = LAYERS.indexOf(activeLayer);
    if (currentIdx < LAYERS.length - 1) {
      const nextLayer = LAYERS[currentIdx + 1];
      if (conceptId && studentName) {
        completeConceptLayer(studentName, conceptId, activeLayer);
        touchConcept(studentName, conceptId, nextLayer);
        awardBadge(studentName, 'went-deeper');
        setProgressSnapshot(getConceptProgressSnapshot(studentName, conceptId));
      }
      setEvaluationNotice(null);
      onLayerChange(nextLayer);
    }
  };

  const canGoDeeper = LAYERS.indexOf(activeLayer) < LAYERS.length - 1;

  // Starter chips — context-aware quick replies shown before first user message
  const starterChips = messages.length <= 1
    ? (drawingPrompt
        ? ['What did the robot just do?', 'How can I make this more complex?', 'Explain the math behind this']
        : ['What should I try first?', 'Give me a challenge', 'How does the robot work?'])
    : [];

  return (
    <div className="tutor-panel">
      {/* Header */}
      <div className="tutor-panel-header">
        <div className="tutor-header-top">
          <div className={`tutor-avatar-large ${tts.speaking ? 'speaking' : ''}`}>🤖</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="tutor-name">Sketch</div>
            <div className="tutor-concept-label">
              {conceptTitle || 'Free Draw'} · {AGE_GROUP_META[ageGroup].label}
            </div>
          </div>
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

      {/* Message feed */}
      <div ref={feedRef} className="tutor-feed">
        {messages.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: '0.82rem', textAlign: 'center', paddingTop: 20 }}>
            Connecting to tutor…
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`tutor-msg-row ${msg.role === 'student' ? 'from-student' : ''}`}>
            {msg.role === 'tutor' && (
              <div className="tutor-msg-avatar">🤖</div>
            )}
            <div className="tutor-msg-bubble">
              {renderMessage(msg.content)}
              {msg.isStreaming && <span className="tutor-cursor" />}
            </div>
          </div>
        ))}
      </div>

      {/* Starter chips */}
      {starterChips.length > 0 && (
        <div className="tutor-starter-chips">
          {starterChips.map((chip) => (
            <button
              key={chip}
              type="button"
              className="tutor-chip"
              disabled={isSending}
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

      {/* Action buttons */}
      <div className="tutor-actions">
        {isSending ? (
          <button
            type="button"
            className="tutor-action-btn stop"
            onClick={stopStreaming}
          >
            <Square size={11} />
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="tutor-action-btn"
            onClick={handleHint}
            disabled={isSending}
          >
            <Lightbulb size={12} />
            Hint
          </button>
        )}
        {canGoDeeper && !isSending && (
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

      {evaluationNotice && (
        <div className={`tutor-evaluation-card ${evaluationNotice.passed ? 'passed' : 'pending'}`}>
          <div className="tutor-evaluation-title">
            {evaluationNotice.mastered
              ? 'Concept mastered'
              : evaluationNotice.passed
                ? 'Layer completed'
                : 'Keep exploring'}
          </div>
          <div className="tutor-evaluation-copy">{evaluationNotice.feedback}</div>
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

      {/* Student reply input */}
      {(speech.isListening || speech.isTranscribing) && (
        <div className="tutor-listening-bar">
          <span className="tutor-listening-dot" />
          {speech.isTranscribing ? 'Transcribing…' : 'Listening… click mic to send'}
        </div>
      )}
      <div className="tutor-input-row">
        <button
          type="button"
          className={`tutor-mic-btn ${speech.isListening ? 'recording' : ''} ${speech.isTranscribing ? 'transcribing' : ''}`}
          onClick={speech.isListening ? speech.stopListening : () => void speech.startListening()}
          disabled={speech.isTranscribing || isSending}
          title={speech.isListening ? 'Stop recording & send' : 'Hold to speak'}
          aria-label={speech.isListening ? 'Stop voice input' : 'Start voice input'}
        >
          {speech.isTranscribing ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : speech.isListening ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
        <textarea
          ref={inputRef}
          className="tutor-input"
          placeholder={speech.isListening ? 'Listening…' : 'Reply to Sketch…'}
          value={studentInput}
          rows={1}
          onChange={(e) => setStudentInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <button
          type="button"
          className="tutor-send-btn"
          onClick={() => void handleSend()}
          disabled={!studentInput.trim() || isSending}
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

function renderMessage(text: string): ReactNode {
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
