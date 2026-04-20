'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

type Tab = 'home' | 'session' | 'map';

const CONCEPTS = [
  { emoji: '〰️', title: 'Path Planning', sub: 'Bezier curves, waypoints, arc interpolation', color: '#6b7cff' },
  { emoji: '📍', title: 'Coordinate Systems', sub: 'Cartesian grids, transforms, home position', color: '#5de4ff' },
  { emoji: '👁️', title: 'Computer Vision', sub: 'AprilTags, homography, camera calibration', color: '#a855f7' },
  { emoji: '🎛️', title: 'Control Theory', sub: 'PID feedback, gains, step response', color: '#4dffb8' },
];

const LESSON_STEPS = [
  { label: 'Intro', done: true },
  { label: 'Concept', done: true },
  { label: 'Try It', done: false, active: true },
  { label: 'Quiz', done: false },
  { label: 'Draw!', done: false },
];

export function AppPreview() {
  const [tab, setTab] = useState<Tab>('home');

  return (
    <div className="app-preview-frame">
      {/* Window chrome */}
      <div className="app-preview-bar">
        <div className="app-preview-dots">
          <span className="app-preview-dot app-preview-dot--red" />
          <span className="app-preview-dot app-preview-dot--amber" />
          <span className="app-preview-dot app-preview-dot--green" />
        </div>
        <div className="app-preview-title">SketchBot Desktop — Alex</div>
        <div className="app-preview-status">
          <span className="app-preview-status-dot" />
          Robot ready
        </div>
      </div>

      {/* App header (mirrors actual learn-header) */}
      <div className="app-learn-header">
        <div className="app-learn-logo">✏️ <span>SketchBot</span></div>
        <div className="app-learn-divider" />
        <div className="app-learn-concept">〰️ Path Planning</div>
        <div className="app-learn-divider" />
        <div className="app-gamif-bar">
          <span className="app-gamif-badge">✏️ Lv.4</span>
          <div className="app-gamif-track">
            <motion.div
              className="app-gamif-fill"
              initial={{ width: '0%' }}
              animate={{ width: '68%' }}
              transition={{ duration: 1.1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <span className="app-gamif-xp">340 XP</span>
          <span className="app-gamif-streak">🔥 9</span>
        </div>
        <div className="app-learn-spacer" />
        <div className="app-age-pill">⚡ Builder</div>
        <div className="app-sys-dot online" />
      </div>

      {/* Tab bar */}
      <div className="app-preview-tabs">
        {([
          { id: 'home', label: '🏠 Home' },
          { id: 'session', label: '🤖 Session' },
          { id: 'map', label: '🗺️ My Map' },
        ] as const).map((t) => (
          <button
            key={t.id}
            className={`app-preview-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="app-preview-body">
        <AnimatePresence mode="wait">
          {tab === 'home' && (
            <motion.div
              key="home"
              className="app-preview-pane app-home-pane"
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.22 }}
            >
              {/* Age group pills */}
              <div className="app-age-row">
                {[
                  { id: 'explorer', label: '🌱 Explorer', sub: 'Ages 6–10' },
                  { id: 'builder',  label: '⚡ Builder',  sub: 'Ages 11–14', active: true },
                  { id: 'engineer', label: '🔬 Engineer', sub: 'Ages 15+' },
                ].map((g) => (
                  <div key={g.id} className={`app-age-card${g.active ? ' active' : ''}`}>
                    <div className="app-age-label">{g.label}</div>
                    <div className="app-age-sub">{g.sub}</div>
                  </div>
                ))}
              </div>

              {/* Featured concept cards */}
              <div className="app-concept-grid">
                {CONCEPTS.map((c, i) => (
                  <motion.div
                    key={c.title}
                    className="app-concept-card-real"
                    style={{ '--accent': c.color } as React.CSSProperties}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                  >
                    <div className="app-concept-emoji-real">{c.emoji}</div>
                    <div className="app-concept-title-real">{c.title}</div>
                    <div className="app-concept-sub-real">{c.sub}</div>
                    <div className="app-concept-start">Start →</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {tab === 'session' && (
            <motion.div
              key="session"
              className="app-preview-pane app-session-pane"
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.22 }}
            >
              {/* Left: camera/sim + bot */}
              <div className="app-session-left">
                {/* Simulator view */}
                <div className="app-sim-view">
                  <svg viewBox="0 0 200 130" fill="none" style={{ width: '100%' }}>
                    <defs>
                      <pattern id="sg" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(93,228,255,0.1)" strokeWidth="0.5"/>
                      </pattern>
                      <linearGradient id="pathG" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#5de4ff"/><stop offset="50%" stopColor="#6b7cff"/><stop offset="100%" stopColor="#a855f7"/>
                      </linearGradient>
                    </defs>
                    <rect width="200" height="130" fill="url(#sg)" />
                    {/* Robot path */}
                    <path d="M 30 100 C 30 100 60 60 100 55 C 140 50 160 80 155 100" stroke="url(#pathG)" strokeWidth="2" strokeLinecap="round" fill="none" strokeDasharray="4 3" style={{ filter: 'drop-shadow(0 0 4px rgba(93,228,255,0.6))' }} />
                    {/* Waypoints */}
                    {([[30,100,'#5de4ff'],[100,55,'#6b7cff'],[155,100,'#a855f7']] as [number,number,string][]).map(([x,y,c],i)=>(
                      <g key={i}>
                        <circle cx={x} cy={y} r="5" fill={c} fillOpacity="0.9" style={{ filter: `drop-shadow(0 0 5px ${c})` }} />
                        <circle cx={x} cy={y} r="9" fill="none" stroke={c} strokeOpacity="0.3" strokeWidth="1.5" />
                      </g>
                    ))}
                    {/* Robot body at position */}
                    <g transform="translate(95,51)">
                      <rect x="-9" y="-7" width="18" height="14" rx="4" fill="#edf3fb" stroke="#5de4ff" strokeWidth="1" />
                      <rect x="-6" y="-4" width="12" height="8" rx="2" fill="#060e1a" />
                      <circle cx="0" cy="0" r="2.5" fill="#5de4ff" style={{ filter: 'drop-shadow(0 0 3px #5de4ff)' }} />
                      <circle cx="-4" cy="-1" r="1.5" fill="#5de4ff" fillOpacity="0.8" />
                      <circle cx="4" cy="-1" r="1.5" fill="#5de4ff" fillOpacity="0.8" />
                      <ellipse cx="-5" cy="7" rx="3" ry="3" fill="#1e2a3a" stroke="#5de4ff" strokeWidth="0.8" />
                      <ellipse cx="5" cy="7" rx="3" ry="3" fill="#1e2a3a" stroke="#5de4ff" strokeWidth="0.8" />
                    </g>
                    <text x="6" y="128" fontSize="7" fill="rgba(93,228,255,0.5)" fontFamily="monospace">SIM</text>
                  </svg>
                </div>

                {/* Bot avatar + speech */}
                <div className="app-bot-area">
                  <div className="app-bot-avatar app-bot-avatar--excited">
                    <span>🤩</span>
                  </div>
                  <div className="app-bot-speech">
                    Nice! You placed all 3 waypoints. Want to see how the robot plans its path?
                  </div>
                </div>
              </div>

              {/* Right: lesson + blocks editor */}
              <div className="app-session-right">
                {/* Step rail */}
                <div className="app-step-rail">
                  {LESSON_STEPS.map((s) => (
                    <div key={s.label} className={`app-step${s.active ? ' active' : s.done ? ' done' : ''}`}>
                      <div className="app-step-dot">{s.done ? '✓' : ''}</div>
                      <span>{s.label}</span>
                    </div>
                  ))}
                </div>

                {/* Current lesson content */}
                <div className="app-lesson-content">
                  <div className="app-lesson-title">Try It — Place Waypoints</div>
                  <div className="app-lesson-body">
                    Drag the blue dots to set where you want the robot to go. The path updates live as you move them.
                  </div>
                </div>

                {/* Mode tabs (matches real prompt-composer) */}
                <div className="app-mode-row">
                  <div className="app-mode-tab">⬛ Blocks</div>
                  <div className="app-mode-tab active">&lt;/&gt; Code</div>
                  <div className="app-mode-tab" style={{ marginLeft: 'auto' }}>Expand</div>
                </div>

                {/* Code snippet */}
                <div className="app-code-block">
                  <div className="app-code-line"><span className="app-code-kw">from</span> sketchbot <span className="app-code-kw">import</span> Robot</div>
                  <div className="app-code-line">bot = Robot()</div>
                  <div className="app-code-line"><span className="app-code-cm"># Add waypoints</span></div>
                  <div className="app-code-line">path = [(0,0), (10,8), (20,0)]</div>
                  <div className="app-code-line">bot.follow_path(path)</div>
                  <div className="app-code-run">▶ Run</div>
                </div>
              </div>
            </motion.div>
          )}

          {tab === 'map' && (
            <motion.div
              key="map"
              className="app-preview-pane app-map-pane"
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.22 }}
            >
              {/* Stats */}
              <div className="app-map-stats">
                {[
                  { label: 'Concepts', val: '3/8' },
                  { label: 'Total XP', val: '340' },
                  { label: 'Sessions', val: '11' },
                  { label: 'Streak', val: '9d 🔥' },
                ].map(({ label, val }) => (
                  <div key={label} className="app-stat-box">
                    <div className="app-stat-val">{val}</div>
                    <div className="app-stat-label">{label}</div>
                  </div>
                ))}
              </div>

              {/* Concept map nodes */}
              <div className="app-map-nodes">
                {[
                  { emoji: '📍', title: 'Coordinate Systems', xp: 120, status: 'done' },
                  { emoji: '〰️', title: 'Path Planning', xp: 200, status: 'active' },
                  { emoji: '👁️', title: 'Computer Vision', xp: 0, status: 'locked' },
                  { emoji: '🎛️', title: 'Control Theory', xp: 0, status: 'locked' },
                  { emoji: '📐', title: 'Geometry & Trig', xp: 20, status: 'done' },
                  { emoji: '⚙️', title: 'Systems Thinking', xp: 0, status: 'locked' },
                ].map((n, i) => (
                  <motion.div
                    key={n.title}
                    className={`app-map-node app-map-node--${n.status}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <div className="app-map-node-emoji">{n.emoji}</div>
                    <div className="app-map-node-title">{n.title}</div>
                    {n.status !== 'locked' && <div className="app-map-node-xp">+{n.xp} XP</div>}
                    {n.status === 'locked' && <div className="app-map-node-lock">🔒</div>}
                  </motion.div>
                ))}
              </div>

              {/* Badges */}
              <div className="app-badges-row-real">
                {['🏅 First Draw', '⭐ 3-Day Streak', '🎯 100% Quiz', '🚀 Speed Run'].map((b) => (
                  <div key={b} className="app-badge-chip-real">{b}</div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
