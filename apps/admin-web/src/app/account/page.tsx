import { redirect } from 'next/navigation';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';
import { CLOUD_API_URL } from '@/lib/config';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { DangerZone } from './account-client';
import { EditProfileClient } from './edit-profile-client';
import { UpgradeBanner } from './upgrade-banner';

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

const TIER_COLOR: Record<string, string> = {
  free:      'var(--blue-2)',
  home:      'var(--cyan)',
  classroom: 'var(--green)',
  school:    'var(--purple)',
  district:  'var(--amber)',
};

function avatarInitials(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email || '?';
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source[0].toUpperCase();
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const upgraded = params.upgraded === '1';
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user || error) redirect('/sign-in');

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const fullName = (user.user_metadata?.full_name as string | undefined)?.trim() ?? '';
  const displayName = fullName || user.email || '';
  const initials = avatarInitials(fullName || undefined, user.email ?? undefined);
  const memberSince = new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const provider = user.app_metadata?.provider as string | undefined;

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

  let summary: Record<string, unknown> = {};
  try {
    const res = await fetch(`${CLOUD_API_URL}/api/admin/summary`, { next: { revalidate: 60 } });
    if (res.ok) summary = await res.json();
  } catch { /* offline */ }

  const tierLabel = TIER_LABELS[entitlements.tier] ?? entitlements.tier;
  const tierColor = TIER_COLOR[entitlements.tier] ?? 'var(--blue-2)';
  const nextPlan = TIER_NEXT[entitlements.tier];
  const usagePct = Math.min(100, (entitlements.credits_used / Math.max(1, entitlements.monthly_credits)) * 100);
  const isLow = entitlements.credits_remaining < entitlements.monthly_credits * 0.15 && entitlements.credits_remaining > 0;
  const isDepleted = entitlements.credits_remaining <= 0;

  const desktopVersion = String(summary?.desktop_version ?? '1.0.0');
  const desktopDownloadUrl = summary?.desktop_download_url ? String(summary.desktop_download_url) : null;

  return (
    <>
      <SiteHeader />
      <main className="account-page">
        <div className="container">
          <UpgradeBanner show={upgraded} />

          {/* ── Hero header ─────────────────────────────────────────── */}
          <div className="account-header">
            <div className="account-avatar">{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="account-email">{displayName}</p>
              {fullName && <p className="account-since" style={{ marginBottom: 2 }}>{user.email}</p>}
              <p className="account-since">Member since {memberSince}</p>
            </div>
            <div
              className="account-plan-badge"
              style={{ color: tierColor, borderColor: `color-mix(in srgb, ${tierColor} 40%, transparent)`, background: `color-mix(in srgb, ${tierColor} 10%, transparent)` }}
            >
              {tierLabel}
            </div>
          </div>

          {/* ── Grid ─────────────────────────────────────────────────── */}
          <div className="account-grid">

            {/* Plan card */}
            <div className="card account-card">
              <p className="eyebrow">Current plan</p>
              <div
                className="account-plan-badge"
                style={{ color: tierColor, borderColor: `color-mix(in srgb, ${tierColor} 40%, transparent)`, background: `color-mix(in srgb, ${tierColor} 10%, transparent)`, marginBottom: 14 }}
              >
                {tierLabel}
              </div>
              {entitlements.period_end && (
                <p className="body-md" style={{ color: 'var(--muted)', marginBottom: 4, fontSize: '0.82rem' }}>
                  Renews {new Date(entitlements.period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              )}
              <p className="body-md" style={{ color: 'var(--muted)', marginBottom: 20, fontSize: '0.85rem' }}>
                {entitlements.monthly_credits.toLocaleString()} AI credits / month
                {entitlements.can_connect_robot ? ' · Real robot support' : ' · Simulator only'}
              </p>
              {nextPlan ? (
                <Link href={`/pricing#${nextPlan}`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  Upgrade plan →
                </Link>
              ) : (
                <p className="body-md" style={{ color: 'var(--muted)', fontStyle: 'italic' }}>You&apos;re on our top tier — thank you!</p>
              )}
            </div>

            {/* Usage card */}
            <div className="card account-card">
              <p className="eyebrow">This month</p>
              <div className="account-usage-row" style={{ marginBottom: 8 }}>
                <span className="account-usage-label">AI credits used</span>
                <span className="account-usage-val" style={{ color: isDepleted ? '#ef4444' : isLow ? '#f59e0b' : undefined }}>
                  {entitlements.credits_used.toLocaleString()}
                  <span style={{ color: 'var(--muted)', fontWeight: 400 }}> / {entitlements.monthly_credits.toLocaleString()}</span>
                </span>
              </div>
              <div className="account-usage-bar-track">
                <div
                  className="account-usage-bar"
                  style={{
                    width: `${usagePct}%`,
                    background: isDepleted ? '#ef4444' : isLow ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : undefined,
                  }}
                />
              </div>
              {isDepleted && (
                <p style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: 8 }}>
                  Credits depleted — {nextPlan ? <Link href="/pricing" style={{ color: '#ef4444' }}>upgrade to get more →</Link> : 'resets on the 1st'}
                </p>
              )}
              {isLow && !isDepleted && (
                <p style={{ fontSize: '0.8rem', color: '#f59e0b', marginTop: 8 }}>
                  Running low — {entitlements.credits_remaining} credits remaining
                </p>
              )}
              {!isDepleted && !isLow && (
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 8 }}>
                  {entitlements.credits_remaining.toLocaleString()} credits remaining this month
                </p>
              )}
              <div className="account-usage-row" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <span className="account-usage-label">Robot support</span>
                <span className="account-usage-val" style={{ fontSize: '0.85rem' }}>
                  {entitlements.can_connect_robot
                    ? <span style={{ color: 'var(--green)' }}>✓ Enabled</span>
                    : <Link href="/pricing" style={{ color: 'var(--blue-2)', fontSize: '0.82rem' }}>Upgrade to unlock →</Link>
                  }
                </span>
              </div>
            </div>

            {/* Profile card */}
            <div className="card account-card">
              <p className="eyebrow">Profile</p>
              <EditProfileClient initialName={fullName} />
              <div className="account-usage-row" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <span className="account-usage-label">Email</span>
                <span className="account-usage-val" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{user.email}</span>
              </div>
              <div className="account-usage-row" style={{ marginTop: 10 }}>
                <span className="account-usage-label">Sign-in method</span>
                <span className="account-usage-val" style={{ fontSize: '0.85rem', textTransform: 'capitalize', color: 'var(--muted)' }}>
                  {provider === 'email' ? 'Email & password' : provider ?? 'Email'}
                </span>
              </div>
            </div>

            {/* Security card */}
            <div className="card account-card">
              <p className="eyebrow">Security</p>
              <div className="account-security-row">
                <span style={{ color: 'var(--green)' }}>✓</span>
                <span className="body-md">Email verified</span>
              </div>
              {provider === 'email' || !provider ? (
                <div className="account-security-row">
                  <span>🔒</span>
                  <span className="body-md">Password authentication</span>
                </div>
              ) : (
                <div className="account-security-row">
                  <span>🔗</span>
                  <span className="body-md" style={{ textTransform: 'capitalize' }}>{provider} OAuth</span>
                </div>
              )}
              {(!provider || provider === 'email') && (
                <Link href="/account/change-password" className="btn btn-outline btn-sm" style={{ marginTop: 20 }}>
                  Change password →
                </Link>
              )}
            </div>

            {/* Downloads card — full width */}
            <div className="card account-card" style={{ gridColumn: '1 / -1' }}>
              <p className="eyebrow">Downloads</p>
              <h3 className="headline" style={{ marginBottom: 16, fontSize: '1.05rem' }}>Get the apps</h3>
              <div className="account-downloads" style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {desktopDownloadUrl ? (
                  <a href={desktopDownloadUrl} className="account-download-btn" style={{ flex: 1, minWidth: 200 }}>
                    <span>🖥</span>
                    <div>
                      <div className="account-dl-label">Desktop App</div>
                      <div className="account-dl-sub">Windows · v{desktopVersion}</div>
                    </div>
                  </a>
                ) : (
                  <div className="account-download-btn" style={{ flex: 1, minWidth: 200, opacity: 0.55, cursor: 'default' }} title="Download link coming soon">
                    <span>🖥</span>
                    <div>
                      <div className="account-dl-label">Desktop App</div>
                      <div className="account-dl-sub">Windows · v{desktopVersion} · Coming soon</div>
                    </div>
                  </div>
                )}
                <div className="account-download-btn" style={{ flex: 1, minWidth: 200, opacity: 0.55, cursor: 'default' }} title="Coming soon">
                  <span>📱</span>
                  <div>
                    <div className="account-dl-label">Camera Buddy</div>
                    <div className="account-dl-sub">iOS & Android · Coming soon</div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* ── Danger zone ──────────────────────────────────────────── */}
          <DangerZone />

        </div>
      </main>
      <SiteFooter />
    </>
  );
}
