'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { motion } from 'framer-motion';

import { createClient } from '@/lib/supabase/client';
import { AiboticsLogo } from '@/components/aibotics-logo';

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/account';
  const urlError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(urlError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" />

      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <Link href="/" className="auth-logo-link">
          <AiboticsLogo size={42} />
          <span className="auth-logo-name">Aibotics</span>
        </Link>

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your Aibotics account</p>

        {error && (
          <motion.div className="auth-error" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="email" className="auth-label">Email</label>
            <input id="email" type="email" autoComplete="email" required className="auth-input"
              placeholder="you@school.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="password" className="auth-label">Password</label>
              <Link href="/forgot-password" className="auth-link-sm">Forgot password?</Link>
            </div>
            <input id="password" type="password" autoComplete="current-password" required className="auth-input"
              placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? <span className="auth-spinner" /> : 'Sign in →'}
          </button>
        </form>

        <p className="auth-footer-text">
          No account yet?{' '}
          <Link href="/sign-up" className="auth-link">Get started free</Link>
        </p>
      </motion.div>
    </div>
  );
}

export default function SignInPage() {
  return <Suspense><SignInForm /></Suspense>;
}
