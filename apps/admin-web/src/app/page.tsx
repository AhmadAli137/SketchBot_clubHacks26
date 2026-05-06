import Link from 'next/link';
import Image from 'next/image';

import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Reveal, RevealGroup } from '@/components/reveal';
import { HeroSection } from '@/components/home/hero-section';
import { HeroScene3DClient as HeroScene3D } from '@/components/home/hero-scene-3d-client';

const ICON_STROKE = 'currentColor';

function IconChat({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={ICON_STROKE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.6 7.15L4 20l1-4.5A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

function IconBlocks({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={ICON_STROKE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.4" />
      <rect x="14" y="3" width="7" height="7" rx="1.4" />
      <rect x="3" y="14" width="7" height="7" rx="1.4" />
      <rect x="14" y="14" width="7" height="7" rx="1.4" />
    </svg>
  );
}

function IconCode({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={ICON_STROKE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
    </svg>
  );
}

function IconSpark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={ICON_STROKE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
  );
}

function IconRobot({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={ICON_STROKE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M12 4v4M9 13h.01M15 13h.01M9 17h6" />
    </svg>
  );
}

function IconCamera({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={ICON_STROKE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="14" height="14" rx="3" />
      <path d="m17 11 4-2v8l-4-2" />
    </svg>
  );
}

function IconDesktop({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={ICON_STROKE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M9 21h6M12 17v4" />
    </svg>
  );
}

const MODES = [
  {
    icon: <IconChat />,
    label: 'Explorer · 6–10',
    title: 'Words',
    body: 'Ask in plain language. The tutor turns the request into motion and explains the idea behind it.',
  },
  {
    icon: <IconBlocks />,
    label: 'Builder · 11–14',
    title: 'Blocks',
    body: 'Snap together move, turn, loop, and conditional blocks. See the path before the robot moves.',
  },
  {
    icon: <IconCode />,
    label: 'Engineer · 15+',
    title: 'Code',
    body: 'Write Python with the SaySpark SDK or flash C++ to the ESP32. The tutor switches to formal notation.',
  },
];

const PILLARS = [
  {
    icon: <IconSpark />,
    title: 'Spark, the AI tutor',
    body: 'Powered by Claude. Explains concepts as the robot performs them, asks Socratic questions, and adapts depth to each student.',
  },
  {
    icon: <IconRobot />,
    title: 'Real hardware',
    body: 'A differential-drive robot with a servo pen, AprilTag localization, and Bluetooth pairing. Drives directly on paper.',
  },
  {
    icon: <IconCamera />,
    title: 'Camera Buddy',
    body: 'Any phone or tablet becomes the overhead camera in one QR scan. Tutor speaks aloud through it during the session.',
  },
  {
    icon: <IconDesktop />,
    title: 'Desktop session',
    body: 'A 3D simulator, block and code editor, tutor panel, and live camera feed — all running locally on the classroom PC.',
  },
];

const PRODUCT_PAIR = [
  {
    label: 'Spark',
    title: 'AI tutor interface',
    body: 'A friendly tutor that listens, gives feedback, explains concepts aloud, and helps students refine ideas when the robot gets stuck.',
  },
  {
    label: 'Spark Mini',
    title: 'Hands-on robot',
    body: 'A small classroom-ready robot for mazes, soccer, drawing tasks, sensors, lighting, speech, and student-built challenges.',
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <HeroSection />

      <section className="section product-story-section" id="spark-system">
        <div className="container product-story">
          <Reveal>
            <div className="product-story-copy">
              <p className="eyebrow">The SaySpark system</p>
              <h2 className="display-2">
                One learning studio with <span className="grad-text">two companions.</span>
              </h2>
              <p className="body-lg">
                Spark lives in the app as the voice-first AI tutor. Spark Mini is
                the physical robot students can test, debug, and eventually take
                into real classrooms and homes.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="product-story-visual">
              <Image
                src="/assets/brand/spark-ai-tutor-and-spark-mini.png"
                alt="Spark AI tutor interface and Spark Mini robot shown side by side"
                width={1536}
                height={1024}
                className="product-story-image"
              />
            </div>
          </Reveal>
          <RevealGroup stagger={0.08} className="product-story-cards">
            {PRODUCT_PAIR.map(item => (
              <div key={item.label} className="product-story-card">
                <div className="product-story-label">{item.label}</div>
                <div className="card-title">{item.title}</div>
                <div className="card-body">{item.body}</div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Live 3D challenges ──────────────────────────────────────────────── */}
      <section className="section" id="demo">
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">See it in action</p>
              <h2 className="display-2">
                Five challenges. <span className="grad-text">One robot.</span>
              </h2>
              <p className="body-lg">
                The 3D simulator below mirrors the real sandbox — same chassis,
                same motors, same sensors. What runs here runs on paper.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <HeroScene3D />
          </Reveal>
        </div>
      </section>

      {/* ── Three ways to learn ─────────────────────────────────────────────── */}
      <section className="section" id="modes">
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">Three ways to learn</p>
              <h2 className="display-2">
                One robot. <span className="grad-text">Every age.</span>
              </h2>
              <p className="body-lg">
                The same physical robot adapts to the student. Six-year-olds talk
                to it. Teenagers write Python for it. The tutor speaks at their level.
              </p>
            </div>
          </Reveal>

          <RevealGroup stagger={0.08} className="grid-3">
            {MODES.map(m => (
              <div key={m.title} className="audience-card">
                <div className="card-icon card-icon-cyan" style={{ marginBottom: 14, color: 'var(--cyan)' }}>
                  {m.icon}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  {m.label}
                </div>
                <div className="audience-title">{m.title}</div>
                <div className="audience-sub">{m.body}</div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── How a session works ─────────────────────────────────────────────── */}
      <section className="section" style={{ background: 'rgba(255,255,255,0.015)' }} id="how">
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">How a session runs</p>
              <h2 className="display-2">From prompt to drawing.</h2>
            </div>
          </Reveal>

          <RevealGroup stagger={0.08} className="grid-4">
            {[
              { n: '01', title: 'Launch the desktop app',  body: 'The robot pairs over Bluetooth. The 3D simulator mirrors its arena.' },
              { n: '02', title: 'Clip Camera Buddy above', body: 'Scan a QR code. A phone becomes the overhead camera — no setup wizard.' },
              { n: '03', title: 'The tutor proposes a challenge', body: 'Spark picks something matched to the active concept and the student’s level.' },
              { n: '04', title: 'The robot draws the answer', body: 'The student commands it in words, blocks, or code. Spark narrates the underlying idea.' },
            ].map(s => (
              <div key={s.n} className="card">
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 12 }}>{s.n}</div>
                <div className="card-title" style={{ fontSize: '1rem' }}>{s.title}</div>
                <div className="card-body" style={{ fontSize: '0.9rem' }}>{s.body}</div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Platform pillars ────────────────────────────────────────────────── */}
      <section className="section" id="platform">
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">The platform</p>
              <h2 className="display-2">
                A tutor, a robot, a camera, and an app — <span className="grad-text">working together.</span>
              </h2>
            </div>
          </Reveal>

          <RevealGroup stagger={0.08} className="grid-4">
            {PILLARS.map(p => (
              <div key={p.title} className="card">
                <div className="card-icon card-icon-cyan" style={{ width: 40, height: 40, marginBottom: 14, color: 'var(--cyan)' }}>
                  {p.icon}
                </div>
                <div className="card-title" style={{ fontSize: '1rem' }}>{p.title}</div>
                <div className="card-body" style={{ fontSize: '0.9rem' }}>{p.body}</div>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Pricing CTA ─────────────────────────────────────────────────────── */}
      <section className="section future-vision-section">
        <div className="container future-vision">
          <Reveal>
            <div className="future-vision-copy">
              <p className="eyebrow">Where this goes next</p>
              <h2 className="display-2">
                Built for homes, classrooms, and robotics challenges.
              </h2>
              <p className="body-lg">
                The same voice-first studio can guide a student through a maze,
                run a robot soccer drill, or help a teacher launch a hands-on
                STEM activity without a complex hardware setup.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="future-vision-visual">
              <Image
                src="/assets/brand/sayspark-thank-you-future-vision.png"
                alt="Future vision of SaySpark robots solving mazes, playing robot soccer, and learning in homes and classrooms"
                width={1536}
                height={1024}
                className="future-vision-image"
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section-sm">
        <div className="container">
          <Reveal>
            <div className="cta-band">
              <h2 className="display-2" style={{ maxWidth: 560 }}>
                Free to start. Scales to a district.
              </h2>
              <p className="body-lg" style={{ maxWidth: 520 }}>
                Begin in the simulator with no robot and no card. Add hardware
                when the classroom is ready.
              </p>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link href="/pricing" className="btn btn-primary btn-lg">See pricing</Link>
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
