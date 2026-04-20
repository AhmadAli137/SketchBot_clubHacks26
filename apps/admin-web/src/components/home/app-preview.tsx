'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { SparkRobot } from '@/components/spark-robot';

const CONCEPTS = [
  { icon: '📍', title: 'Coordinate Systems', domain: 'Geometry', locked: false, xp: 320 },
  { icon: '〰️', title: 'Path Planning', domain: 'Robotics', locked: false, xp: 180 },
  { icon: '👁️', title: 'Computer Vision', domain: 'Vision', locked: true, xp: 0 },
  { icon: '🎛️', title: 'Control Theory', domain: 'Control', locked: true, xp: 0 },
];

const MESSAGES = [
  { from: 'spark', text: "Great job on coordinate systems! Ready to try path planning? It's how I decide where to drive next." },
  { from: 'student', text: "How does the robot know which direction to go?" },
  { from: 'spark', text: "Excellent question! I use a concept called differential drive — by spinning each wheel at a different speed, I can steer without a steering wheel. Want to see it live?" },
];

const BADGES = ['🏅 First Draw', '⭐ 3-Day Streak', '🎯 100% Quiz'];

export function AppPreview() {
  const [activeTab, setActiveTab] = useState<'tutor' | 'concepts' | 'progress'>('tutor');

  return (
    <div className="app-preview-frame">
      {/* Window chrome */}
      <div className="app-preview-bar">
        <div className="app-preview-dots">
          <span className="app-preview-dot app-preview-dot--red" />
          <span className="app-preview-dot app-preview-dot--amber" />
          <span className="app-preview-dot app-preview-dot--green" />
        </div>
        <div className="app-preview-title">Aibotics Desktop — Alex, Grade 7</div>
        <div className="app-preview-status">
          <span className="app-preview-status-dot" />
          Robot connected
        </div>
      </div>

      {/* Tab bar */}
      <div className="app-preview-tabs">
        {(['tutor', 'concepts', 'progress'] as const).map((tab) => (
          <button
            key={tab}
            className={`app-preview-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'tutor' && '💬 AI Tutor'}
            {tab === 'concepts' && '📚 Concepts'}
            {tab === 'progress' && '🏆 Progress'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="app-preview-body">
        <AnimatePresence mode="wait">
          {activeTab === 'tutor' && (
            <motion.div
              key="tutor"
              className="app-preview-pane"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.25 }}
            >
              {/* Left: Spark avatar */}
              <div className="app-tutor-avatar-col">
                <div className="app-tutor-spark-wrap">
                  <SparkRobot mode="3d" size="lg" scene={1} />
                </div>
                <div className="app-tutor-name">Spark</div>
                <div className="app-tutor-sub">AI Tutor · Grade 7 mode</div>
              </div>

              {/* Right: Chat */}
              <div className="app-tutor-chat">
                <div className="app-tutor-messages">
                  {MESSAGES.map((m, i) => (
                    <motion.div
                      key={i}
                      className={`app-tutor-msg app-tutor-msg--${m.from}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.15 }}
                    >
                      {m.from === 'spark' && <span className="app-tutor-msg-label">Spark</span>}
                      <div className="app-tutor-msg-bubble">{m.text}</div>
                    </motion.div>
                  ))}
                </div>
                <div className="app-tutor-input-row">
                  <div className="app-tutor-input">Ask Spark anything...</div>
                  <button className="app-tutor-send">→</button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'concepts' && (
            <motion.div
              key="concepts"
              className="app-preview-pane app-concepts-pane"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.25 }}
            >
              <div className="app-concepts-header">
                <div>
                  <div className="app-concepts-title">Your Learning Path</div>
                  <div className="app-concepts-sub">2 of 8 concepts mastered</div>
                </div>
                <div className="app-xp-pill">
                  <span className="app-xp-star">⭐</span>
                  <span>500 XP · Level 3</span>
                </div>
              </div>
              <div className="app-xp-bar-track">
                <motion.div
                  className="app-xp-bar-fill"
                  initial={{ width: '0%' }}
                  animate={{ width: '62%' }}
                  transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <div className="app-concepts-grid">
                {CONCEPTS.map((c, i) => (
                  <motion.div
                    key={c.title}
                    className={`app-concept-card${c.locked ? ' locked' : ''}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                  >
                    <div className="app-concept-icon">{c.locked ? '🔒' : c.icon}</div>
                    <div className="app-concept-info">
                      <div className="app-concept-name">{c.title}</div>
                      <div className="app-concept-domain">{c.domain}</div>
                    </div>
                    {!c.locked && (
                      <div className="app-concept-xp">+{c.xp} XP</div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'progress' && (
            <motion.div
              key="progress"
              className="app-preview-pane app-progress-pane"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.25 }}
            >
              {/* Student card */}
              <div className="app-student-card">
                <div className="app-student-avatar">👧</div>
                <div>
                  <div className="app-student-name">Alex</div>
                  <div className="app-student-level">Level 3 · Student Builder</div>
                </div>
                <div className="app-student-streak">🔥 7-day streak</div>
              </div>

              {/* Stats row */}
              <div className="app-stats-row">
                {[
                  { label: 'Sessions', val: '14' },
                  { label: 'Drawings', val: '31' },
                  { label: 'Concepts', val: '2/8' },
                  { label: 'Badges', val: '3' },
                ].map(({ label, val }) => (
                  <div key={label} className="app-stat-box">
                    <div className="app-stat-val">{val}</div>
                    <div className="app-stat-label">{label}</div>
                  </div>
                ))}
              </div>

              {/* Badges */}
              <div className="app-badges-title">Earned badges</div>
              <div className="app-badges-row">
                {BADGES.map((b) => (
                  <motion.div
                    key={b}
                    className="app-badge-chip"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', damping: 14, stiffness: 200 }}
                  >
                    {b}
                  </motion.div>
                ))}
              </div>

              {/* XP over time mini chart */}
              <div className="app-spark-celebrate">
                <SparkRobot mode="2d" pose="celebrate" size="sm" />
                <div className="app-spark-celebrate-text">
                  <strong>Keep it up!</strong> You&#39;re in the top 30% of Grade 7 learners this week.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
