'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function AccountClient() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <div style={{ marginTop: 40, paddingTop: 32, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
      <button onClick={handleSignOut} className="btn btn-ghost" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        Sign out
      </button>
    </div>
  );
}
