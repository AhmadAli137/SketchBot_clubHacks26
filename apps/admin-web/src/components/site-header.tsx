import Link from 'next/link';

import { CLERK_ENABLED } from '@/lib/config';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-brand">
        <div className="site-logo">SB</div>
        <div>
          <p className="site-kicker">SketchBot Platform</p>
          <strong>Desktop robotics with cloud administration</strong>
        </div>
      </div>
      <nav className="site-nav">
        <Link href="/">Overview</Link>
        <Link href="/portal">Portal</Link>
        {CLERK_ENABLED ? (
          <>
            <Link href="/sign-in">Sign in</Link>
            <Link href="/sign-up">Create account</Link>
          </>
        ) : (
          <span className="site-nav-note">Auth setup pending</span>
        )}
      </nav>
    </header>
  );
}
