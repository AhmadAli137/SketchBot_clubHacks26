'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ChallengePayload } from '@/lib/lesson-types';

type ChallengeStepProps = {
  challenge: ChallengePayload;
  isComplete: boolean;
  onSubmit: (input: string) => void;
};

export function ChallengeStep({ challenge, isComplete, onSubmit }: ChallengeStepProps) {
  const [input, setInput] = useState('');
  const [showHints, setShowHints] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);

  const handleSubmit = () => {
    if (input.trim()) {
      onSubmit(input.trim());
    }
  };

  return (
    <div className="lesson-challenge">
      <div className="lesson-challenge-header">
        <span className="lesson-challenge-icon">🎯</span>
        <p className="lesson-challenge-instruction">{challenge.instruction}</p>
      </div>

      {!isComplete && (
        <motion.div
          className="lesson-challenge-input-area"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <input
            type="text"
            className="lesson-challenge-input"
            placeholder={
              challenge.input_mode === 'code'
                ? 'Type your code...'
                : challenge.input_mode === 'blocks'
                  ? 'Describe your block program...'
                  : 'Type your drawing prompt...'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <button
            type="button"
            className="lesson-challenge-submit"
            onClick={handleSubmit}
            disabled={!input.trim()}
          >
            Submit
          </button>
        </motion.div>
      )}

      {!isComplete && challenge.hints.length > 0 && (
        <div className="lesson-challenge-hints">
          <button
            type="button"
            className="lesson-hint-toggle"
            onClick={() => {
              if (!showHints) setShowHints(true);
              else if (hintIndex < challenge.hints.length - 1) setHintIndex(hintIndex + 1);
            }}
          >
            {showHints
              ? hintIndex < challenge.hints.length - 1
                ? 'Next hint'
                : 'No more hints'
              : `💡 Need a hint? (${challenge.hints.length} available)`}
          </button>

          <AnimatePresence>
            {showHints && (
              <motion.p
                key={`hint-${hintIndex}`}
                className="lesson-hint-text"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
              >
                {challenge.hints[hintIndex]}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      {isComplete && (
        <motion.div
          className="lesson-challenge-success"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <span>✅</span>
          <span>Challenge submitted! Great work!</span>
        </motion.div>
      )}
    </div>
  );
}
