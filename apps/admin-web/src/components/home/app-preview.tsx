'use client';

import { useState } from 'react';

type Tab = 'home' | 'session' | 'map';

export function AppPreview() {
  const [tab, setTab] = useState<Tab>('session');

  return (
    <div className="ap2-frame">
      {/* macOS-style window chrome */}
      <div className="ap2-chrome">
        <span className="ap2-dot" style={{ background: '#ff5f57' }} />
        <span className="ap2-dot" style={{ background: '#ffbd2e' }} />
        <span className="ap2-dot" style={{ background: '#28c840' }} />
        <span className="ap2-title">SketchBot — Room 2B</span>
        <span className="ap2-status"><span className="ap2-status-dot" />Robot connected</span>
      </div>

      {/* Tab bar */}
      <div className="ap2-tabs">
        <button className={`ap2-tab${tab === 'home'    ? ' on' : ''}`} onClick={() => setTab('home')}>Home</button>
        <button className={`ap2-tab${tab === 'session' ? ' on' : ''}`} onClick={() => setTab('session')}>Session</button>
        <button className={`ap2-tab${tab === 'map'     ? ' on' : ''}`} onClick={() => setTab('map')}>Map</button>
      </div>

      <div className="ap2-body">
        {tab === 'home'    && <HomeView />}
        {tab === 'session' && <SessionView />}
        {tab === 'map'     && <MapView />}
      </div>
    </div>
  );
}

/* ── Home ─────────────────────────────────────────────────────────────────── */
function HomeView() {
  return (
    <div className="ap2-home">
      {/* Profile strip */}
      <div className="ap2-profile-strip">
        <span className="ap2-profile-avatar">🤖</span>
        <div className="ap2-profile-info">
          <span className="ap2-profile-name">Alex</span>
          <span className="ap2-profile-meta">✏️ Lv.4 · Sketch Artist</span>
        </div>
        <div className="ap2-xp-block">
          <div className="ap2-xp-row">
            <span className="ap2-xp-label">340 XP</span>
            <span className="ap2-xp-next">500 next</span>
          </div>
          <div className="ap2-xp-bar"><div className="ap2-xp-fill" style={{ width: '68%' }} /></div>
        </div>
        <div className="ap2-stats-inline">
          <span>11 sessions</span>
          <span>7 drawings</span>
          <span>3 badges</span>
          <span>🔥 9-day streak</span>
        </div>
      </div>

      {/* Today's adventure */}
      <div className="ap2-section-hd">Today's adventure</div>
      <div className="ap2-adventure-list">
        <div className="ap2-adv-row ap2-adv-free">
          <span className="ap2-adv-emoji">✏️</span>
          <div><div className="ap2-adv-title">Free Draw</div><div className="ap2-adv-sub">Open-ended creative drawing</div></div>
          <span className="ap2-adv-cta">Start</span>
        </div>
        <div className="ap2-adv-row">
          <span className="ap2-adv-emoji">🎯</span>
          <div><div className="ap2-adv-title">Cone Ring Gauntlet</div><div className="ap2-adv-sub">Ultrasonic aim · line sensors for balance</div></div>
          <span className="ap2-adv-cta">Start</span>
        </div>
        <div className="ap2-adv-row ap2-adv-active">
          <span className="ap2-adv-emoji">〰️</span>
          <div><div className="ap2-adv-title">Path Planning</div><div className="ap2-adv-sub">Bezier curves and smooth motion · 62% done</div></div>
          <span className="ap2-adv-cta ap2-adv-cont">Continue</span>
        </div>
      </div>

      {/* All concepts */}
      <div className="ap2-section-hd">All concepts</div>
      <div className="ap2-concept-list">
        {[
          { e: '🗺️', t: 'Coordinate Systems',      s: 'How robots navigate space',              done: true  },
          { e: '〰️', t: 'Path Planning',             s: 'Bezier curves and smooth motion',        active: true},
          { e: '🔷', t: 'Geometry Through Drawing',  s: 'Shapes, symmetry & patterns'                        },
          { e: '👁️', t: 'Computer Vision',           s: 'How the robot sees the world',           lock: true  },
          { e: '🎛️', t: 'Control Theory',            s: 'Feedback loops and precision',            lock: true  },
          { e: '〰️', t: 'Trigonometry in Motion',    s: 'Sine, cosine, and circular paths'                    },
          { e: '🎯', t: 'Cone Ring Gauntlet',        s: 'Ultrasonic aim · line sensors'                       },
          { e: '🤼', t: 'Sumo Arena',                s: 'Push the rival bot out first'                        },
          { e: '🧭', t: 'Maze Marathon',             s: 'Wall-follow, nodes, and memory'                      },
          { e: '🧠', t: 'Systems Thinking',          s: 'Design your own challenge'                           },
        ].map(c => (
          <div key={c.t} className={`ap2-concept-row${c.done ? ' done' : c.active ? ' active' : c.lock ? ' lock' : ''}`}>
            <span className="ap2-concept-e">{c.e}</span>
            <span className="ap2-concept-t">{c.t}</span>
            <span className="ap2-concept-s">{c.s}</span>
            {c.done   && <span className="ap2-badge-sm ap2-badge-done">✓</span>}
            {c.active && <span className="ap2-badge-sm ap2-badge-act">In progress</span>}
            {c.lock   && <span className="ap2-badge-sm ap2-badge-lock">🔒</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Session ──────────────────────────────────────────────────────────────── */
function SessionView() {
  return (
    <div className="ap2-session">
      {/* learn-header */}
      <div className="ap2-hdr">
        <span className="ap2-hdr-back">← Menu</span>
        <span className="ap2-hdr-av">🤖</span>
        <span className="ap2-hdr-brand">✏️ SketchBot</span>
        <span className="ap2-hdr-sep" />
        <span className="ap2-hdr-picker">〰️ Path Planning ▾</span>
        <span className="ap2-hdr-sep" />
        <div className="ap2-gamif">
          <span className="ap2-lv">✏️ Lv.4</span>
          <div className="ap2-gxp-track"><div className="ap2-gxp-fill" style={{ width: '68%' }} /></div>
          <span className="ap2-gxp-num">340 XP</span>
          <span className="ap2-streak">🔥 9</span>
        </div>
        <span style={{ flex: 1 }} />
        <span className="ap2-hdr-picker">⚡ Builder ▾</span>
        <span className="ap2-hdr-sep" />
        <span className="ap2-sys"><span className="ap2-sys-dot" />Simulator</span>
        <span className="ap2-hdr-back">🗺️ Map</span>
      </div>

      {/* Workspace: sim left, tutor right */}
      <div className="ap2-workspace">
        {/* Left: canvas */}
        <div className="ap2-canvas">
          <div className="ap2-ws-tabs">
            <span className="ap2-ws-tab on">🤖 Simulator</span>
            <span className="ap2-ws-tab">📷 Live Camera</span>
            <span className="ap2-ws-tab">✏️ Code</span>
          </div>

          {/* Simulator SVG */}
          <div className="ap2-sim">
            <svg viewBox="0 0 320 180" style={{ width: '100%', height: '100%' }}>
              {/* Grid */}
              <defs>
                <pattern id="g2" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M20 0L0 0 0 20" fill="none" stroke="rgba(93,228,255,0.07)" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="320" height="180" fill="url(#g2)"/>
              {/* Axes */}
              <line x1="0" y1="90" x2="320" y2="90" stroke="rgba(93,228,255,0.05)" strokeWidth="0.8"/>
              <line x1="160" y1="0" x2="160" y2="180" stroke="rgba(93,228,255,0.05)" strokeWidth="0.8"/>
              {/* Drawn trace (what the robot drew) */}
              <path d="M 44 148 C 60 100 100 78 160 76 C 220 74 264 106 278 144"
                stroke="rgba(93,228,255,0.35)" strokeWidth="1.5" fill="none" strokeDasharray="3 2"/>
              {/* Planned path */}
              <path d="M 44 148 C 60 100 100 78 160 76 C 220 74 264 106 278 144"
                stroke="#5de4ff" strokeWidth="2" fill="none" opacity="0.7"/>
              {/* Waypoints */}
              {([[44,148,'W1'],[160,76,'W2'],[278,144,'W3']] as [number,number,string][]).map(([x,y,l]) => (
                <g key={l}>
                  <circle cx={x} cy={y} r="5" fill="#5de4ff" fillOpacity="0.9"/>
                  <circle cx={x} cy={y} r="9" fill="none" stroke="#5de4ff" strokeOpacity="0.2" strokeWidth="1.5"/>
                  <text x={x+8} y={y-7} fontSize="7" fill="rgba(93,228,255,0.6)" fontFamily="monospace">{l}</text>
                </g>
              ))}
              {/* Robot */}
              <g transform="translate(158,72)">
                <rect x="-8" y="-5.5" width="16" height="12" rx="3" fill="#1a2540" stroke="#5de4ff" strokeWidth="0.8"/>
                <circle cx="0" cy="0" r="2" fill="#5de4ff"/>
                <ellipse cx="-5" cy="6.5" rx="2.5" ry="2.5" fill="#111" stroke="#5de4ff" strokeWidth="0.6"/>
                <ellipse cx="5"  cy="6.5" rx="2.5" ry="2.5" fill="#111" stroke="#5de4ff" strokeWidth="0.6"/>
              </g>
              {/* HUD */}
              <text x="6" y="12" fontSize="6.5" fill="rgba(93,228,255,0.4)" fontFamily="monospace">SIM · path-planning · structural</text>
              <text x="6" y="175" fontSize="6" fill="rgba(149,166,199,0.3)" fontFamily="monospace">pos (160, 76) · heading 0° · pen down</text>
            </svg>
          </div>

          {/* Prompt bar */}
          <div className="ap2-prompt">
            <div className="ap2-prompt-input">Describe what to draw…</div>
            <span className="ap2-prompt-ico">📎</span>
            <span className="ap2-prompt-ico">🗂</span>
            <button className="ap2-gen-btn">▶ Generate</button>
          </div>
        </div>

        {/* Right: tutor */}
        <div className="ap2-tutor">
          <div className="ap2-tutor-hd">🤖 Sketch · Tutor</div>
          <div className="ap2-tutor-scroll">
            <div className="ap2-msg">
              Nice waypoint placement! The robot will interpolate a smooth Bezier curve through W1 → W2 → W3 instead of sharp turns.
            </div>
            <div className="ap2-step-rail">
              <span className="ap2-step done">Intro</span>
              <span className="ap2-step done">Concept</span>
              <span className="ap2-step on">Try It</span>
              <span className="ap2-step">Quiz</span>
              <span className="ap2-step">Draw!</span>
            </div>
            <div className="ap2-msg ap2-msg-q">
              🤔 If you moved W2 higher (larger y), would the arc get tighter or wider?
            </div>
            <div className="ap2-choices">
              <button className="ap2-choice">Tighter</button>
              <button className="ap2-choice">Wider</button>
              <button className="ap2-choice">No change</button>
            </div>
            <div className="ap2-xp-earn">+40 XP on completion</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Map ──────────────────────────────────────────────────────────────────── */
function MapView() {
  const nodes = [
    { e: '🗺️', t: 'Coordinate Systems',      status: 'mastered',  xp: 180, pct: 100 },
    { e: '🔷', t: 'Geometry Through Drawing', status: 'mastered',  xp: 160, pct: 100 },
    { e: '〰️', t: 'Path Planning',             status: 'active',    xp: 200, pct: 62  },
    { e: '〰️', t: 'Trigonometry in Motion',    status: 'available', xp: 0,   pct: 0   },
    { e: '👁️', t: 'Computer Vision',           status: 'locked',    xp: 0,   pct: 0   },
    { e: '🎛️', t: 'Control Theory',            status: 'locked',    xp: 0,   pct: 0   },
    { e: '🎯', t: 'Cone Ring Gauntlet',        status: 'locked',    xp: 0,   pct: 0   },
    { e: '🤼', t: 'Sumo Arena',                status: 'locked',    xp: 0,   pct: 0   },
    { e: '🧭', t: 'Maze Marathon',             status: 'locked',    xp: 0,   pct: 0   },
    { e: '🧠', t: 'Systems Thinking',          status: 'locked',    xp: 0,   pct: 0   },
  ];

  return (
    <div className="ap2-map">
      {/* Stats bar */}
      <div className="ap2-map-stats">
        <div className="ap2-map-stat"><span className="ap2-ms-v">340</span><span className="ap2-ms-l">XP</span></div>
        <div className="ap2-map-stat"><span className="ap2-ms-v">4</span><span className="ap2-ms-l">Level</span></div>
        <div className="ap2-map-stat"><span className="ap2-ms-v">9d</span><span className="ap2-ms-l">Streak 🔥</span></div>
        <div className="ap2-map-stat"><span className="ap2-ms-v">11</span><span className="ap2-ms-l">Sessions</span></div>
        <div className="ap2-map-stat"><span className="ap2-ms-v">7</span><span className="ap2-ms-l">Drawings</span></div>
        <div className="ap2-map-stat"><span className="ap2-ms-v">2/10</span><span className="ap2-ms-l">Concepts</span></div>
      </div>

      {/* Concept nodes */}
      <div className="ap2-section-hd">Your learning journey</div>
      <div className="ap2-nodes">
        {nodes.map((n, i) => (
          <div key={n.t} className={`ap2-node ap2-node-${n.status}`}>
            <div className="ap2-node-left">
              <div className="ap2-node-ring">{n.status === 'mastered' ? '✓' : n.e}</div>
              {i < nodes.length - 1 && <div className="ap2-node-spine" />}
            </div>
            <div className="ap2-node-right">
              <span className="ap2-node-title">{n.t}</span>
              <div className="ap2-node-meta">
                {n.status === 'mastered'  && <><span className="ap2-ns ap2-ns-m">Mastered</span><span className="ap2-nxp">+{n.xp} XP</span></>}
                {n.status === 'active'    && <><span className="ap2-ns ap2-ns-a">In progress</span><div className="ap2-nprog"><div style={{ width: `${n.pct}%` }} /></div><span className="ap2-nxp">{n.pct}%</span></>}
                {n.status === 'available' && <span className="ap2-ns ap2-ns-av">Start</span>}
                {n.status === 'locked'    && <span className="ap2-ns ap2-ns-l">🔒 Locked</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Badges */}
      <div className="ap2-section-hd" style={{ marginTop: 8 }}>Earned badges</div>
      <div className="ap2-badge-row">
        {['🥇 First Drawing', '⭐ 3-Day Streak', '🎯 100% Quiz', '🏁 First Robot Run'].map(b => (
          <span key={b} className="ap2-bdg">{b}</span>
        ))}
      </div>
    </div>
  );
}
