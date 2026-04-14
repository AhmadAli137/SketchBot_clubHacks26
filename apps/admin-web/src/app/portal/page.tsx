'use client';

import { useEffect, useState } from 'react';

import { CLOUD_BACKEND_URL } from '@/lib/config';

type PortalSummary = {
  organization_count: number;
  desktop_channel: string;
  companion_channel: string;
  latest_desktop_version: string;
  latest_companion_version: string;
  support_status: string;
};

const fallbackSummary: PortalSummary = {
  organization_count: 12,
  desktop_channel: 'stable',
  companion_channel: 'stable',
  latest_desktop_version: '0.1.0',
  latest_companion_version: '0.1.0',
  support_status: 'green',
};

export default function PortalPage() {
  const [summary, setSummary] = useState<PortalSummary>(fallbackSummary);
  const [reachable, setReachable] = useState(false);

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const response = await fetch(`${CLOUD_BACKEND_URL}/api/admin/summary`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Cloud backend unavailable');
        }
        const payload = (await response.json()) as PortalSummary;
        setSummary(payload);
        setReachable(true);
      } catch {
        setReachable(false);
      }
    };

    void loadSummary();
  }, []);

  return (
    <main className="shell">
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
    </main>
  );
}
