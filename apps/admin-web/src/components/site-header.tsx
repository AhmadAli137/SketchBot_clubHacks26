'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';
import { SaySparkLogo } from '@/components/sayspark-logo';

function userInitial(user: User): string {
  const name = user.user_metadata?.full_name as string | undefined;
  if (name?.trim()) return name.trim()[0];
  return (user.email?.[0] ?? '?');
}

function userDisplayName(user: User): string {
  return (user.user_metadata?.full_name as string | undefined)?.trim() || user.email || '';
}

const NAV_LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/#spark', label: 'AI Tutor' },
  { href: '/#apps', label: 'Apps' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/download', label: 'Download' },
  { href: '/dashboard', label: 'Dashboard' },
];

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setMenuOpen(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Close account dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Lock body scroll when mobile nav is open
  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileNavOpen]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <>
      <motion.nav
        className={`nav${scrolled ? ' scrolled' : ''}`}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="nav-inner">
          {/* Logo */}
          <Link href="/" className="nav-logo">
            <SaySparkLogo size={38} />
          </Link>

          {/* Desktop links */}
          <nav className="nav-links">
            {NAV_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className="nav-link">{label}</Link>
            ))}
          </nav>

          {/* Desktop CTA + mobile hamburger */}
          <div className="nav-cta">
            {user ? (
              <div className="nav-user-wrap" ref={menuRef}>
                <button
                  type="button"
                  className="nav-avatar-btn"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  aria-label="Account menu"
                >
                  <div className="nav-avatar">{userInitial(user)}</div>
                  <span className="nav-avatar-email">{user.email}</span>
                  <svg
                    className={`nav-avatar-chevron-svg${menuOpen ? ' open' : ''}`}
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    aria-hidden="true"
                  >
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      className="nav-user-dropdown"
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.97 }}
                      transition={{ duration: 0.14, ease: 'easeOut' }}
                    >
                      <div className="nav-dropdown-info">
                        <div className="nav-dropdown-name">{userDisplayName(user)}</div>
                        {user.user_metadata?.full_name && (
                          <div className="nav-dropdown-email">{user.email}</div>
                        )}
                      </div>
                      <Link href="/account" className="nav-dropdown-item" onClick={() => setMenuOpen(false)}>
                        My account
                      </Link>
                      <Link href="/dashboard" className="nav-dropdown-item" onClick={() => setMenuOpen(false)}>
                        Dashboard
                      </Link>
                      <button type="button" className="nav-dropdown-item danger" onClick={handleSignOut}>
                        Sign out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="nav-auth-btns">
                <Link href="/sign-in" className="btn btn-ghost btn-sm">Sign in</Link>
                <Link href="/sign-up" className="btn btn-primary btn-sm">Get started</Link>
              </div>
            )}

            {/* Hamburger — mobile only */}
            <button
              type="button"
              className={`nav-hamburger${mobileNavOpen ? ' open' : ''}`}
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileNavOpen}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile nav drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              className="nav-mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.div
              className="nav-mobile-drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            >
              <div className="nav-mobile-header">
                <Link href="/" className="nav-logo" onClick={() => setMobileNavOpen(false)}>
                  <SaySparkLogo size={34} animate={false} />
                </Link>
                <button
                  type="button"
                  className="nav-mobile-close"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close menu"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              <nav className="nav-mobile-links">
                {NAV_LINKS.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="nav-mobile-link"
                    onClick={() => setMobileNavOpen(false)}
                  >
                    {label}
                  </Link>
                ))}
              </nav>

              <div className="nav-mobile-footer">
                {user ? (
                  <>
                    <Link href="/account" className="btn btn-ghost" onClick={() => setMobileNavOpen(false)}>My account</Link>
                    <button type="button" className="btn btn-ghost" onClick={() => { setMobileNavOpen(false); void handleSignOut(); }}>Sign out</button>
                  </>
                ) : (
                  <>
                    <Link href="/sign-in" className="btn btn-ghost" onClick={() => setMobileNavOpen(false)}>Sign in</Link>
                    <Link href="/sign-up" className="btn btn-primary" onClick={() => setMobileNavOpen(false)}>Get started</Link>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
