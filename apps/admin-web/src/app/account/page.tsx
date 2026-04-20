import { redirect } from 'next/navigation';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';
import { CLOUD_API_URL } from '@/lib/config';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { AccountClient } from './account-client';

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/sign-in');

  // Fetch platform summary for the portal strip
  let summary: Record<string, unknown> = {};
  try {
    const res = await fetch(`${CLOUD_API_URL}/api/admin/summary`, { next: { revalidate: 60 } });
    if (res.ok) summary = await res.json();
  } catch { /* offline — use empty summary */ }

  return (
    <>
      <SiteHeader />
      <main className="account-page">
        <div className="container">

          {/* Header strip */}
          <div className="account-header">
            <div className="account-avatar">
              {(user.email?.[0] ?? 'A').toUpperCase()}
            </div>
            <div>
              <p className="account-email">{user.email}</p>
              <p className="account-since">
                Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Grid */}
          <div className="account-grid">

            {/* Plan card */}
            <div className="card account-card">
              <p className="eyebrow">Current plan</p>
              <div className="account-plan-badge">Explorer</div>
              <p className="body-md" style={{ color: 'var(--muted)', marginTop: 8, marginBottom: 20 }}>
                Free forever — 1 robot, 5 AI credits / month, access to all 3 age groups.
              </p>
              <Link href="/pricing" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                Upgrade plan →
              </Link>
            </div>

            {/* Downloads card */}
            <div className="card account-card">
              <p className="eyebrow">Downloads</p>
              <h3 className="headline" style={{ marginBottom: 16, fontSize: '1.1rem' }}>Get the apps</h3>
              <div className="account-downloads">
                <a href="#" className="account-download-btn">
                  <span>🖥</span>
                  <div>
                    <div className="account-dl-label">Desktop App</div>
                    <div className="account-dl-sub">Windows · v{String(summary?.desktop_version ?? '1.0.0')}</div>
                  </div>
                </a>
                <a href="#" className="account-download-btn">
                  <span>📱</span>
                  <div>
                    <div className="account-dl-label">Camera Buddy</div>
                    <div className="account-dl-sub">iOS & Android</div>
                  </div>
                </a>
              </div>
            </div>

            {/* Usage card */}
            <div className="card account-card">
              <p className="eyebrow">This month</p>
              <h3 className="headline" style={{ marginBottom: 20, fontSize: '1.1rem' }}>Usage</h3>
              <div className="account-usage-row">
                <span className="account-usage-label">AI credits used</span>
                <span className="account-usage-val">0 <span style={{ color: 'var(--muted)' }}>/ 5</span></span>
              </div>
              <div className="account-usage-bar-track">
                <div className="account-usage-bar" style={{ width: '0%' }} />
              </div>
              <div className="account-usage-row" style={{ marginTop: 16 }}>
                <span className="account-usage-label">Robots connected</span>
                <span className="account-usage-val">0 <span style={{ color: 'var(--muted)' }}>/ 1</span></span>
              </div>
            </div>

            {/* Security card */}
            <div className="card account-card">
              <p className="eyebrow">Security</p>
              <h3 className="headline" style={{ marginBottom: 16, fontSize: '1.1rem' }}>Account security</h3>
              <div className="account-security-row">
                <span>✅</span>
                <span className="body-md">Email verified</span>
              </div>
              <div className="account-security-row">
                <span>🔒</span>
                <span className="body-md">Password authentication</span>
              </div>
              <Link href="/account/change-password" className="btn btn-outline btn-sm" style={{ marginTop: 20 }}>
                Change password
              </Link>
            </div>

          </div>

          {/* Sign out — client component */}
          <AccountClient />

        </div>
      </main>
      <SiteFooter />
    </>
  );
}
