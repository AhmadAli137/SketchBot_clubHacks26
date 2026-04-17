import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import * as Speech from 'expo-speech';

import { colors, radius, space } from '../theme';
import type { LessonPlan, LessonStep, BotEmotion, QuizPayload, ChallengePayload } from '../lesson-types';

// ─── Emotion Config ──────────────────────────────────────────────────────────

const EMOTION_EMOJI: Record<BotEmotion, string> = {
  idle: '🤖',
  curious: '🤔',
  excited: '🤩',
  thinking: '💭',
  celebrating: '🎉',
  encouraging: '💪',
};

// ─── Props ───────────────────────────────────────────────────────────────────

type LessonPlayerProps = {
  plan: LessonPlan;
  backendUrl: string;
  onComplete?: () => void;
  onClose?: () => void;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function LessonPlayer({ plan, backendUrl, onComplete, onClose }: LessonPlayerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [challengeInput, setChallengeInput] = useState('');
  const [challengeDone, setChallengeDone] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const steps = plan.steps;
  const currentStep = steps[stepIndex] ?? null;
  const botEmoji = EMOTION_EMOJI[currentStep?.bot_emotion ?? 'idle'];

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const animateTransition = (callback: () => void) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setTimeout(callback, 160);
  };

  const goToStep = useCallback((idx: number) => {
    clearTimer();
    Speech.stop();
    setQuizAnswer(null);
    setChallengeInput('');
    setChallengeDone(false);
    setShowHint(false);
    animateTransition(() => setStepIndex(idx));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const advanceStep = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      setIsPlaying(false);
      setIsComplete(true);
      onComplete?.();
      return;
    }
    goToStep(stepIndex + 1);
  }, [stepIndex, steps.length, goToStep, onComplete]);

  // Auto-advance timer
  useEffect(() => {
    if (!isPlaying || !currentStep) return;

    // Don't auto-advance on interactive steps
    if (currentStep.type === 'quiz' || currentStep.type === 'challenge') return;

    const dur = (currentStep.duration_s + (currentStep.delay_s ?? 0)) * 1000;
    timerRef.current = setTimeout(advanceStep, dur);
    return clearTimer;
  }, [isPlaying, stepIndex, currentStep, advanceStep]);

  // TTS via expo-speech
  useEffect(() => {
    if (currentStep?.narration?.text && isPlaying) {
      Speech.speak(currentStep.narration.text, {
        language: 'en',
        rate: 0.95,
        onDone: () => {},
      });
    }
    return () => { Speech.stop(); };
  }, [stepIndex, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleQuizAnswer = (idx: number) => {
    setQuizAnswer(idx);
    setTimeout(() => { if (isPlaying) advanceStep(); }, 2000);
  };

  const handleChallengeSubmit = () => {
    if (!challengeInput.trim()) return;
    setChallengeDone(true);
    setTimeout(() => { if (isPlaying) advanceStep(); }, 1500);
  };

  const progress = steps.length > 0 ? (stepIndex + 1) / steps.length : 0;

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{plan.title}</Text>
        <Text style={s.counter}>{stepIndex + 1}/{steps.length}</Text>
      </View>

      {/* Progress bar */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Content */}
      <ScrollView style={s.stage} contentContainerStyle={s.stageContent}>
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Bot emoji */}
          <View style={s.botRow}>
            <View style={s.botBubble}>
              <Text style={s.botEmoji}>{botEmoji}</Text>
            </View>
          </View>

          {/* Narration */}
          {currentStep?.narration && (
            <View style={s.narrationCard}>
              <Text style={s.narrationText}>{currentStep.narration.text}</Text>
            </View>
          )}

          {/* Drawing */}
          {currentStep?.type === 'drawing' && currentStep.drawing && (
            <View style={s.drawingBadge}>
              <Text style={s.drawingBadgeText}>🤖✏️ {currentStep.drawing.prompt}</Text>
            </View>
          )}

          {/* Quiz */}
          {currentStep?.type === 'quiz' && currentStep.quiz && (
            <QuizView
              quiz={currentStep.quiz}
              answer={quizAnswer}
              onAnswer={handleQuizAnswer}
            />
          )}

          {/* Challenge */}
          {currentStep?.type === 'challenge' && currentStep.challenge && (
            <ChallengeView
              challenge={currentStep.challenge}
              input={challengeInput}
              onInputChange={setChallengeInput}
              onSubmit={handleChallengeSubmit}
              isDone={challengeDone}
              showHint={showHint}
              onToggleHint={() => setShowHint(true)}
            />
          )}

          {/* Celebrate */}
          {currentStep?.type === 'celebrate' && (
            <View style={s.celebrateBox}>
              <Text style={s.celebrateIcon}>🎉</Text>
              {currentStep.narration && (
                <Text style={s.celebrateText}>{currentStep.narration.text}</Text>
              )}
            </View>
          )}

          {/* Reveal */}
          {currentStep?.type === 'reveal' && (
            <View style={s.revealBox}>
              <Text style={s.revealIcon}>💡</Text>
              {currentStep.narration && (
                <Text style={s.revealText}>{currentStep.narration.text}</Text>
              )}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Controls */}
      <View style={s.controls}>
        <TouchableOpacity
          style={[s.ctrlBtn, stepIndex === 0 && s.ctrlBtnDisabled]}
          onPress={() => stepIndex > 0 && goToStep(stepIndex - 1)}
          disabled={stepIndex === 0}
        >
          <Text style={s.ctrlBtnText}>◀</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.playBtn}
          onPress={() => {
            if (isComplete) {
              setIsComplete(false);
              goToStep(0);
              setIsPlaying(true);
            } else {
              setIsPlaying(!isPlaying);
            }
          }}
        >
          <Text style={s.playBtnText}>{isPlaying ? '⏸' : isComplete ? '↺' : '▶'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.ctrlBtn, stepIndex >= steps.length - 1 && s.ctrlBtnDisabled]}
          onPress={() => stepIndex < steps.length - 1 && goToStep(stepIndex + 1)}
          disabled={stepIndex >= steps.length - 1}
        >
          <Text style={s.ctrlBtnText}>▶</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function QuizView({ quiz, answer, onAnswer }: { quiz: QuizPayload; answer: number | null; onAnswer: (i: number) => void }) {
  const answered = answer !== null;
  return (
    <View style={s.quizBox}>
      <Text style={s.quizQuestion}>{quiz.question}</Text>
      {quiz.options.map((opt, i) => {
        const isCorrect = answered && i === quiz.correct_index;
        const isWrong = answered && i === answer && i !== quiz.correct_index;
        return (
          <TouchableOpacity
            key={i}
            style={[s.quizOption, isCorrect && s.quizCorrect, isWrong && s.quizIncorrect]}
            onPress={() => !answered && onAnswer(i)}
            disabled={answered}
          >
            <View style={s.quizLetter}>
              <Text style={s.quizLetterText}>{String.fromCharCode(65 + i)}</Text>
            </View>
            <Text style={s.quizOptionText}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
      {answered && (
        <View style={s.quizFeedback}>
          <Text style={s.quizFeedbackText}>
            {answer === quiz.correct_index ? '✅ Correct!' : `💡 ${quiz.explanation}`}
          </Text>
        </View>
      )}
    </View>
  );
}

function ChallengeView({
  challenge, input, onInputChange, onSubmit, isDone, showHint, onToggleHint,
}: {
  challenge: ChallengePayload; input: string; onInputChange: (t: string) => void;
  onSubmit: () => void; isDone: boolean; showHint: boolean; onToggleHint: () => void;
}) {
  return (
    <View style={s.challengeBox}>
      <Text style={s.challengeInstruction}>🎯 {challenge.instruction}</Text>
      {!isDone && (
        <>
          <View style={s.challengeInputRow}>
            <TextInput
              style={s.challengeInput}
              value={input}
              onChangeText={onInputChange}
              placeholder="Type your answer..."
              placeholderTextColor={colors.muted2}
              returnKeyType="send"
              onSubmitEditing={onSubmit}
            />
            <TouchableOpacity style={s.challengeSubmit} onPress={onSubmit} disabled={!input.trim()}>
              <Text style={s.challengeSubmitText}>Go</Text>
            </TouchableOpacity>
          </View>
          {challenge.hints.length > 0 && !showHint && (
            <TouchableOpacity onPress={onToggleHint}>
              <Text style={s.hintToggle}>💡 Need a hint?</Text>
            </TouchableOpacity>
          )}
          {showHint && challenge.hints[0] && (
            <Text style={s.hintText}>{challenge.hints[0]}</Text>
          )}
        </>
      )}
      {isDone && (
        <View style={s.challengeSuccess}>
          <Text style={s.challengeSuccessText}>✅ Submitted!</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: space[4], paddingVertical: space[3],
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.panel2, justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { color: colors.muted, fontSize: 16, fontWeight: '700' },
  title: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  counter: { fontSize: 12, fontWeight: '700', color: colors.muted, fontFamily: 'monospace' },

  progressTrack: { height: 3, backgroundColor: colors.panel2 },
  progressFill: { height: '100%', backgroundColor: colors.cyan, borderRadius: 2 },

  stage: { flex: 1 },
  stageContent: { padding: space[5], gap: space[4] },

  botRow: { alignItems: 'flex-start' },
  botBubble: {
    width: 56, height: 56, borderRadius: 20,
    backgroundColor: 'rgba(93,228,255,0.1)', borderWidth: 1.5, borderColor: 'rgba(93,228,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  botEmoji: { fontSize: 28 },

  narrationCard: {
    backgroundColor: 'rgba(93,228,255,0.06)', borderWidth: 1, borderColor: 'rgba(93,228,255,0.12)',
    borderRadius: radius.md, padding: space[4],
  },
  narrationText: { fontSize: 15, lineHeight: 24, color: colors.text, fontWeight: '600' },

  drawingBadge: {
    alignSelf: 'center', paddingHorizontal: space[4], paddingVertical: space[3],
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,184,77,0.3)',
    backgroundColor: 'rgba(255,184,77,0.08)',
  },
  drawingBadgeText: { fontSize: 14, fontWeight: '600', color: colors.text },

  quizBox: { gap: space[2] },
  quizQuestion: { fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 24 },
  quizOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: space[3], borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel2,
  },
  quizCorrect: { borderColor: 'rgba(77,255,184,0.5)', backgroundColor: 'rgba(77,255,184,0.1)' },
  quizIncorrect: { borderColor: 'rgba(255,79,140,0.4)', backgroundColor: 'rgba(255,79,140,0.08)' },
  quizLetter: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(93,228,255,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  quizLetterText: { fontSize: 12, fontWeight: '800', color: colors.cyan },
  quizOptionText: { fontSize: 14, color: colors.text, flex: 1 },
  quizFeedback: { padding: space[3], borderRadius: radius.sm, backgroundColor: 'rgba(77,255,184,0.08)' },
  quizFeedbackText: { fontSize: 13, fontWeight: '600', color: colors.green },

  challengeBox: { gap: space[3] },
  challengeInstruction: { fontSize: 15, fontWeight: '600', color: colors.text, lineHeight: 23 },
  challengeInputRow: { flexDirection: 'row', gap: 8 },
  challengeInput: {
    flex: 1, paddingHorizontal: space[3], paddingVertical: space[2],
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.panel2, color: colors.text, fontSize: 14,
  },
  challengeSubmit: {
    paddingHorizontal: space[5], paddingVertical: space[2],
    borderRadius: radius.sm, backgroundColor: colors.cyan,
    justifyContent: 'center', alignItems: 'center',
  },
  challengeSubmitText: { fontSize: 13, fontWeight: '800', color: colors.bg },
  hintToggle: { fontSize: 13, color: colors.muted },
  hintText: {
    fontSize: 13, color: '#ffb84d', padding: space[3],
    borderRadius: radius.sm, backgroundColor: 'rgba(255,184,77,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,184,77,0.15)',
  },
  challengeSuccess: { padding: space[3], borderRadius: radius.sm, backgroundColor: 'rgba(77,255,184,0.1)' },
  challengeSuccessText: { fontSize: 14, fontWeight: '600', color: colors.green },

  celebrateBox: { alignItems: 'center', gap: space[3], paddingVertical: space[6] },
  celebrateIcon: { fontSize: 48 },
  celebrateText: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center', maxWidth: 300 },

  revealBox: { alignItems: 'center', gap: space[3], paddingVertical: space[5] },
  revealIcon: { fontSize: 40 },
  revealText: { fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center', maxWidth: 300 },

  controls: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12,
    paddingVertical: space[3], paddingHorizontal: space[4],
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.panel,
  },
  ctrlBtn: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  ctrlBtnDisabled: { opacity: 0.3 },
  ctrlBtnText: { color: colors.muted, fontSize: 14 },
  playBtn: {
    width: 48, height: 48, borderRadius: 14,
    borderWidth: 1.5, borderColor: 'rgba(93,228,255,0.3)',
    backgroundColor: 'rgba(93,228,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  playBtnText: { color: colors.cyan, fontSize: 18 },
});
