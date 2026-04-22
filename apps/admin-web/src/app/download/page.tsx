import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Reveal } from '@/components/reveal';
import { DownloadPageClient } from './download-client';

export const metadata: Metadata = {
  title: 'Download Aibotics — AI-Tutored Robotics Platform',
  description:
    'Download the Aibotics desktop app for Windows. Includes the AI tutor, robot simulator, and the local Python runtime — everything bundled, no setup required.',
};

const RELEASE_CDN = process.env.NEXT_PUBLIC_RELEASE_CDN_URL ?? 'https://releases.aibotics.app';

const REQUIREMENTS = [
  { icon: '🖥️', label: 'OS',         value: 'Windows 10 or 11 (64-bit)' },
  { icon: '⚙️', label: 'RAM',        value: '4 GB minimum, 8 GB recommended' },
  { icon: '💾', label: 'Disk',       value: '~600 MB for full install' },
  { icon: '🌐', label: 'Network',    value: 'Required for AI tutor (robot runs offline)' },
  { icon: '🤖', label: 'Hardware',   value: 'Optional — full simulator included' },
];

const WHATS_INSIDE = [
  { icon: '🧠', title: 'AI Tutor',         desc: 'Claude-powered guidance, adapts to your level' },
  { icon: '🔬', title: '3D Simulator',      desc: 'Test robot code without hardware' },
  { icon: '🐍', title: 'Python Runtime',    desc: 'Bundled venv — no installation needed' },
  { icon: '📡', title: 'Robot Bridge',      desc: 'Wi-Fi link to your physical Aibotics robot' },
  { icon: '🏆', title: 'Challenge Library', desc: '20+ guided challenges across 5 domains' },
  { icon: '📶', title: 'Works offline',     desc: 'Simulator and block runner need no internet' },
];

export default function DownloadPage() {
  const exeUrl  = `${RELEASE_CDN}/latest/Aibotics-Setup.exe`;
  const yamlUrl = `${RELEASE_CDN}/latest.yml`;

  return (
    <>
      <SiteHeader />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="hero-section" style={{ paddingBottom: 80 }}>
        <div className="hero-orbs">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
        </div>
        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <Reveal>
            <p className="eyebrow" style={{ marginBottom: 16 }}>Download</p>
            <h1 className="display-1" style={{ maxWidth: 680, margin: '0 auto 20px' }}>
              The full platform,<br />
              <span className="grad-text">one installer</span>
            </h1>
            <p className="body-lg" style={{ maxWidth: 520, margin: '0 auto 40px', color: 'var(--text-muted)' }}>
              AI tutor, 3D simulator, Python runtime, and robot bridge — bundled together.
              Download once, everything just works.
            </p>
          </Reveal>

          {/* OS tabs + download button — client component for OS detection */}
          <DownloadPageClient exeUrl={exeUrl} yamlUrl={yamlUrl} />
        </div>
      </section>

      {/* ── What's inside ───────────────────────────────────────────────── */}
      <section className="section">
        <div className="container">
          <Reveal>
            <div className="section-header">
              <p className="eyebrow">What's included</p>
              <h2 className="display-2">
                Everything in <span className="grad-text">one download</span>
              </h2>
            </div>
          </Reveal>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 20,
              marginTop: 48,
            }}
          >
            {WHATS_INSIDE.map(({ icon, title, desc }, i) => (
              <Reveal key={title} delay={i * 0.06}>
                <div className="dl-feature-card">
                  <div className="dl-feature-icon">{icon}</div>
                  <div className="dl-feature-title">{title}</div>
                  <div className="dl-feature-desc">{desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── System requirements ─────────────────────────────────────────── */}
      <section className="section-sm" style={{ background: 'rgba(255,255,255,0.018)' }}>
        <div className="container">
          <Reveal>
            <div className="section-header" style={{ marginBottom: 36 }}>
              <p className="eyebrow">Requirements</p>
              <h2 className="display-3">System requirements</h2>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="dl-requirements-table">
              {REQUIREMENTS.map(({ icon, label, value }) => (
                <div key={label} className="dl-req-row">
                  <span className="dl-req-icon">{icon}</span>
                  <span className="dl-req-label">{label}</span>
                  <span className="dl-req-value">{value}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CTA strip ───────────────────────────────────────────────────── */}
      <section className="section-sm">
        <div className="container" style={{ textAlign: 'center' }}>
          <Reveal>
            <h2 className="display-3" style={{ marginBottom: 16 }}>
              Don&apos;t have a robot yet?
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 28 }}>
              The simulator lets you run every challenge on-screen — no hardware required to start.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/pricing" className="btn btn-primary">See plans →</Link>
              <Link href="/#demo" className="btn btn-outline">Watch a demo</Link>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
