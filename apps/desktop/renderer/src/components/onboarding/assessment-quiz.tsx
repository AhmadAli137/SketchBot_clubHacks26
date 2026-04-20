'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { AgeGroup } from '@/lib/concept-types';

type Question = {
  prompt: string;
  options: string[];
  correctIndex: number;
};

const QUESTIONS: Record<AgeGroup, Question[]> = {
  explorer: [
    {
      prompt: 'What happens when you give a robot instructions?',
      options: ['It goes to sleep', 'It follows the instructions', 'It asks a teacher'],
      correctIndex: 1,
    },
    {
      prompt: 'A robot takes 4 steps forward and 1 step back. How far is it from where it started?',
      options: ['5 steps', '3 steps', '2 steps'],
      correctIndex: 1,
    },
    {
      prompt: 'What does "repeat 3 times" tell a robot to do?',
      options: ['Do it just once', 'Do it 3 times in a row', 'Wait 3 seconds'],
      correctIndex: 1,
    },
    {
      prompt: 'A robot turns a quarter of the way around. How many degrees did it turn?',
      options: ['45 degrees', '90 degrees', '180 degrees'],
      correctIndex: 1,
    },
    {
      prompt: 'Which of these is a shape a robot could draw?',
      options: ['A sandwich', 'A square', 'A cloud'],
      correctIndex: 1,
    },
  ],
  builder: [
    {
      prompt: 'In programming, what does a "loop" do?',
      options: ['Draws a circle shape', 'Repeats a block of code', 'Connects to Wi-Fi'],
      correctIndex: 1,
    },
    {
      prompt: 'What are X and Y coordinates used for in robotics?',
      options: ['Measuring temperature', 'Describing position on a grid', 'Counting program steps'],
      correctIndex: 1,
    },
    {
      prompt: 'A robot drives in a square. If each side is 200mm, how far does it travel total?',
      options: ['400mm', '800mm', '1600mm'],
      correctIndex: 1,
    },
    {
      prompt: 'What does this rule mean: "if distance < 5 cm → stop"?',
      options: ['Move forward 5 cm', 'Stop when something is too close', 'Measure speed every 5 cm'],
      correctIndex: 1,
    },
    {
      prompt: 'Which of these is NOT a programming concept?',
      options: ['Variable', 'Function', 'Thermostat reading'],
      correctIndex: 2,
    },
  ],
  engineer: [
    {
      prompt: 'What does PID stand for in control theory?',
      options: ['Power Input Device', 'Proportional-Integral-Derivative', 'Parallel Interface Driver'],
      correctIndex: 1,
    },
    {
      prompt: 'A wheel has radius 30 mm. Approximately how far does the robot travel per full wheel revolution?',
      options: ['94 mm', '188 mm', '360 mm'],
      correctIndex: 1,
    },
    {
      prompt: 'For a differential-drive robot, if the left wheel spins faster than the right, which way does it turn?',
      options: ['Left', 'Right', 'It goes straight'],
      correctIndex: 1,
    },
    {
      prompt: 'What is inverse kinematics used for?',
      options: [
        'Filtering sensor noise',
        'Computing joint angles from an end-effector target position',
        'Measuring battery voltage',
      ],
      correctIndex: 1,
    },
    {
      prompt: 'What is an AprilTag primarily used for in robotics?',
      options: ['Labelling robot parts', 'Visual pose estimation and localization', 'Measuring torque'],
      correctIndex: 1,
    },
  ],
};

const PASS_THRESHOLD = 3;

type Props = {
  level: AgeGroup;
  onPass: (level: AgeGroup) => void;
  onSuggestDown: (suggested: AgeGroup) => void;
  onBack: () => void;
};

export function AssessmentQuiz({ level, onPass, onSuggestDown, onBack }: Props) {
  const questions = QUESTIONS[level];
  const [step, setStep] = useState<'quiz' | 'result'>('quiz');
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const current = questions[qIndex];
  const score = answers.filter(Boolean).length;
  const passed = score >= PASS_THRESHOLD;

  const levelDown: AgeGroup =
    level === 'engineer' ? 'builder' : level === 'builder' ? 'explorer' : 'explorer';

  const commit = () => {
    if (selected === null) return;
    const correct = selected === current.correctIndex;
    const next = [...answers, correct];
    setAnswers(next);
    setConfirmed(false);
    setSelected(null);

    if (qIndex + 1 < questions.length) {
      setQIndex((i) => i + 1);
    } else {
      setStep('result');
    }
  };

  const levelMeta: Record<AgeGroup, { emoji: string; name: string; color: string }> = {
    explorer: { emoji: '🚀', name: 'Explorer', color: '#f59e0b' },
    builder: { emoji: '⚙️', name: 'Builder', color: '#3b82f6' },
    engineer: { emoji: '🧮', name: 'Engineer', color: '#8b5cf6' },
  };
  const meta = levelMeta[level];
  const suggestMeta = levelMeta[levelDown];

  return (
    <div className="quiz-shell">
      <AnimatePresence mode="wait">
        {step === 'quiz' && (
          <motion.div
            key={`q-${qIndex}`}
            className="quiz-card"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Progress dots */}
            <div className="quiz-progress">
              {questions.map((_, i) => (
                <div
                  key={i}
                  className={`quiz-dot ${i < answers.length ? (answers[i] ? 'correct' : 'wrong') : i === qIndex ? 'current' : ''}`}
                />
              ))}
            </div>

            <p className="quiz-counter">Question {qIndex + 1} of {questions.length}</p>
            <h2 className="quiz-question">{current.prompt}</h2>

            <div className="quiz-options">
              {current.options.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  className={`quiz-option ${selected === i ? (confirmed ? (i === current.correctIndex ? 'correct' : 'wrong') : 'selected') : ''}`}
                  onClick={() => { setSelected(i); setConfirmed(false); }}
                >
                  <span className="quiz-option-letter">{String.fromCharCode(65 + i)}</span>
                  {opt}
                </button>
              ))}
            </div>

            <div className="quiz-actions">
              <button type="button" className="quiz-btn-ghost" onClick={onBack}>
                ← Back
              </button>
              <button
                type="button"
                className="quiz-btn-primary"
                disabled={selected === null}
                onClick={commit}
              >
                {qIndex + 1 < questions.length ? 'Next →' : 'See Results'}
              </button>
            </div>
          </motion.div>
        )}

        {step === 'result' && (
          <motion.div
            key="result"
            className="quiz-card"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="quiz-result-emoji">{passed ? '🎉' : '💡'}</div>
            <h2 className="quiz-result-title">
              {passed ? `You got ${score}/5 — great job!` : `You got ${score}/5`}
            </h2>

            {passed ? (
              <>
                <p className="quiz-result-body">
                  You're ready for{' '}
                  <span style={{ color: meta.color, fontWeight: 700 }}>
                    {meta.emoji} {meta.name}
                  </span>
                  . Let's go!
                </p>
                <button
                  type="button"
                  className="quiz-btn-primary"
                  style={{ background: meta.color }}
                  onClick={() => onPass(level)}
                >
                  Start as {meta.name} →
                </button>
              </>
            ) : (
              <>
                <p className="quiz-result-body">
                  No worries — we suggest starting at{' '}
                  <span style={{ color: suggestMeta.color, fontWeight: 700 }}>
                    {suggestMeta.emoji} {suggestMeta.name}
                  </span>
                  . You can always level up later!
                </p>
                <div className="quiz-result-btns">
                  <button
                    type="button"
                    className="quiz-btn-ghost"
                    onClick={() => onPass(level)}
                  >
                    Stay at {meta.name} anyway
                  </button>
                  <button
                    type="button"
                    className="quiz-btn-primary"
                    style={{ background: suggestMeta.color }}
                    onClick={() => onSuggestDown(levelDown)}
                  >
                    Switch to {suggestMeta.name} →
                  </button>
                </div>
              </>
            )}

            <button type="button" className="quiz-retry" onClick={() => { setStep('quiz'); setQIndex(0); setAnswers([]); setSelected(null); }}>
              Retake quiz
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
