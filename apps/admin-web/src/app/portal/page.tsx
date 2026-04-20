'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Reveal, RevealGroup } from '@/components/reveal';
import { CLOUD_API_URL as CLOUD_BACKEND_URL } from '@/lib/config';

type PortalSummary = {
  organization_count: number;
  desktop_channel: string;
  companion_channel: string;
  latest_desktop_version: string;
  latest_companion_version: string;
  support_status: string;
};

type ReleaseInfo  = { version: string; channel: string; published_at: string; download_label: string };
type ReleasePayload = { desktop: ReleaseInfo; companion: ReleaseInfo };
type SupportPayload = { status: string; message: string; updated_at: string };

const fallbackSummary: PortalSummary = {
  organization_count: 12,
  desktop_channel: 'stable',
  companion_channel: 'stable',
  latest_desktop_version: '0.1.0',
  latest_companion_version: '1.0.0',
  support_status: 'green',
};

const fallbackReleases: ReleasePayload = {
  desktop:   { version: '0.1.0', channel: 'stable', published_at: '2026-04-14', download_label: 'Desktop installer' },
  companion: { version: '1.0.0', channel: 'stable', published_at: '2026-04-14', download_label: 'Expo Camera Buddy' },
};

const fallbackSupport: SupportPayload = {
  status: 'green',
  message: 'All platform systems are healthy.',
  updated_at: '2026-04-14T12:00:00Z',
};

const STATUS_COLORS: Record<string, string> = {
  green:  'var(--green)',
  yellow: 'var(--amber)',
  red:    '#ef4444',
};

export default function PortalPage() {
  const [summary,   setSummary]   = useState<PortalSummary>(fallbackSummary);
  const [releases,  setReleases]  = useState<ReleasePayload>(fallbackReleases);
  const [support,   setSupport]   = useState<SupportPayload>(fallbackSupport);
  const [reachable, setReachable] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, r, sup] = await Promise.all([
          fetch(`${CLOUD_BACKEND_URL}/api/admin/summary`,  { cache: 'no-store' }),
          fetch(`${CLOUD_BACKEND_URL}/api/admin/releases`, { cache: 'no-store' }),
          fetch(`${CLOUD_BACKEND_URL}/api/admin/support`,  { cache: 'no-store' }),
        ]);
        if (!s.ok || !r.ok || !sup.ok) throw new Error('unreachable');
        setSummary(await s.json());
        setReleases(await r.json());
        setSupport(await sup.json());
        setReachable(true);
      } catch {
        setReachable(false);
      }
    };
    void load();
  }, []);

  const statusColor = STATUS_COLORS[support.status] ?? 'var(--muted)';

  return (
    <>
      <SiteHeader />
      <main style={{ paddingTop: 'calc(var(--nav-h) + 48px)', paddingBottom: 80, position: 'relative', zIndex: 1 }}>
        <div className="container">

          {/* Header */}
          <Reveal>
            <div style={{ marginBottom: 48 }}>
              <p className="eyebrow" style={{ marginBottom: 12 }}>Teacher portal</p>
              <h1 className="display-2" style={{ marginBottom: 12 }}>
                Keep your classroom <span className="grad-text">ready</span>
              </h1>
              <p className="body-lg" style={{ maxWidth: 560 }}>
                Check release status, download the latest apps, and make sure support systems are healthy
                before class starts.
              </p>
            </div>
          </Reveal>

          {/* Cloud status banner */}
          <Reveal>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 18px',
              borderRadius: 'var(--radius-md)',
              background: reachable ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.06)',
              border: `1px solid ${reachable ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
              marginBottom: 36,
              fontSize: '0.88rem',
              color: reachable ? 'var(--green)' : 'var(--amber)',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: reachable ? 'var(--green)' : 'var(--amber)', display: 'inline-block', flexShrink: 0 }}/>
              {reachable
                ? `Connected to cloud backend — ${CLOUD_BACKEND_URL}`
                : 'Cloud backend unreachable — showing local placeholder data'}
            </div>
          </Reveal>

          {/* Stats */}
          <Reveal>
            <div className="stat-strip" style={{ marginBottom: 32 }}>
              {[
                { value: summary.organization_count.toString(), label: 'Organizations' },
                { value: summary.latest_desktop_version, label: 'Desktop version' },
                { value: summary.latest_companion_version, label: 'Companion version' },
                { value: support.status.toUpperCase(), label: 'Support status', color: statusColor },
              ].map(({ value, label, color }) => (
                <div key={label} className="stat-item">
                  <div className="stat-value" style={{ color: color ?? undefined }}>{value}</div>
                  <div className="stat-label">{label}</div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Cards */}
          <RevealGroup stagger={0.1} className="grid-2">
            {/* Downloads */}
            <div className="card">
              <p className="eyebrow" style={{ marginBottom: 16 }}>Downloads</p>
              <h3 className="headline" style={{ marginBottom: 20 }}>Current app versions</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[releases.desktop, releases.companion].map((r) => (
                  <div key={r.download_label} style={{
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.92rem' }}>{r.download_label}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2 }}>
                        v{r.version} · {r.channel} · {r.published_at}
                      </div>
                    </div>
                    <span style={{
                      padding: '4px 10px', borderRadius: 999,
                      background: 'rgba(79,142,255,0.1)', border: '1px solid rgba(79,142,255,0.25)',
                      fontSize: '0.72rem', fontWeight: 700, color: 'var(--blue-2)', whiteSpace: 'nowrap',
                    }}>
                      {r.channel}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Support */}
            <div className="card">
              <p className="eyebrow" style={{ marginBottom: 16 }}>Support</p>
              <h3 className="headline" style={{ marginBottom: 20 }}>System heartbeat</h3>
              <div style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(16,185,129,0.06)',
                border: '1px solid rgba(16,185,129,0.18)',
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, display: 'inline-block' }}/>
                  <strong style={{ color: statusColor, fontSize: '0.88rem', textTransform: 'capitalize' }}>{support.status}</strong>
                </div>
                <div style={{ fontSize: '0.88rem', color: 'var(--muted-2)' }}>{support.message}</div>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Last updated: {support.updated_at}</div>
            </div>

            {/* Quick links */}
            <div className="card">
              <p className="eyebrow" style={{ marginBottom: 16 }}>Quick links</p>
              <h3 className="headline" style={{ marginBottom: 20 }}>Teacher tasks</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Manage sign-in & classroom access', href: '/sign-in' },
                  { label: 'View all pricing plans', href: '/pricing' },
                  { label: 'Create a new account', href: '/sign-up' },
                ].map(({ label, href }) => (
                  <Link key={label} href={href} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    fontSize: '0.9rem', color: 'var(--text)',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}>
                    {label}
                    <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>→</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* About */}
            <div className="card">
              <p className="eyebrow" style={{ marginBottom: 16 }}>About this portal</p>
              <h3 className="headline" style={{ marginBottom: 12 }}>Designed for before class</h3>
              <p className="body-md">
                The live robot session runs locally on the desktop app — not here.
                This portal focuses on the ten minutes before class starts: confirming students can sign in,
                checking the app is up to date, and making sure support systems are green.
              </p>
            </div>
          </RevealGroup>

        </div>
      </main>
      <SiteFooter />
    </>
  );
}
