'use client';

import { useEffect, useState } from 'react';

import { SiteHeader } from '@/components/site-header';
import { CLOUD_BACKEND_URL } from '@/lib/config';

type PortalSummary = {
  organization_count: number;
  desktop_channel: string;
  companion_channel: string;
  latest_desktop_version: string;
  latest_companion_version: string;
  support_status: string;
};

type ReleaseInfo = {
  version: string;
  channel: string;
  published_at: string;
  download_label: string;
};

type ReleasePayload = {
  desktop: ReleaseInfo;
  companion: ReleaseInfo;
};

type SupportPayload = {
  status: string;
  message: string;
  updated_at: string;
};

const fallbackSummary: PortalSummary = {
  organization_count: 12,
  desktop_channel: 'stable',
  companion_channel: 'stable',
  latest_desktop_version: '0.1.0',
  latest_companion_version: '0.1.0',
  support_status: 'green',
};

const fallbackReleases: ReleasePayload = {
  desktop: {
    version: '0.1.0',
    channel: 'stable',
    published_at: '2026-04-14',
    download_label: 'Desktop installer',
  },
  companion: {
    version: '1.0.0',
    channel: 'stable',
    published_at: '2026-04-14',
    download_label: 'Expo Camera Buddy',
  },
};

const fallbackSupport: SupportPayload = {
  status: 'green',
  message: 'All platform systems are healthy.',
  updated_at: '2026-04-14T12:00:00Z',
};

export default function PortalPage() {
  const [summary, setSummary] = useState<PortalSummary>(fallbackSummary);
  const [releases, setReleases] = useState<ReleasePayload>(fallbackReleases);
  const [support, setSupport] = useState<SupportPayload>(fallbackSupport);
  const [reachable, setReachable] = useState(false);

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const [summaryResponse, releasesResponse, supportResponse] = await Promise.all([
          fetch(`${CLOUD_BACKEND_URL}/api/admin/summary`, { cache: 'no-store' }),
          fetch(`${CLOUD_BACKEND_URL}/api/admin/releases`, { cache: 'no-store' }),
          fetch(`${CLOUD_BACKEND_URL}/api/admin/support`, { cache: 'no-store' }),
        ]);
        if (!summaryResponse.ok || !releasesResponse.ok || !supportResponse.ok) {
          throw new Error('Cloud backend unavailable');
        }

        const summaryPayload = (await summaryResponse.json()) as PortalSummary;
        const releasesPayload = (await releasesResponse.json()) as ReleasePayload;
        const supportPayload = (await supportResponse.json()) as SupportPayload;
        setSummary(summaryPayload);
        setReleases(releasesPayload);
        setSupport(supportPayload);
        setReachable(true);
      } catch {
        setReachable(false);
      }
    };

    void loadSummary();
  }, []);

  return (
    <main className="shell">
      <SiteHeader />
      <section className="hero">
        <p className="eyebrow">Admin Portal</p>
        <h1>Classrooms, releases, and fleet-wide settings.</h1>
        <p>
          This hosted portal is where teachers and administrators manage SketchBot outside the live operator session.
        </p>
        <div className="pill-row">
          <div className="pill">
            <strong>Cloud backend</strong>
            {reachable ? 'Connected' : 'Using local placeholder data'}
          </div>
          <div className="pill">
            <strong>Desktop channel</strong>
            {summary.desktop_channel}
          </div>
          <div className="pill">
            <strong>Companion channel</strong>
            {summary.companion_channel}
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <p className="eyebrow">Overview</p>
          <h2>Platform status</h2>
          <div className="stat-grid">
            <div className="stat">
              <strong>Organizations</strong>
              {summary.organization_count}
            </div>
            <div className="stat">
              <strong>Support status</strong>
              {summary.support_status}
            </div>
            <div className="stat">
              <strong>Desktop version</strong>
              {summary.latest_desktop_version}
            </div>
            <div className="stat">
              <strong>Companion version</strong>
              {summary.latest_companion_version}
            </div>
            <div className="stat">
              <strong>Support message</strong>
              {support.message}
            </div>
          </div>
        </div>

        <div className="panel">
          <p className="eyebrow">What lives here</p>
          <h3>Administrative responsibilities</h3>
          <ul>
            <li>Account, team, and classroom management</li>
            <li>Saved projects, templates, and release metadata</li>
            <li>Cloud-only diagnostics and support operations</li>
            <li>Marketing site and onboarding for new customers</li>
          </ul>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <p className="eyebrow">Release channels</p>
          <h2>Current package status</h2>
          <div className="stat-grid">
            <div className="stat">
              <strong>{releases.desktop.download_label}</strong>
              {releases.desktop.version} on {releases.desktop.channel}
            </div>
            <div className="stat">
              <strong>{releases.companion.download_label}</strong>
              {releases.companion.version} on {releases.companion.channel}
            </div>
          </div>
        </div>

        <div className="panel">
          <p className="eyebrow">Support ops</p>
          <h3>Service heartbeat</h3>
          <ul>
            <li>Status: {support.status}</li>
            <li>Updated: {support.updated_at}</li>
            <li>{support.message}</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
