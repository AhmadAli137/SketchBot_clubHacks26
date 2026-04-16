'use client';

import { ArrowRight, BookOpen, Pencil, Rocket, Sparkles, Star } from 'lucide-react';
import type { Challenge, ChallengePack } from '@/lib/platform-types';

// ─── Static SketchBot definition for v1 ──────────────────────────────────────
// Future: load from /api/robots endpoint
const SKETCHBOT = {
  id: 'sketchbot',
  name: 'SketchBot',
  tagline: 'Learns through drawing',
  avatar: '✏️',
  accentColor: 'var(--cyan)',
  tutorPersona: { name: 'Sketch' },
};

// ─── Seed challenge packs for display before API loads ────────────────────────
const SEED_PACKS: ChallengePack[] = [
  {
    id: 'sketchbot-core',
    robotId: 'sketchbot',
    name: 'Getting Started',
    description: 'Your first challenges with SketchBot.',
    challenges: [
      {
        id: 'sketchbot-first-line',
        packId: 'sketchbot-core',
        robotId: 'sketchbot',
        requiredModules: [],
        title: 'First Line',
        subtitle: 'Make the robot draw its first mark',
        description: 'Guide SketchBot to draw a straight line.',
        subjects: ['art', 'engineering'],
        difficulty: 1,
        estimatedMinutes: 5,
        learningObjectives: ['Understand AprilTag localization'],
        steps: [],
      },
      {
        id: 'sketchbot-shape-up',
        packId: 'sketchbot-core',
        robotId: 'sketchbot',
        requiredModules: [],
        title: 'Shape Up',
        subtitle: 'Draw a perfect square',
        description: 'Discover what makes a shape perfect.',
        subjects: ['math', 'art'],
        difficulty: 1,
        estimatedMinutes: 8,
        learningObjectives: ['Define what makes a square'],
        steps: [],
      },
    ],
  },
  {
    id: 'sketchbot-math-art',
    robotId: 'sketchbot',
    name: 'Math Through Art',
    description: 'Discover hidden math in beautiful patterns.',
    challenges: [
      {
        id: 'sketchbot-fibonacci',
        packId: 'sketchbot-math-art',
        robotId: 'sketchbot',
        requiredModules: [],
        title: "Nature's Secret Pattern",
        subtitle: 'The Fibonacci spiral',
        description: 'A number from the 13th century shows up in sunflowers and galaxies.',
        subjects: ['math', 'art', 'science'],
        difficulty: 3,
        estimatedMinutes: 20,
        learningObjectives: ['Fibonacci sequence', 'Golden ratio'],
        steps: [],
        completionBadge: { id: 'badge-fibonacci', name: "Nature's Mathematician", description: '', icon: '🌀' },
      },
      {
        id: 'sketchbot-symmetry',
        packId: 'sketchbot-math-art',
        robotId: 'sketchbot',
        requiredModules: [],
        title: 'Mirror, Mirror',
        subtitle: 'Lines of symmetry',
        description: 'Explore how shapes can be folded perfectly in half.',
        subjects: ['math', 'art'],
        difficulty: 2,
        estimatedMinutes: 12,
        learningObjectives: ['Identify lines of symmetry'],
        steps: [],
        completionBadge: { id: 'badge-symmetry', name: 'Symmetry Seeker', description: '', icon: '🦋' },
      },
    ],
  },
  {
    id: 'sketchbot-creative',
    robotId: 'sketchbot',
    name: 'Creative Studio',
    description: 'Open-ended creative challenges.',
    challenges: [
      {
        id: 'sketchbot-self-portrait',
        packId: 'sketchbot-creative',
        robotId: 'sketchbot',
        requiredModules: [],
        title: 'Robot Self-Portrait',
        subtitle: 'How does a robot see itself?',
        description: 'Ask SketchBot to draw its own self-portrait.',
        subjects: ['art', 'engineering', 'coding'],
        difficulty: 2,
        estimatedMinutes: 15,
        learningObjectives: ['Explore AI imagination'],
        steps: [],
        completionBadge: { id: 'badge-portrait', name: 'Art Critic', description: '', icon: '🎨' },
      },
    ],
  },
];

const SUBJECT_COLORS: Record<string, string> = {
  math: 'rgba(93, 228, 255, 0.12)',
  art: 'rgba(255, 79, 216, 0.1)',
  engineering: 'rgba(107, 124, 255, 0.1)',
  coding: 'rgba(168, 85, 247, 0.1)',
  science: 'rgba(77, 255, 184, 0.1)',
};

function DifficultyPips({ level }: { level: number }) {
  return (
    <div className="difficulty-pips">
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} className={`difficulty-pip ${n <= level ? 'filled' : ''}`} />
      ))}
    </div>
  );
}

type ChallengeCardProps = {
  challenge: Challenge;
  selected: boolean;
  onSelect: () => void;
};

function ChallengeCard({ challenge, selected, onSelect }: ChallengeCardProps) {
  return (
    <button
      type="button"
      className={`challenge-card ${selected ? 'active' : ''}`}
      onClick={onSelect}
      style={{ textAlign: 'left', width: '100%' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
          {challenge.title}
        </span>
        {challenge.completionBadge && (
          <span style={{ fontSize: 14, flexShrink: 0 }}>{challenge.completionBadge.icon}</span>
        )}
      </div>
      {challenge.subtitle && (
        <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.4 }}>
          {challenge.subtitle}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <DifficultyPips level={challenge.difficulty} />
        <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{challenge.estimatedMinutes} min</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {challenge.subjects.map((s) => (
            <span
              key={s}
              className="subject-chip"
              style={{ background: SUBJECT_COLORS[s] }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

type RobotHubProps = {
  isRobotConnected: boolean;
  selectedChallengeId: string | null;
  onSelectChallenge: (id: string | null) => void;
  onStartFreeSession: () => void;
  packs?: ChallengePack[];
};

export function RobotHub({
  isRobotConnected,
  selectedChallengeId,
  onSelectChallenge,
  onStartFreeSession,
  packs = SEED_PACKS,
}: RobotHubProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Robot card */}
      <div className="robot-card">
        <div className="robot-card-stripe" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 22 }}>{SKETCHBOT.avatar}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)' }}>
                {SKETCHBOT.name}
              </span>
              <div className={`robot-online-dot ${isRobotConnected ? '' : 'offline'}`} />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{SKETCHBOT.tagline}</span>
          </div>
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 999,
              border: '1px solid rgba(93, 228, 255, 0.22)',
              background: 'rgba(93, 228, 255, 0.07)',
              fontSize: '0.7rem',
              color: 'var(--cyan)',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            Tutor: {SKETCHBOT.tutorPersona.name}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
          {SKETCHBOT.name} teaches through drawing. Choose a challenge below, or tap Free Draw to explore.
        </p>
      </div>

      {/* Mode selector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button
          type="button"
          className={`challenge-card ${selectedChallengeId !== null ? '' : 'active'}`}
          onClick={() => onSelectChallenge(null)}
          style={{ textAlign: 'left' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <Sparkles size={14} style={{ color: 'var(--pink)' }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Free Draw</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.73rem', color: 'var(--muted)', lineHeight: 1.4 }}>
            Open prompt, any subject
          </p>
        </button>
        <button
          type="button"
          className={`challenge-card ${selectedChallengeId !== null ? 'active' : ''}`}
          onClick={() => {
            if (selectedChallengeId === null) {
              onSelectChallenge(packs[0]?.challenges[0]?.id ?? null);
            }
          }}
          style={{ textAlign: 'left' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <BookOpen size={14} style={{ color: 'var(--cyan)' }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Challenge</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.73rem', color: 'var(--muted)', lineHeight: 1.4 }}>
            Guided learning activity
          </p>
        </button>
      </div>

      {/* Challenge library */}
      {selectedChallengeId !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {packs.map((pack) => (
            <div key={pack.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                <Star size={11} style={{ color: 'var(--amber)' }} />
                <span className="step-section-label">{pack.name}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pack.challenges.map((challenge) => (
                  <ChallengeCard
                    key={challenge.id}
                    challenge={challenge}
                    selected={selectedChallengeId === challenge.id}
                    onSelect={() => onSelectChallenge(challenge.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
