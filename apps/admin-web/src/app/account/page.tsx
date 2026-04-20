import { redirect } from 'next/navigation';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';
import { CLOUD_API_URL } from '@/lib/config';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { AccountClient } from './account-client';

type Entitlements = {
  tier: string;
  monthly_credits: number;
  credits_used: number;
  credits_remaining: number;
  status: string;
  period_end: string | null;
  can_connect_robot: boolean;
  can_use_ai: boolean;
};

const TIER_LABELS: Record<string, string> = {
  free:      'Explorer (Free)',
  home:      'Home',
  classroom: 'Classroom',
  school:    'School',
  district:  'District',
};

const TIER_NEXT: Record<string, string> = {
  free:      'home',
  home:      'classroom',
  classroom: 'school',
  school:    'district',
};

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user || error) redirect('/sign-in');

  // Fetch session token to call the cloud backend on behalf of the user
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  // Fetch entitlements from cloud backend
  let entitlements: Entitlements = {
    tier: 'free',
    monthly_credits: 50,
    credits_used: 0,
    credits_remaining: 50,
    status: 'active',
    period_end: null,
    can_connect_robot: false,
    can_use_ai: true,
  };

  if (token) {
    try {
      const res = await fetch(`${CLOUD_API_URL}/api/subscriptions/entitlements`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        next: { revalidate: 0 },
      });
      if (res.ok) entitlements = await res.json();
    } catch { /* offline — use free defaults */ }
  }

  // Fetch platform summary for downloads strip
  let summary: Record<string, unknown> = {};
  try {
    const res = await fetch(`${CLOUD_API_URL}/api/admin/summary`, { next: { revalidate: 60 } });
    if (res.ok) summary = await res.json();
  } catch { /* offline */ }

  const tierLabel = TIER_LABELS[entitlements.tier] ?? entitlements.tier;
  const nextPlan = TIER_NEXT[entitlements.tier];
  const usagePct = Math.min(100, (entitlements.credits_used / Math.max(1, entitlements.monthly_credits)) * 100);
  const isLow = entitlements.credits_remaining < entitlements.monthly_credits * 0.15 && entitlements.credits_remaining > 0;
  const isDepleted = entitlements.credits_remaining <= 0;

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
              <div className="account-plan-badge">{tierLabel}</div>
              {entitlements.period_end && (
                <p className="body-md" style={{ color: 'var(--muted)', marginTop: 6, fontSize: '0.82rem' }}>
                  Renews {new Date(entitlements.period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              )}
              <p className="body-md" style={{ color: 'var(--muted)', marginTop: 8, marginBottom: 20 }}>
                {entitlements.monthly_credits.toLocaleString()} AI credits / month
                {entitlements.can_connect_robot ? ' · Real robot support' : ' · Simulator only'}
              </p>
              {nextPlan ? (
                <Link href={`/pricing#${nextPlan}`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  Upgrade plan →
                </Link>
              ) : (
                <p className="body-md" style={{ color: 'var(--muted)', fontStyle: 'italic' }}>You&apos;re on our top tier.</p>
              )}
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
                <span className="account-usage-val" style={{ color: isDepleted ? '#ef4444' : isLow ? '#f59e0b' : undefined }}>
                  {entitlements.credits_used.toLocaleString()}{' '}
                  <span style={{ color: 'var(--muted)' }}>/ {entitlements.monthly_credits.toLocaleString()}</span>
                </span>
              </div>
              <div className="account-usage-bar-track">
                <div
                  className="account-usage-bar"
                  style={{
                    width: `${usagePct}%`,
                    background: isDepleted ? '#ef4444' : isLow ? '#f59e0b' : undefined,
                  }}
                />
              </div>
              {isDepleted && (
                <p style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: 8 }}>
                  Credits depleted — {nextPlan ? <Link href="/pricing" style={{ color: '#ef4444' }}>upgrade to get more</Link> : 'resets on the 1st'}
                </p>
              )}
              {isLow && !isDepleted && (
                <p style={{ fontSize: '0.8rem', color: '#f59e0b', marginTop: 8 }}>
                  Running low — {entitlements.credits_remaining} credits remaining
                </p>
              )}
              <div className="account-usage-row" style={{ marginTop: 16 }}>
                <span className="account-usage-label">Robot support</span>
                <span className="account-usage-val">
                  {entitlements.can_connect_robot ? '✅ Enabled' : '🔒 Upgrade required'}
                </span>
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
