import Link from 'next/link';

import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Reveal, RevealGroup } from '@/components/reveal';
import { HeroSection } from '@/components/home/hero-section';
import { AppPreview } from '@/components/home/app-preview';
import { HeroScene3DClient as HeroScene3D } from '@/components/home/hero-scene-3d-client';

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <HeroSection />

      {/* ── Stats strip ─────────────────────────────────────────────────────── */}
      <section className="section-sm">
        <div className="container">
          <Reveal>
            <div className="stat-strip">
              {[
                { value: '3',    suffix: ' age groups',  label: 'Explorer · Builder · Engineer' },
                { value: '5',    suffix: ' challenges',  label: 'Maze · Sumo · Cones · Waypoints · Drawing' },
                { value: 'AI',   suffix: ' tutor',       label: 'Claude-powered, speaks aloud via TTS' },
                { value: '< 60', suffix: 's',            label: 'Time to first drawing on real paper' },
              ].map(({ value, suffix, label }) => (
                <div key={label} className="stat-item">
                  <div className="stat-value grad-text">{value}<span style={{ fontSize: '1.1rem' }}>{suffix}</span></div>
                  <div className="stat-label">{label}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Live 3D Challenges ──────────────────────────────────────────────── */}
      <section className="section" id="demo">
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">See it in action</p>
              <h2 className="display-2">
                Real challenges, <span className="grad-text">real robot</span>
              </h2>
              <p className="body-lg">
                Every session puts the robot in a live challenge. Students write the code
                or place the waypoints — the robot executes it on real hardware.
                The 3D simulator mirrors exactly what happens physically.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <HeroScene3D />
          </Reveal>
        </div>
      </section>

      {/* ── App experience (interactive mock) ──────────────────────────────── */}
      <section className="section" style={{ background: 'rgba(255,255,255,0.015)' }}>
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">The desktop app</p>
              <h2 className="display-2">
                One session — <span className="grad-text">everything connected</span>
              </h2>
              <p className="body-lg">
                The desktop app runs the robot session, streams Spark&apos;s lessons,
                and shows the live camera feed — all on your classroom PC.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <AppPreview />
          </Reveal>
        </div>
      </section>

      {/* ── Spark AI tutor ──────────────────────────────────────────────────── */}
      <section className="section" id="spark">
        <div className="container">
          <div className="feature-split">
            <Reveal>
              <div className="feature-text">
                <p className="eyebrow">Meet Spark</p>
                <h2 className="display-2">
                  An AI tutor that <span className="grad-text">actually teaches</span>
                </h2>
                <p className="body-lg" style={{ marginBottom: 28 }}>
                  Spark is powered by Claude and adapts its language, pacing, and depth
                  to the student&apos;s age group — from playful metaphors for 6-year-olds
                  to formal math notation for teens writing Python.
                </p>
                <div className="steps">
                  {[
                    { n: '01', title: 'Narrates every concept', body: 'Spark explains what the robot is doing as it does it — not from a textbook but from the live event in front of the student.' },
                    { n: '02', title: 'Speaks aloud (TTS)',     body: 'On the companion app, Spark\'s voice comes out of the phone. Students hear the tutor explain while watching the robot move.' },
                    { n: '03', title: 'Quizzes and challenges', body: 'After each concept, Spark asks Socratic questions, gives hint-gated challenges, and adjusts based on the answer.' },
                    { n: '04', title: 'Tracks emotion + XP',   body: 'Spark\'s face changes (excited, curious, celebrating) based on student performance. XP, streaks, and badges reinforce the loop.' },
                  ].map(s => (
                    <div key={s.n} className="step">
                      <div className="step-num">{s.n}</div>
                      <div className="step-content">
                        <div className="step-title">{s.title}</div>
                        <div className="step-body">{s.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="feature-visual">
                {/* Lesson step mockup */}
                <div className="lesson-mockup">
                  <div className="lesson-mock-header">
                    <div className="lesson-mock-step-rail">
                      {['Intro', 'Concept', 'Try It', 'Quiz', 'Draw!'].map((s, i) => (
                        <div key={s} className={`lesson-mock-step${i === 2 ? ' active' : i < 2 ? ' done' : ''}`}>
                          <div className="lesson-mock-dot">{i < 2 ? '✓' : ''}</div>
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="lesson-mock-body">
                    <div className="lesson-mock-spark">
                      <div className="lesson-mock-avatar">🤩</div>
                      <div className="lesson-mock-bubble">
                        Now try it! Drag the three waypoints to form a triangle.
                        The robot will follow the path you designed.
                      </div>
                    </div>
                    <div className="lesson-mock-challenge">
                      <div className="lesson-mock-ch-label">Challenge — Place Waypoints</div>
                      <div className="lesson-mock-ch-hint">Hint: start near the robot&apos;s home position</div>
                    </div>
                    <div className="lesson-mock-xp">
                      <span className="lesson-mock-xp-pill">+40 XP</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>for completing this step</span>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Three interaction modes ──────────────────────────────────────────── */}
      <section className="section" style={{ background: 'rgba(255,255,255,0.015)' }} id="modes">
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">Three ways to control the robot</p>
              <h2 className="display-2">
                Every age group <span className="grad-text-warm">learns their way</span>
              </h2>
            </div>
          </Reveal>

          <RevealGroup stagger={0.1} className="grid-3">
            {[
              {
                emoji: '🧒', color: 'card-icon-cyan', label: 'Explorer · Ages 6–10',
                title: 'Language prompts',
                body: 'Type or speak in plain language: "draw a star" or "go to the red ball". Spark translates the intent into robot motion and explains the concept it used.',
                tags: ['Natural language', 'Voice input', 'Spark guides every step'],
              },
              {
                emoji: '👧', color: 'card-icon-blue', label: 'Builder · Ages 11–14',
                title: 'Block editor',
                body: 'Snap together Move, Turn, Loop, and If blocks to build robot programs. Place waypoints visually on the grid. See the path before the robot runs it.',
                tags: ['Scratch-style blocks', 'Waypoint editor', 'Live path preview'],
              },
              {
                emoji: '🧑‍💻', color: 'card-icon-purple', label: 'Engineer · Ages 15+',
                title: 'Python SDK',
                body: 'Write real Python in the code editor. Import sketchbot, plot parametric curves, implement PID gains, read AprilTag poses. Spark switches to formal math notation.',
                tags: ['Python SDK', 'Code editor', 'Math-level tutor'],
              },
            ].map(c => (
              <div key={c.title} className="audience-card">
                <div className={`card-icon ${c.color}`} style={{ fontSize: '2rem', marginBottom: 8 }}>{c.emoji}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{c.label}</div>
                <div className="audience-title">{c.title}</div>
                <div className="audience-sub">{c.body}</div>
                <div className="audience-tags">{c.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── How a session works ─────────────────────────────────────────────── */}
      <section className="section" id="how">
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">A session, step by step</p>
              <h2 className="display-2">
                From prompt to <span className="grad-text">physical drawing</span>
              </h2>
            </div>
          </Reveal>

          <RevealGroup stagger={0.08} className="grid-4" >
            {[
              { n: '01', icon: '🖥️', title: 'Launch the desktop app', body: 'SketchBot pairs over USB or Bluetooth. The 3D simulator fires up and mirrors the robot\'s arena.' },
              { n: '02', icon: '📱', title: 'Clip Camera Buddy above', body: 'Scan a QR code from your phone. It becomes the overhead camera — no pairing wizard, no cables.' },
              { n: '03', icon: '🤖', title: 'Spark picks a challenge', body: 'Based on the active concept and age group, Spark proposes a challenge. Students accept and control the robot.' },
              { n: '04', icon: '🧠', title: 'Spark teaches the why', body: 'After each draw, Spark narrates what concept made it possible, then quizzes the student. XP is awarded.' },
            ].map(s => (
              <div key={s.n} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.2rem', marginBottom: 12 }}>{s.icon}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>{s.n}</div>
                <div className="card-title">{s.title}</div>
                <div className="card-body">{s.body}</div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Curriculum ──────────────────────────────────────────────────────── */}
      <section className="section" style={{ background: 'rgba(255,255,255,0.015)' }} id="curriculum">
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">The curriculum</p>
              <h2 className="display-2">
                Concepts students <span className="grad-text">actually master</span>
              </h2>
              <p className="body-lg">
                Every concept unlocks via hands-on activity. Abstract theory becomes
                visible, tangible, and impossible to forget because the robot did it.
              </p>
            </div>
          </Reveal>

          <RevealGroup stagger={0.07} className="grid-4">
            {[
              { icon: '📍', color: 'card-icon-blue',   title: 'Coordinate Systems', body: 'Cartesian grids, home position, frame transforms' },
              { icon: '〰️', color: 'card-icon-purple', title: 'Path Planning',       body: 'Bezier curves, arc interpolation, waypoints' },
              { icon: '👁️', color: 'card-icon-cyan',   title: 'Computer Vision',     body: 'AprilTags, homography, camera calibration' },
              { icon: '🎛️', color: 'card-icon-green',  title: 'Control Theory',      body: 'PID feedback, gains, step response' },
              { icon: '📐', color: 'card-icon-amber',  title: 'Geometry & Trig',     body: 'sin/cos, polar equations, Fourier series' },
              { icon: '⚙️', color: 'card-icon-pink',   title: 'Systems Thinking',    body: 'Sensors, actuators, closed-loop feedback' },
              { icon: '🏎️', color: 'card-icon-blue',   title: 'Kinematics',          body: 'Velocity profiles, differential drive, odometry' },
              { icon: '🔬', color: 'card-icon-purple', title: 'Engineering Design',  body: 'Iteration, testing, failure analysis' },
            ].map(c => (
              <div key={c.title} className="card">
                <div className={`card-icon ${c.color}`} style={{ width: 40, height: 40, fontSize: '1.2rem', marginBottom: 12 }}>{c.icon}</div>
                <div className="card-title" style={{ fontSize: '0.95rem' }}>{c.title}</div>
                <div className="card-body" style={{ fontSize: '0.85rem' }}>{c.body}</div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Three apps ──────────────────────────────────────────────────────── */}
      <section className="section" id="apps">
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">Three apps, one platform</p>
              <h2 className="display-2">
                Everything runs together — <span className="grad-text">seamlessly</span>
              </h2>
            </div>
          </Reveal>

          <RevealGroup stagger={0.1} className="grid-3">
            {[
              {
                icon: '🖥️', color: 'card-icon-blue', title: 'Desktop App',
                body: 'The classroom PC runs the robot session. Live 3D simulator, block/code editor, Spark tutor panel, camera feed, XP system — all local, offline-capable. Connects to the robot over USB or Bluetooth.',
                tags: ['Electron', 'Local AI runtime', '3D sim', 'Block + Python editor'],
              },
              {
                icon: '📱', color: 'card-icon-purple', title: 'Camera Buddy',
                body: 'A phone or tablet becomes an overhead camera in one QR scan. Also doubles as a mobile lesson player — Spark\'s voice comes out of the phone via TTS while the robot draws on paper below.',
                tags: ['iOS + Android', 'Expo', 'Live overhead camera', 'Tutor TTS on mobile'],
              },
              {
                icon: '🌐', color: 'card-icon-cyan', title: 'This Website',
                body: 'Teacher accounts, classroom management, student progress dashboards, app downloads, and billing. Designed to be set up in the ten minutes before class starts.',
                tags: ['Teacher accounts', 'Progress sync', 'Downloads', 'Billing'],
              },
            ].map(c => (
              <div key={c.title} className="card">
                <div className={`card-icon ${c.color}`}>{c.icon}</div>
                <div className="card-title">{c.title}</div>
                <div className="card-body" style={{ marginBottom: 16 }}>{c.body}</div>
                <div className="audience-tags">{c.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Pricing CTA ─────────────────────────────────────────────────────── */}
      <section className="section-sm">
        <div className="container">
          <Reveal>
            <div className="cta-band">
              <p className="eyebrow">Pricing</p>
              <h2 className="display-2" style={{ maxWidth: 560 }}>
                From <span className="grad-text">free simulator</span> to district scale
              </h2>
              <p className="body-lg" style={{ maxWidth: 520 }}>
                Start with the free Explorer plan — simulator only, no credit card, no robot required.
                Upgrade when your classroom is ready for real hardware.
              </p>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link href="/pricing" className="btn btn-primary btn-lg">See all plans</Link>
                <Link href="/sign-up" className="btn btn-outline btn-lg">Create free account</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
