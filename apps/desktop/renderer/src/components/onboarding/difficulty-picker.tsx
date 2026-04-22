'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import type { AgeGroup } from '@/lib/concept-types';
import { AssessmentQuiz } from './assessment-quiz';

type Level = {
  id: AgeGroup;
  emoji: string;
  name: string;
  age: string;
  color: string;
  glow: string;
  tagline: string;
  unlocks: string[];
};

const LEVELS: Level[] = [
  {
    id: 'explorer',
    emoji: '🚀',
    name: 'Explorer',
    age: 'Ages 6–10',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.25)',
    tagline: 'Discover robotics through play',
    unlocks: ['Natural language rules', 'Manual robot controls', '5 guided challenges', 'Story-driven missions'],
  },
  {
    id: 'builder',
    emoji: '⚙️',
    name: 'Builder',
    age: 'Ages 11–14',
    color: '#3b82f6',
    glow: 'rgba(59,130,246,0.25)',
    tagline: 'Build with blocks and code',
    unlocks: ['Everything in Explorer', 'Visual block coding', 'Python programming', '10 challenges per concept'],
  },
  {
    id: 'engineer',
    emoji: '🧮',
    name: 'Engineer',
    age: 'Ages 15+',
    color: '#8b5cf6',
    glow: 'rgba(139,92,246,0.25)',
    tagline: 'Master the math and science',
    unlocks: ['Everything in Builder', 'C++ / Arduino style code', 'Advanced math notation', '15 challenges per concept'],
  },
];

type Props = {
  studentName: string;
  onComplete: (level: AgeGroup) => void;
  onBack?: () => void;
};

export function DifficultyPicker({ studentName, onComplete, onBack }: Props) {
  const [phase, setPhase] = useState<'pick' | 'quiz'>('pick');
  const [chosen, setChosen] = useState<AgeGroup | null>(null);
  const [hovered, setHovered] = useState<AgeGroup | null>(null);

  const handlePick = (id: AgeGroup) => {
    setChosen(id);
    setPhase('quiz');
  };

  return (
    <div className="difficulty-shell">
      {/* Background blobs */}
      <div className="difficulty-bg" aria-hidden>
        <div className="difficulty-blob-a" />
        <div className="difficulty-blob-b" />
      </div>

      {/* Back to menu */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            position: 'absolute', top: 18, left: 18, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '7px 14px', color: 'var(--muted)',
            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)'; }}
        >
          <ArrowLeft size={14} /> Main menu
        </button>
      )}

      <AnimatePresence mode="wait">
        {phase === 'pick' && (
          <motion.div
            key="pick"
            className="difficulty-pick-wrap"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="difficulty-header">
              <div className="difficulty-greeting">
                Welcome, <span className="difficulty-name">{studentName || 'there'}</span>!
              </div>
              <h1 className="difficulty-title">Choose your level</h1>
              <p className="difficulty-subtitle">
                Pick the tier that feels right. You'll answer 5 quick questions to confirm — and you can always change later.
              </p>
            </div>

            <div className="difficulty-cards">
              {LEVELS.map((lvl, i) => (
                <motion.button
                  key={lvl.id}
                  type="button"
                  className={`difficulty-card ${hovered === lvl.id ? 'hovered' : ''}`}
                  style={{
                    '--card-color': lvl.color,
                    '--card-glow': lvl.glow,
                    borderColor: hovered === lvl.id ? lvl.color : undefined,
                    boxShadow: hovered === lvl.id ? `0 0 40px ${lvl.glow}` : undefined,
                  } as React.CSSProperties}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.1, duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                  onHoverStart={() => setHovered(lvl.id)}
                  onHoverEnd={() => setHovered(null)}
                  onClick={() => handlePick(lvl.id)}
                >
                  <div className="difficulty-card-emoji" style={{ color: lvl.color }}>
                    {lvl.emoji}
                  </div>
                  <div className="difficulty-card-name" style={{ color: lvl.color }}>
                    {lvl.name}
                  </div>
                  <div className="difficulty-card-age">{lvl.age}</div>
                  <p className="difficulty-card-tagline">{lvl.tagline}</p>
                  <ul className="difficulty-card-unlocks">
                    {lvl.unlocks.map((u) => (
                      <li key={u}>
                        <span className="difficulty-check" style={{ color: lvl.color }}>✓</span> {u}
                      </li>
                    ))}
                  </ul>
                  <div
                    className="difficulty-card-cta"
                    style={{ background: lvl.color }}
                  >
                    Select {lvl.name}
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {phase === 'quiz' && chosen && (
          <motion.div
            key="quiz"
            className="difficulty-quiz-wrap"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="difficulty-quiz-header">
              <h2 className="difficulty-quiz-title">Quick check — {LEVELS.find((l) => l.id === chosen)?.name}</h2>
              <p className="difficulty-quiz-sub">Answer 5 questions. Get 3 right to confirm your level.</p>
            </div>
            <AssessmentQuiz
              level={chosen}
              onPass={onComplete}
              onSuggestDown={onComplete}
              onBack={() => setPhase('pick')}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
