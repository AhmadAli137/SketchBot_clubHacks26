'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

import { CLERK_ENABLED } from '@/lib/config';

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.nav
      className={`nav${scrolled ? ' scrolled' : ''}`}
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="nav-inner">
        {/* Logo */}
        <Link href="/" className="nav-logo">
          <div className="nav-logo-mark">SB</div>
          <span>SketchBot</span>
        </Link>

        {/* Links */}
        <nav className="nav-links">
          <Link href="/" className="nav-link">Overview</Link>
          <Link href="/pricing" className="nav-link">Pricing</Link>
          <Link href="/portal" className="nav-link">Portal</Link>
        </nav>

        {/* CTA */}
        <div className="nav-cta">
          {CLERK_ENABLED ? (
            <>
              <Link href="/sign-in" className="btn btn-ghost btn-sm">Sign in</Link>
              <Link href="/sign-up" className="btn btn-primary btn-sm">Get started</Link>
            </>
          ) : (
            <Link href="/portal" className="btn btn-outline btn-sm">Open portal</Link>
          )}
        </div>
      </div>
    </motion.nav>
  );
}
