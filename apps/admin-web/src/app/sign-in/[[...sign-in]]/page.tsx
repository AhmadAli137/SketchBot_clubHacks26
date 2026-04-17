import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';

import { CLERK_ENABLED } from '@/lib/config';
import { SiteHeader } from '@/components/site-header';

export default function SignInPage() {
  return (
    <>
      <SiteHeader />
      <main className="auth-shell">
        {CLERK_ENABLED ? (
          <SignIn />
        ) : (
          <div className="auth-card">
            <p className="eyebrow" style={{ marginBottom: 16 }}>Authentication</p>
            <h2 className="headline" style={{ marginBottom: 12 }}>Clerk not configured</h2>
            <p className="body-md" style={{ marginBottom: 24 }}>
              Add your Clerk keys to <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 6, fontSize: '0.875rem' }}>.env</code> to enable hosted sign-in.
            </p>
            <Link href="/portal" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Go to portal →
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
