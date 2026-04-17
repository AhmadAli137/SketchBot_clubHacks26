'use client';

import { motion } from 'motion/react';
import type { QuizPayload } from '@/lib/lesson-types';

type QuizStepProps = {
  quiz: QuizPayload;
  selectedAnswer: number | null;
  onAnswer: (index: number) => void;
};

export function QuizStep({ quiz, selectedAnswer, onAnswer }: QuizStepProps) {
  const answered = selectedAnswer !== null;
  const isCorrect = selectedAnswer === quiz.correct_index;

  return (
    <div className="lesson-quiz">
      <p className="lesson-quiz-question">{quiz.question}</p>

      <div className="lesson-quiz-options">
        {quiz.options.map((option, i) => {
          let optionClass = 'lesson-quiz-option';
          if (answered) {
            if (i === quiz.correct_index) optionClass += ' correct';
            else if (i === selectedAnswer) optionClass += ' incorrect';
          }

          return (
            <motion.button
              key={i}
              type="button"
              className={optionClass}
              onClick={() => !answered && onAnswer(i)}
              disabled={answered}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * i, duration: 0.25 }}
              whileHover={!answered ? { scale: 1.02 } : undefined}
              whileTap={!answered ? { scale: 0.98 } : undefined}
            >
              <span className="lesson-quiz-letter">
                {String.fromCharCode(65 + i)}
              </span>
              <span>{option}</span>
            </motion.button>
          );
        })}
      </div>

      {answered && (
        <motion.div
          className={`lesson-quiz-feedback ${isCorrect ? 'correct' : 'incorrect'}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span>{isCorrect ? '✅' : '💡'}</span>
          <span>{isCorrect ? 'Correct!' : quiz.explanation}</span>
        </motion.div>
      )}
    </div>
  );
}
