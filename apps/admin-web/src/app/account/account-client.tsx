'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { CLOUD_API_URL } from '@/lib/config';

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/sign-in'; return; }
      const res = await fetch(`${CLOUD_API_URL}/api/subscriptions/portal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError((data as { detail?: string }).detail ?? 'Could not open portal.'); return; }
      window.location.href = (data as { url: string }).url;
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={handleClick}
        disabled={loading}
      >
        {loading && <Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} />}
        {loading ? 'Opening…' : 'Manage subscription →'}
      </button>
      {error && <p style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: 6 }}>{error}</p>}
    </div>
  );
}

export function DangerZone() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <div className="account-danger-zone">
      <p className="eyebrow" style={{ color: '#ef4444', marginBottom: 12 }}>Danger zone</p>
      <div className="account-danger-row">
        <div>
          <div className="account-danger-label">Sign out everywhere</div>
          <div className="account-danger-desc">Ends your current session on this device.</div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} onClick={handleSignOut}>
          Sign out
        </button>
      </div>
      <div className="account-danger-row">
        <div>
          <div className="account-danger-label">Delete account</div>
          <div className="account-danger-desc">Permanently removes all your data. This cannot be undone.</div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--muted)', cursor: 'not-allowed', opacity: 0.5 }} disabled title="Contact support to delete your account">
          Delete
        </button>
      </div>
    </div>
  );
}
