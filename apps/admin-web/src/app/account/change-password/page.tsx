'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

import { createClient } from '@/lib/supabase/client';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validate = () => {
    if (newPassword.length < 8) return 'Password must be at least 8 characters.';
    if (newPassword !== confirm) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (err) { setError(err.message); return; }
    setSuccess(true);
    setTimeout(() => router.push('/account'), 2000);
  };

  return (
    <>
      <SiteHeader />
      <main className="account-page">
        <div className="container" style={{ maxWidth: 480 }}>

          <div className="account-header" style={{ marginBottom: 32 }}>
            <div>
              <Link href="/account" className="account-back-link">← Back to account</Link>
              <h1 className="headline" style={{ fontSize: '1.6rem', marginTop: 8 }}>Change password</h1>
              <p className="body-md" style={{ color: 'var(--muted)', marginTop: 4 }}>
                Choose a new password for your SaySpark account.
              </p>
            </div>
          </div>

          <motion.div
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {success ? (
              <div className="account-success-state">
                <div className="account-success-icon">✓</div>
                <h2 className="headline" style={{ fontSize: '1.2rem', marginBottom: 6 }}>Password updated!</h2>
                <p className="body-md" style={{ color: 'var(--muted)' }}>Redirecting you back to your account…</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="account-form">
                <div className="account-form-group">
                  <label className="account-form-label" htmlFor="new-password">New password</label>
                  <input
                    id="new-password"
                    type="password"
                    className="account-input"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className="account-form-group">
                  <label className="account-form-label" htmlFor="confirm-password">Confirm new password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    className="account-input"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                    placeholder="Repeat your new password"
                    autoComplete="new-password"
                    required
                  />
                </div>

                {/* Strength hints */}
                {newPassword.length > 0 && (
                  <div className="account-pw-hints">
                    <span className={newPassword.length >= 8 ? 'hint-ok' : 'hint-bad'}>
                      {newPassword.length >= 8 ? '✓' : '○'} At least 8 characters
                    </span>
                    <span className={/[A-Z]/.test(newPassword) ? 'hint-ok' : 'hint-na'}>
                      {/[A-Z]/.test(newPassword) ? '✓' : '○'} Uppercase letter
                    </span>
                    <span className={/[0-9]/.test(newPassword) ? 'hint-ok' : 'hint-na'}>
                      {/[0-9]/.test(newPassword) ? '✓' : '○'} Number
                    </span>
                  </div>
                )}

                {error && <p className="account-field-error">{error}</p>}

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                  disabled={loading}
                >
                  {loading ? 'Updating…' : 'Update password'}
                </button>
              </form>
            )}
          </motion.div>

        </div>
      </main>
      <SiteFooter />
    </>
  );
}
