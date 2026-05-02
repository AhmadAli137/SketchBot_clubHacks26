'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';

import { createClient } from '@/lib/supabase/client';
import { SaySparkLogo } from '@/components/sayspark-logo';

export default function SignUpPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
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
          <SaySparkLogo size={42} />
          <span className="auth-logo-name">SaySpark</span>
        </Link>

        {success ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>📬</div>
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-subtitle" style={{ marginTop: 8 }}>
              We sent a confirmation link to <strong style={{ color: 'var(--text)' }}>{email}</strong>.
              Click it to activate your account.
            </p>
            <Link href="/sign-in" className="auth-submit" style={{ marginTop: 32, display: 'flex', textDecoration: 'none' }}>
              Back to sign in
            </Link>
          </motion.div>
        ) : (
          <>
            <h1 className="auth-title">Create your account</h1>
            <p className="auth-subtitle">Start your SaySpark journey — free forever on Explorer</p>

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
                <label htmlFor="password" className="auth-label">Password <span className="auth-label-hint">(min 8 chars)</span></label>
                <input id="password" type="password" autoComplete="new-password" required className="auth-input"
                  placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>

              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? <span className="auth-spinner" /> : 'Create account →'}
              </button>
            </form>

            <p className="auth-terms">
              By signing up you agree to our{' '}
              <Link href="/terms" className="auth-link-sm">Terms</Link> and{' '}
              <Link href="/privacy" className="auth-link-sm">Privacy Policy</Link>.
            </p>

            <p className="auth-footer-text">
              Already have an account?{' '}
              <Link href="/sign-in" className="auth-link">Sign in</Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
