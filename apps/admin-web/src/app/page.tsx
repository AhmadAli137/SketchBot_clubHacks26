import Link from 'next/link';

import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Reveal, RevealGroup } from '@/components/reveal';
import { HeroSection } from '@/components/home/hero-section';
import { AppPreview } from '@/components/home/app-preview';

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <HeroSection />

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <section className="section-sm" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container">
          <Reveal>
            <div className="stat-strip">
              {[
                { value: '3', suffix: ' age groups', label: 'Explorer · Builder · Engineer' },
                { value: '20+', suffix: '', label: 'Robotics concepts taught' },
                { value: 'AI', suffix: ' tutor', label: 'Claude-powered, age-adaptive' },
                { value: '< 60', suffix: 's', label: 'Time to first drawing' },
              ].map(({ value, suffix, label }) => (
                <div key={label} className="stat-item">
                  <div className="stat-value grad-text">{value}<span style={{ fontSize: '1.2rem' }}>{suffix}</span></div>
                  <div className="stat-label">{label}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── App Preview (interactive demo) ──────────────────────────────── */}
      <section className="section" id="demo" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">See it in action</p>
              <h2 className="display-2">The full experience — <span className="grad-text">live in classrooms</span></h2>
              <p className="body-lg">
                Spark guides every student through concepts they can actually touch and see.
                The AI adapts its language to match the learner's age and level.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <AppPreview />
          </Reveal>
        </div>
      </section>

      {/* ── What is SketchBot ───────────────────────────────────────────── */}
      <section className="section" id="what" style={{ background: 'rgba(255,255,255,0.015)' }}>
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">The platform</p>
              <h2 className="display-2">A drawing robot that teaches <span className="grad-text">real engineering</span></h2>
              <p className="body-lg">
                SketchBot translates PhD-level robotics knowledge — kinematics, computer vision, control theory —
                into hands-on activities matched to any age. No textbooks. No prior experience.
              </p>
            </div>
          </Reveal>

          <RevealGroup stagger={0.1} className="grid-3">
            {[
              { icon: '🤖', color: 'card-icon-blue', title: 'Physical robot first', body: 'SketchBot drives on paper and draws with a pen. Students see real motion, real coordinates, real physics — not a simulation.' },
              { icon: '🧠', color: 'card-icon-purple', title: 'AI tutor built in', body: 'Spark — a Claude-powered tutor — guides every session, explains concepts, answers questions, and adapts to the student\'s age.' },
              { icon: '📐', color: 'card-icon-cyan', title: 'Three depths per concept', body: 'Every topic comes in Intuitive, Structural, and Precise flavors. Students unlock deeper layers through mastery.' },
            ].map((c) => (
              <div key={c.title} className="card">
                <div className={`card-icon ${c.color}`}>{c.icon}</div>
                <div className="card-title">{c.title}</div>
                <div className="card-body">{c.body}</div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="section" id="how">
        <div className="container">
          <div className="feature-split">
            <Reveal>
              <div className="feature-text">
                <p className="eyebrow">How it works</p>
                <h2 className="display-2">From prompt to <span className="grad-text">physical drawing</span></h2>
                <div className="steps">
                  {[
                    { n: '01', title: 'Student gives a prompt', body: 'Type it, speak it, drag blocks, or write code — three interaction modes for three age groups.' },
                    { n: '02', title: 'AI plans the path', body: 'Spark converts the intent into a robot path, explaining each step as it goes.' },
                    { n: '03', title: 'Robot draws it on paper', body: 'The SketchBot drives across the canvas, pen down, and produces a physical artifact students keep.' },
                    { n: '04', title: 'Tutor teaches the concept', body: 'After every drawing Spark surfaces the engineering concept behind it — and asks Socratic questions.' },
                  ].map((s) => (
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
                <div style={{ position: 'relative', zIndex: 1, padding: '32px', width: '100%' }}>
                  <svg viewBox="0 0 320 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%' }}>
                    <defs>
                      <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                        <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(79,142,255,0.12)" strokeWidth="0.5"/>
                      </pattern>
                      <linearGradient id="pathGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#4f8eff"/><stop offset="50%" stopColor="#8b5cf6"/><stop offset="100%" stopColor="#22d3ee"/>
                      </linearGradient>
                    </defs>
                    <rect width="320" height="240" fill="url(#grid)"/>
                    <path d="M 160 120 C 160 120 190 90 210 100 C 230 110 225 140 205 155 C 185 170 155 165 140 145 C 125 125 130 95 150 80 C 170 65 200 65 220 78"
                      stroke="url(#pathGrad)" strokeWidth="2.5" strokeLinecap="round" fill="none"
                      style={{ filter: 'drop-shadow(0 0 6px rgba(79,142,255,0.5))' }}
                    />
                    <circle cx="220" cy="78" r="6" fill="#4f8eff" style={{ filter: 'drop-shadow(0 0 8px #4f8eff)'}}/>
                    <circle cx="220" cy="78" r="12" fill="none" stroke="rgba(79,142,255,0.3)" strokeWidth="1.5"/>
                    <text x="8" y="235" fontSize="9" fill="rgba(107,122,158,0.8)" fontFamily="monospace">X</text>
                    <text x="12" y="16" fontSize="9" fill="rgba(107,122,158,0.8)" fontFamily="monospace">Y</text>
                    <path d="M 12 230 L 12 10 M 12 230 L 310 230" stroke="rgba(79,142,255,0.2)" strokeWidth="1"/>
                    <text x="210" y="72" fontSize="8" fill="rgba(79,142,255,0.8)" fontFamily="monospace">(58, 44)</text>
                    {([[4,4],[296,4],[4,222],[296,222]] as [number,number][]).map(([x,y], i) => (
                      <rect key={i} x={x} y={y} width="12" height="12" fill="none" stroke="rgba(245,158,11,0.4)" strokeWidth="1"/>
                    ))}
                  </svg>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Who it's for ────────────────────────────────────────────────── */}
      <section className="section" id="audience" style={{ background: 'rgba(255,255,255,0.015)' }}>
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">Who it&#39;s for</p>
              <h2 className="display-2">Built for every kind of <span className="grad-text-warm">learner</span></h2>
            </div>
          </Reveal>

          <RevealGroup stagger={0.12} className="grid-3">
            {[
              { emoji: '🧒', title: 'Young explorers', ages: 'Ages 6–10', body: 'Touch the canvas, describe what to draw in plain words, and watch the robot bring it to life. Spark uses friendly metaphors — no math required.', tags: ['Language prompts', 'Simulator mode', 'Visual feedback'] },
              { emoji: '👧', title: 'Student builders', ages: 'Ages 11–14', body: 'Snap blocks together to build programs, adjust parameters, and see how the robot responds. Learn loops, coordinates, and path planning through direct experiment.', tags: ['Block editor', 'Waypoint editor', 'Concept library'] },
              { emoji: '🧑‍💻', title: 'Young engineers', ages: 'Ages 15+', body: 'Write real Python. Plot parametric curves, implement PID gains, study homography. Spark can switch to formal math notation and pull no punches.', tags: ['Python SDK', 'Code editor', 'Math-level tutor'] },
            ].map((a) => (
              <div key={a.title} className="audience-card">
                <div className="audience-emoji">{a.emoji}</div>
                <div>
                  <div className="audience-title">{a.title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8 }}>{a.ages}</div>
                </div>
                <div className="audience-sub">{a.body}</div>
                <div className="audience-tags">{a.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Curriculum ──────────────────────────────────────────────────── */}
      <section className="section" id="curriculum">
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">The curriculum</p>
              <h2 className="display-2">Concepts students <span className="grad-text">actually master</span></h2>
              <p className="body-lg">Every concept is grounded in something the robot physically does. Abstract theory becomes visible, tangible, and memorable.</p>
            </div>
          </Reveal>

          <RevealGroup stagger={0.07} className="grid-4">
            {[
              { icon: '📍', color: 'card-icon-blue',   title: 'Coordinate Systems', body: 'Cartesian grids, home position, transforms' },
              { icon: '〰️', color: 'card-icon-purple', title: 'Path Planning',       body: 'Bezier curves, arc interpolation, waypoints' },
              { icon: '👁️', color: 'card-icon-cyan',   title: 'Computer Vision',     body: 'AprilTags, homography, camera calibration' },
              { icon: '🎛️', color: 'card-icon-green',  title: 'Control Theory',      body: 'PID feedback, gains, step response' },
              { icon: '📐', color: 'card-icon-amber',  title: 'Geometry & Trig',     body: 'sin/cos, polar equations, Fourier series' },
              { icon: '⚙️', color: 'card-icon-pink',   title: 'Systems Thinking',    body: 'Sensors, actuators, feedback loops' },
              { icon: '🏎️', color: 'card-icon-blue',   title: 'Kinematics',          body: 'Velocity profiles, differential drive, odometry' },
              { icon: '🔬', color: 'card-icon-purple', title: 'Engineering Design',  body: 'Iteration, testing, failure analysis' },
            ].map((c) => (
              <div key={c.title} className="card">
                <div className={`card-icon ${c.color}`} style={{ width: 40, height: 40, fontSize: '1.2rem', marginBottom: 12 }}>{c.icon}</div>
                <div className="card-title" style={{ fontSize: '0.95rem' }}>{c.title}</div>
                <div className="card-body" style={{ fontSize: '0.85rem' }}>{c.body}</div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Three apps ──────────────────────────────────────────────────── */}
      <section className="section" id="apps" style={{ background: 'rgba(255,255,255,0.015)' }}>
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">Three apps, one platform</p>
              <h2 className="display-2">Everything runs together — <span className="grad-text">seamlessly</span></h2>
            </div>
          </Reveal>

          <RevealGroup stagger={0.12} className="grid-3">
            {[
              { icon: '🖥️', color: 'card-icon-blue', title: 'Desktop App', body: 'The classroom computer runs robot sessions, camera vision, and Spark locally. No cloud dependency for the live session — everything is fast and offline-capable.', tags: ['Electron', 'Local runtime', 'Camera vision', 'AI tutor'] },
              { icon: '📱', color: 'card-icon-purple', title: 'Camera Buddy', body: 'A phone or tablet on the same Wi-Fi network instantly becomes an overhead camera. Students scan a QR code and join the room — no pairing wizard.', tags: ['iOS + Android', 'Expo', 'Same-network', 'Live preview'] },
              { icon: '🌐', color: 'card-icon-cyan', title: 'This Website', body: 'Teacher accounts, classroom management, app downloads, and billing. Designed for the ten minutes before class starts, not for the session itself.', tags: ['Accounts', 'Downloads', 'Billing', 'Support'] },
            ].map((c) => (
              <div key={c.title} className="card">
                <div className={`card-icon ${c.color}`}>{c.icon}</div>
                <div className="card-title">{c.title}</div>
                <div className="card-body" style={{ marginBottom: 16 }}>{c.body}</div>
                <div className="audience-tags">{c.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Pricing CTA ─────────────────────────────────────────────────── */}
      <section className="section-sm" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container">
          <Reveal>
            <div className="cta-band">
              <p className="eyebrow">Pricing</p>
              <h2 className="display-2" style={{ maxWidth: 560 }}>
                From <span className="grad-text">free simulator</span> to district scale
              </h2>
              <p className="body-lg" style={{ maxWidth: 520 }}>
                Start with the free Explorer plan — no credit card, no robot required.
                Upgrade when your classroom is ready for the real hardware.
              </p>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link href="/pricing" className="btn btn-primary">See all plans</Link>
                <Link href="/sign-up" className="btn btn-outline">Create free account</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
