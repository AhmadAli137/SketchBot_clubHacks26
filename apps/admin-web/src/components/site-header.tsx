'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
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
          <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
            <rect x="1" y="1" width="38" height="38" rx="10" fill="url(#ah-bg)" stroke="url(#ah-bd)" strokeWidth="0.5"/>
            <path d="M10 31 C10 22 14 13 20 8" stroke="url(#ah-l)" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
            <path d="M30 31 C30 22 26 13 20 8" stroke="url(#ah-r)" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
            <line x1="13.8" y1="21.5" x2="26.2" y2="21.5" stroke="#5de4ff" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2.8 1.8" opacity="0.82"/>
            <circle cx="13.8" cy="21.5" r="2" fill="#6366f1"/>
            <circle cx="26.2" cy="21.5" r="2" fill="#5de4ff"/>
            <circle cx="20" cy="8" r="3.4" fill="url(#ah-core)"/>
            <circle cx="20" cy="8" r="1.45" fill="white" opacity="0.92"/>
            <circle cx="14.5" cy="29.5" r="1.9" fill="#6366f1" opacity="0.85"/>
            <circle cx="25.5" cy="29.5" r="1.9" fill="#6366f1" opacity="0.85"/>
            <defs>
              <linearGradient id="ah-bg" x1="1" y1="1" x2="39" y2="39" gradientUnits="userSpaceOnUse"><stop stopColor="#040c1e"/><stop offset="1" stopColor="#07122a"/></linearGradient>
              <linearGradient id="ah-bd" x1="1" y1="1" x2="39" y2="39" gradientUnits="userSpaceOnUse"><stop stopColor="#6366f1" stopOpacity="0.65"/><stop offset="1" stopColor="#5de4ff" stopOpacity="0.3"/></linearGradient>
              <linearGradient id="ah-l" x1="10" y1="31" x2="20" y2="8" gradientUnits="userSpaceOnUse"><stop stopColor="#6366f1"/><stop offset="1" stopColor="#5de4ff"/></linearGradient>
              <linearGradient id="ah-r" x1="30" y1="31" x2="20" y2="8" gradientUnits="userSpaceOnUse"><stop stopColor="#8b5cf6"/><stop offset="1" stopColor="#5de4ff"/></linearGradient>
              <radialGradient id="ah-core" cx="40%" cy="35%" r="60%"><stop offset="0%" stopColor="#a8f4ff"/><stop offset="100%" stopColor="#5de4ff"/></radialGradient>
            </defs>
          </svg>
          <span>Aibotics</span>
        </Link>

        {/* Links */}
        <nav className="nav-links">
          <Link href="/" className="nav-link">Overview</Link>
          <Link href="/pricing" className="nav-link">Pricing</Link>
          <Link href="/dashboard" className="nav-link">Dashboard</Link>
        </nav>

        {/* CTA */}
        <div className="nav-cta">
          {user ? (
            <>
              <span className="nav-user-email">{user.email}</span>
              <Link href="/account" className="btn btn-outline btn-sm">My account</Link>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="btn btn-ghost btn-sm">Sign in</Link>
              <Link href="/sign-up" className="btn btn-primary btn-sm">Get started</Link>
            </>
          )}
        </div>
      </div>
    </motion.nav>
  );
}
