'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
