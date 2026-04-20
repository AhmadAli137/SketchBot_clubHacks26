'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

type Tab = 'home' | 'session' | 'map';

/* Real concepts from concepts.json */
const CONCEPTS = [
  { id: 'coord-systems',       emoji: '🗺️', title: 'Coordinate Systems',      subtitle: 'How robots navigate space' },
  { id: 'geometry-drawing',    emoji: '🔷', title: 'Geometry Through Drawing', subtitle: 'Shapes, symmetry & patterns' },
  { id: 'path-planning',       emoji: '〰️', title: 'Path Planning',            subtitle: 'Bezier curves and smooth motion' },
  { id: 'trigonometry-motion', emoji: '〰️', title: 'Trigonometry in Motion',   subtitle: 'Sine, cosine, and circular paths' },
  { id: 'computer-vision',     emoji: '👁️', title: 'Computer Vision',          subtitle: 'How the robot sees the world' },
  { id: 'control-theory',      emoji: '🎛️', title: 'Control Theory',           subtitle: 'Feedback loops and precision' },
  { id: 'cone-ring-gauntlet',  emoji: '🎯', title: 'Cone Ring Gauntlet',       subtitle: 'Ultrasonic aim, line sensors' },
  { id: 'sumo-arena',          emoji: '🤼', title: 'Sumo Arena',               subtitle: 'Push the rival bot out first' },
  { id: 'maze-marathon',       emoji: '🧭', title: 'Maze Marathon',            subtitle: 'Wall-follow, nodes, and memory' },
  { id: 'systems-engineering', emoji: '🧠', title: 'Systems Thinking',         subtitle: 'Design your own challenge' },
];

/* Progress state for each concept in the map mockup */
const MAP_NODES = [
  { id: 'coord-systems',       emoji: '🗺️', title: 'Coordinate Systems',      status: 'mastered',  xp: 180, progress: 100 },
  { id: 'geometry-drawing',    emoji: '🔷', title: 'Geometry Through Drawing', status: 'mastered',  xp: 160, progress: 100 },
  { id: 'path-planning',       emoji: '〰️', title: 'Path Planning',            status: 'active',    xp: 200, progress: 62  },
  { id: 'trigonometry-motion', emoji: '〰️', title: 'Trigonometry in Motion',   status: 'available', xp: 0,   progress: 0   },
  { id: 'computer-vision',     emoji: '👁️', title: 'Computer Vision',          status: 'locked',    xp: 0,   progress: 0   },
  { id: 'control-theory',      emoji: '🎛️', title: 'Control Theory',           status: 'locked',    xp: 0,   progress: 0   },
];

export function AppPreview() {
  const [tab, setTab] = useState<Tab>('home');
  const [wsTab, setWsTab] = useState<'simulator' | 'live' | 'code'>('simulator');

  return (
    <div className="ap-frame">
      {/* Window chrome */}
      <div className="ap-chrome">
        <div className="ap-chrome-dots">
          <span className="ap-dot ap-dot-red" />
          <span className="ap-dot ap-dot-amber" />
          <span className="ap-dot ap-dot-green" />
        </div>
        <span className="ap-chrome-title">SketchBot — Room 2B</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="ap-chrome-pill">🤖 Robot ready</span>
        </div>
      </div>

      {/* Screen tabs (marketing nav, not in real app) */}
      <div className="ap-nav">
        {([
          { id: 'home',    label: '🏠 Home' },
          { id: 'session', label: '🤖 Session' },
          { id: 'map',     label: '🗺️ Map' },
        ] as const).map(t => (
          <button key={t.id} className={`ap-nav-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="ap-body">
        <AnimatePresence mode="wait">

          {/* ── HOME SCREEN ──────────────────────────────────────────────── */}
          {tab === 'home' && (
            <motion.div key="home" className="ap-pane ap-home"
              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Profile card */}
              <div className="ap-profile-card">
                <div className="ap-profile-left">
                  <div className="ap-avatar">🤖</div>
                  <div>
                    <div className="ap-profile-name">Alex</div>
                    <div className="ap-profile-level">✏️ Lv.4 · Sketch Artist</div>
                    <div className="ap-xp-track">
                      <motion.div className="ap-xp-fill" initial={{ width: 0 }} animate={{ width: '68%' }}
                        transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} />
                    </div>
                    <div className="ap-profile-xp">340 / 500 XP</div>
                  </div>
                </div>
                <div className="ap-profile-stats">
                  {[
                    { v: '11', l: 'Sessions' },
                    { v: '7',  l: 'Drawings' },
                    { v: '3',  l: 'Badges'   },
                    { v: '2',  l: 'Concepts' },
                  ].map(s => (
                    <div key={s.l} className="ap-stat">
                      <div className="ap-stat-v">{s.v}</div>
                      <div className="ap-stat-l">{s.l}</div>
                    </div>
                  ))}
                </div>
                <div className="ap-streak-pill">🔥 9-day streak</div>
              </div>

              {/* Today's adventure */}
              <div className="ap-section-label">Today's adventure</div>
              <div className="ap-adventure-row">
                <div className="ap-adventure-card ap-adventure-free">
                  <div className="ap-adventure-emoji">✏️</div>
                  <div>
                    <div className="ap-adventure-title">Free Draw</div>
                    <div className="ap-adventure-sub">Open-ended creative drawing</div>
                  </div>
                  <span className="ap-start-btn">Start →</span>
                </div>
                <div className="ap-adventure-card ap-adventure-featured">
                  <div className="ap-adventure-emoji">🎯</div>
                  <div>
                    <div className="ap-adventure-title">Cone Ring Gauntlet</div>
                    <div className="ap-adventure-sub">Ultrasonic aim, line sensors</div>
                  </div>
                  <span className="ap-start-btn">Start →</span>
                </div>
                <div className="ap-adventure-card ap-adventure-featured">
                  <div className="ap-adventure-emoji">〰️</div>
                  <div>
                    <div className="ap-adventure-title">Path Planning</div>
                    <div className="ap-adventure-sub">Bezier curves and smooth motion</div>
                  </div>
                  <span className="ap-continue-btn">Continue →</span>
                </div>
              </div>

              {/* More to explore */}
              <div className="ap-section-label">More to explore</div>
              <div className="ap-concepts-grid">
                {CONCEPTS.map((c, i) => (
                  <motion.div key={c.id} className="ap-concept-card"
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <span className="ap-concept-emoji">{c.emoji}</span>
                    <div>
                      <div className="ap-concept-title">{c.title}</div>
                      <div className="ap-concept-sub">{c.subtitle}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── SESSION SCREEN ───────────────────────────────────────────── */}
          {tab === 'session' && (
            <motion.div key="session" className="ap-pane ap-session-wrap"
              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* learn-header — real exact layout */}
              <div className="ap-learn-hdr">
                <button className="ap-hdr-btn">← Menu</button>
                <div className="ap-hdr-avatar">🤖</div>
                <div className="ap-hdr-brand">
                  <span className="ap-hdr-logo">✏️</span>
                  <span className="ap-hdr-name">SketchBot</span>
                </div>
                <div className="ap-hdr-div" />
                <div className="ap-hdr-picker">
                  <span>〰️</span>
                  <span>Path Planning</span>
                  <span style={{ opacity: 0.5, fontSize: '0.6rem' }}>▾</span>
                </div>
                <div className="ap-hdr-div" />
                <div className="ap-gamif">
                  <span className="ap-gamif-badge">✏️ Lv.4</span>
                  <div className="ap-gamif-track">
                    <motion.div className="ap-gamif-fill" initial={{ width: 0 }} animate={{ width: '68%' }}
                      transition={{ duration: 0.9, delay: 0.4 }} />
                  </div>
                  <span className="ap-gamif-xp">340 XP</span>
                  <span className="ap-gamif-streak">🔥 9</span>
                </div>
                <div style={{ flex: 1 }} />
                <div className="ap-hdr-picker">
                  <span>⚡</span>
                  <span>Builder</span>
                  <span style={{ opacity: 0.5, fontSize: '0.6rem' }}>▾</span>
                </div>
                <div className="ap-hdr-div" />
                <div className="ap-sys-row">
                  <span className="ap-sys-dot live" />
                  <span className="ap-sys-label">Simulator</span>
                </div>
                <button className="ap-hdr-btn">🗺️ Map</button>
              </div>

              {/* Workspace */}
              <div className="ap-workspace">
                {/* Left: canvas area */}
                <div className="ap-canvas-col">
                  {/* Workspace tabs */}
                  <div className="ap-ws-tabs">
                    {([
                      { id: 'simulator', label: '🤖 Simulator' },
                      { id: 'live',      label: '📷 Live Camera' },
                      { id: 'code',      label: '✏️ Code' },
                    ] as const).map(t => (
                      <button key={t.id} className={`ap-ws-tab${wsTab === t.id ? ' active' : ''}`}
                        onClick={() => setWsTab(t.id)}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Canvas content */}
                  <div className="ap-canvas-view">
                    <AnimatePresence mode="wait">
                      {wsTab === 'simulator' && (
                        <motion.div key="sim" className="ap-sim-pane"
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <svg viewBox="0 0 340 200" style={{ width: '100%', height: '100%' }}>
                            <defs>
                              <pattern id="apg" width="20" height="20" patternUnits="userSpaceOnUse">
                                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(93,228,255,0.08)" strokeWidth="0.5"/>
                              </pattern>
                              <linearGradient id="apPath" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#5de4ff"/>
                                <stop offset="50%" stopColor="#6b7cff"/>
                                <stop offset="100%" stopColor="#a855f7"/>
                              </linearGradient>
                              <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                            </defs>
                            <rect width="340" height="200" fill="url(#apg)" />
                            {/* Grid lines */}
                            <line x1="0" y1="100" x2="340" y2="100" stroke="rgba(93,228,255,0.06)" strokeWidth="0.7"/>
                            <line x1="170" y1="0" x2="170" y2="200" stroke="rgba(93,228,255,0.06)" strokeWidth="0.7"/>
                            {/* Bezier path — drawn trace */}
                            <path d="M 40 160 C 60 100 110 80 170 78 C 230 76 280 110 300 150"
                              stroke="url(#apPath)" strokeWidth="2.2" strokeLinecap="round" fill="none"
                              strokeDasharray="5 3" filter="url(#glow)" opacity="0.9"/>
                            {/* Waypoints */}
                            {([[40,160,'#5de4ff'],[170,78,'#6b7cff'],[300,150,'#a855f7']] as [number,number,string][]).map(([x,y,c],i) => (
                              <g key={i}>
                                <circle cx={x} cy={y} r="6" fill={c} fillOpacity="0.9" filter="url(#glow)"/>
                                <circle cx={x} cy={y} r="11" fill="none" stroke={c} strokeOpacity="0.25" strokeWidth="2"/>
                                <text x={x+9} y={y-8} fontSize="7" fill={c} fontFamily="monospace" opacity="0.8">W{i+1}</text>
                              </g>
                            ))}
                            {/* Robot at midpoint */}
                            <g transform="translate(168,74)">
                              <rect x="-9" y="-6" width="18" height="13" rx="3" fill="#1a2540" stroke="#5de4ff" strokeWidth="0.9"/>
                              <rect x="-6" y="-4" width="12" height="7" rx="2" fill="#050816"/>
                              <circle cx="0" cy="0" r="2.5" fill="#5de4ff" filter="url(#glow)"/>
                              <circle cx="-3.5" cy="-1" r="1.2" fill="#5de4ff" fillOpacity="0.8"/>
                              <circle cx="3.5" cy="-1" r="1.2" fill="#5de4ff" fillOpacity="0.8"/>
                              <ellipse cx="-5" cy="7" rx="2.5" ry="2.5" fill="#1e2a3a" stroke="#5de4ff" strokeWidth="0.7"/>
                              <ellipse cx="5" cy="7" rx="2.5" ry="2.5" fill="#1e2a3a" stroke="#5de4ff" strokeWidth="0.7"/>
                            </g>
                            {/* Labels */}
                            <text x="8" y="14" fontSize="7.5" fill="rgba(93,228,255,0.45)" fontFamily="monospace" fontWeight="bold">SIM · RUNNING</text>
                            <text x="8" y="195" fontSize="6" fill="rgba(149,166,199,0.35)" fontFamily="monospace">concept: path-planning · layer: structural</text>
                          </svg>
                        </motion.div>
                      )}
                      {wsTab === 'live' && (
                        <motion.div key="live" className="ap-live-pane"
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <div className="ap-live-placeholder">
                            <div className="ap-live-icon">📷</div>
                            <div className="ap-live-title">Connect Camera Buddy</div>
                            <div className="ap-live-sub">Scan QR from your phone — becomes overhead camera</div>
                            <div className="ap-qr-mock">
                              {/* Pixel-art QR placeholder */}
                              <svg viewBox="0 0 40 40" width="80" height="80" style={{ imageRendering: 'pixelated' }}>
                                <rect width="40" height="40" fill="white"/>
                                {/* Corner squares */}
                                <rect x="2" y="2" width="10" height="10" fill="black"/><rect x="3" y="3" width="8" height="8" fill="white"/><rect x="4" y="4" width="6" height="6" fill="black"/>
                                <rect x="28" y="2" width="10" height="10" fill="black"/><rect x="29" y="3" width="8" height="8" fill="white"/><rect x="30" y="4" width="6" height="6" fill="black"/>
                                <rect x="2" y="28" width="10" height="10" fill="black"/><rect x="3" y="29" width="8" height="8" fill="white"/><rect x="4" y="30" width="6" height="6" fill="black"/>
                                {/* Data pixels */}
                                {[[14,2],[16,2],[18,2],[14,4],[20,4],[16,6],[22,6],[14,8],[18,8],[20,8],[15,12],[17,12],[19,12],[21,12],[22,14],[14,16],[18,16],[20,16],[15,18],[19,18],[21,18],[22,20],[14,22],[16,22],[20,22],[14,24],[18,24],[22,24],[28,14],[30,14],[32,14],[29,16],[31,18],[28,20],[32,20],[29,22],[31,22],[28,24],[30,24],[32,24]].map(([x,y],i) => (
                                  <rect key={i} x={x} y={y} width="2" height="2" fill="black"/>
                                ))}
                              </svg>
                            </div>
                            <div className="ap-code-label">Class code: <strong>SB-2B-7F</strong></div>
                          </div>
                        </motion.div>
                      )}
                      {wsTab === 'code' && (
                        <motion.div key="code" className="ap-code-pane"
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <div className="ap-code-editor">
                            <div className="ap-code-toolbar">
                              <span className="ap-code-tab active">⬛ Blocks</span>
                              <span className="ap-code-tab">&lt;/&gt; Python</span>
                            </div>
                            <div className="ap-code-body">
                              <div className="ap-block ap-block-move">
                                <span className="ap-block-icon">➡️</span>
                                <span className="ap-block-label">Move</span>
                                <span className="ap-block-val">distance: <b>50 cm</b></span>
                              </div>
                              <div className="ap-block ap-block-turn">
                                <span className="ap-block-icon">↩️</span>
                                <span className="ap-block-label">Turn</span>
                                <span className="ap-block-val">angle: <b>90°</b></span>
                              </div>
                              <div className="ap-block ap-block-loop">
                                <span className="ap-block-icon">🔁</span>
                                <span className="ap-block-label">Repeat</span>
                                <span className="ap-block-val">4 times</span>
                                <div className="ap-block-inner">
                                  <div className="ap-block ap-block-move" style={{ marginLeft: 0 }}>
                                    <span className="ap-block-icon">🖊️</span>
                                    <span className="ap-block-label">Draw Arc</span>
                                    <span className="ap-block-val">radius: <b>30</b>, sweep: <b>90°</b></span>
                                  </div>
                                </div>
                              </div>
                              <div className="ap-block ap-block-pen">
                                <span className="ap-block-icon">⬆️</span>
                                <span className="ap-block-label">Pen Up</span>
                              </div>
                            </div>
                            <div className="ap-code-run-bar">
                              <span className="ap-code-hint">4 blocks · draws a square spiral</span>
                              <button className="ap-run-btn">▶ Run on Robot</button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Prompt composer — exact bottom bar from real app */}
                  <div className="ap-prompt-bar">
                    <div className="ap-prompt-input">
                      <span className="ap-prompt-placeholder">Describe what to draw…</span>
                    </div>
                    <button className="ap-prompt-icon" title="Upload image">📎</button>
                    <button className="ap-prompt-icon" title="Prompt gallery">🗂</button>
                    <button className="ap-generate-btn">▶ Generate</button>
                  </div>
                </div>

                {/* Right: Tutor dock */}
                <div className="ap-tutor-dock">
                  <div className="ap-tutor-header">
                    <span className="ap-tutor-icon">🤖</span>
                    <span className="ap-tutor-title">Sketch · Tutor</span>
                    <button className="ap-tutor-min">—</button>
                  </div>
                  <div className="ap-tutor-body">
                    <div className="ap-tutor-msg">
                      Great work placing waypoints! Now let's talk about why the robot follows a <em>curved</em> path instead of a straight line between them.
                    </div>
                    <div className="ap-tutor-msg ap-tutor-msg-q">
                      🤔 If you moved waypoint W2 higher, would the arc get tighter or wider?
                    </div>
                    <div className="ap-tutor-choices">
                      <button className="ap-choice">Tighter</button>
                      <button className="ap-choice">Wider</button>
                      <button className="ap-choice">Same</button>
                    </div>
                    <div className="ap-tutor-step-bar">
                      <div className="ap-tutor-step done">Intro</div>
                      <div className="ap-tutor-step done">Concept</div>
                      <div className="ap-tutor-step active">Try It</div>
                      <div className="ap-tutor-step">Quiz</div>
                      <div className="ap-tutor-step">Draw!</div>
                    </div>
                    <div className="ap-tutor-xp">+40 XP on completion</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── MAP SCREEN ───────────────────────────────────────────────── */}
          {tab === 'map' && (
            <motion.div key="map" className="ap-pane ap-map-screen"
              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Stats hero */}
              <div className="ap-map-hero">
                <div className="ap-map-hero-left">
                  <div className="ap-map-avatar">🤖</div>
                  <div>
                    <div className="ap-map-name">Alex</div>
                    <div className="ap-map-level">✏️ Lv.4 · Sketch Artist</div>
                    <div className="ap-map-xp-track">
                      <motion.div className="ap-map-xp-fill" initial={{ width: 0 }} animate={{ width: '68%' }}
                        transition={{ duration: 1, delay: 0.3 }} />
                    </div>
                    <div className="ap-map-xp-label">340 XP · 160 to next level</div>
                  </div>
                </div>
                <div className="ap-map-stat-grid">
                  {[
                    { icon: '🔥', v: '9',  l: 'Streak' },
                    { icon: '✏️', v: '7',  l: 'Drawings' },
                    { icon: '📚', v: '11', l: 'Sessions' },
                    { icon: '🎯', v: '2',  l: 'Concepts' },
                  ].map(s => (
                    <div key={s.l} className="ap-map-stat">
                      <div className="ap-map-stat-icon">{s.icon}</div>
                      <div className="ap-map-stat-val">{s.v}</div>
                      <div className="ap-map-stat-lbl">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ap-map-section-label">Your learning journey</div>

              {/* Concept path nodes */}
              <div className="ap-map-path">
                {MAP_NODES.map((n, i) => (
                  <motion.div key={n.id}
                    className={`ap-map-node ap-map-node--${n.status}`}
                    initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                  >
                    <div className="ap-map-node-left">
                      <div className="ap-map-node-ring" style={{
                        background: n.status === 'mastered' ? 'rgba(245,158,11,0.15)' :
                                    n.status === 'active'   ? 'rgba(93,228,255,0.12)' :
                                    n.status === 'available'? 'rgba(107,124,255,0.1)' : 'rgba(255,255,255,0.04)',
                        borderColor: n.status === 'mastered' ? 'rgba(245,158,11,0.8)' :
                                     n.status === 'active'   ? 'rgba(93,228,255,0.5)' :
                                     n.status === 'available'? 'rgba(107,124,255,0.3)' : 'rgba(255,255,255,0.1)',
                      }}>
                        {n.status === 'mastered' ? '✓' : n.emoji}
                      </div>
                      {i < MAP_NODES.length - 1 && (
                        <div className="ap-map-spine" style={{
                          background: n.status === 'mastered' ? 'rgba(245,158,11,0.4)' :
                                      n.status === 'active'   ? 'rgba(93,228,255,0.25)' : 'rgba(255,255,255,0.07)',
                        }} />
                      )}
                    </div>
                    <div className="ap-map-node-right">
                      <div className="ap-map-node-title">{n.title}</div>
                      <div className="ap-map-node-status">
                        {n.status === 'mastered'  && <span className="ap-status-badge ap-badge-mastered">✓ Mastered</span>}
                        {n.status === 'active'    && <span className="ap-status-badge ap-badge-active">In progress · {n.progress}%</span>}
                        {n.status === 'available' && <span className="ap-status-badge ap-badge-available">Start</span>}
                        {n.status === 'locked'    && <span className="ap-status-badge ap-badge-locked">🔒 Locked</span>}
                        {n.xp > 0 && <span className="ap-map-node-xp">+{n.xp} XP</span>}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Badges */}
              <div className="ap-map-section-label" style={{ marginTop: 12 }}>Earned badges</div>
              <div className="ap-badges-row">
                {['🥇 First Drawing', '⭐ 3-Day Streak', '🎯 100% Quiz', '🏁 First Robot Run', '🔷 Shape Master'].map(b => (
                  <span key={b} className="ap-badge">{b}</span>
                ))}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
