'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@/components/ui/button';
import { MotrixLogo } from '@/components/motrix-logo';
import {
  loadAccount,
  shouldShowQuickContinue,
  signInWithPassword,
  signUpWithPassword,
  signOutAuth,
  updateAccountLastRole,
  type AccountRole,
} from '@/lib/account-storage';
import { getStudentProgress } from '@/lib/progress-store';
import { StudentProfileAvatar } from '@/components/student-profile-avatar';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

export type AuthRole = 'teacher' | 'student' | 'guest';

export type AuthResult = {
  role: AuthRole;
  name: string;
  email?: string;
  authSource: 'account' | 'classroom_device' | 'saved_session';
};

type Phase = 'signin';
type AuthFormMode = 'signin' | 'signup';

type AuthScreenProps = {
  onAuthenticated: (result: AuthResult) => void;
  onBack?: () => void;
  authMode?: 'personal' | 'teacher';
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function mapAccountRole(r: AccountRole): AuthRole {
  return r === 'teacher' ? 'teacher' : 'student';
}

export function AuthScreen({ onAuthenticated, onBack, authMode = 'teacher' }: AuthScreenProps) {
  const [phase, setPhase] = useState<Phase>('signin');
  const [formMode, setFormMode] = useState<AuthFormMode>('signin');

  // Shared fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [accountRole, setAccountRole] = useState<AccountRole>(authMode === 'teacher' ? 'teacher' : 'student');
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Signup-only fields
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const [account, setAccount] = useState(() => loadAccount());
  const [supabaseSessionEmail, setSupabaseSessionEmail] = useState<string | null>(null);

  const showQuick = Boolean(account && shouldShowQuickContinue(account, supabaseSessionEmail));

  const savedAvatar = useMemo(() => {
    if (!account?.displayName) return null;
    const sp = getStudentProgress(account.displayName, 'explorer');
    return {
      kind: sp.profile_avatar_kind ?? 'emoji',
      emoji: sp.avatar ?? '🤖',
      robotPreset: sp.robot_preset ?? 'orbit',
      color: sp.favorite_color ?? 'var(--cyan)',
    } as const;
  }, [account?.displayName]);

  useEffect(() => {
    const a = loadAccount();
    if (a?.email) setEmail(a.email);
    setRememberMe(a?.rememberMe ?? true);
    if (a?.lastRole) setAccountRole(a.lastRole);
  }, []);

  useEffect(() => {
    const sb = getSupabaseBrowserClient();
    if (!sb) { setSupabaseSessionEmail(null); return; }
    void sb.auth.getSession().then(({ data: { session } }) => {
      setSupabaseSessionEmail(session?.user?.email?.toLowerCase() ?? null);
    });
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      setSupabaseSessionEmail(session?.user?.email?.toLowerCase() ?? null);
    });
    return () => { data.subscription.unsubscribe(); };
  }, []);

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setBusy(true);
    try {
      const { ok, error: signInError } = await signInWithPassword({
        email, password, rememberMe, lastRole: accountRole,
      });
      if (!ok) { setAuthError(signInError ?? 'Sign in failed.'); return; }
      const a = loadAccount();
      if (!a) { setAuthError('Could not save session.'); return; }
      onAuthenticated({ role: mapAccountRole(a.lastRole), name: a.displayName, email: a.email, authSource: 'account' });
    } finally {
      setBusy(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const { ok, error: signUpError, needsConfirmation: confirm } = await signUpWithPassword({
        email, password, displayName: displayName.trim() || email.split('@')[0].replace(/[0-9._-].*/, '') || 'Learner', lastRole: accountRole,
      });
      if (!ok) { setAuthError(signUpError ?? 'Sign up failed.'); return; }
      if (confirm) {
        setNeedsConfirmation(true);
        return;
      }
      const a = loadAccount();
      if (!a) { setAuthError('Could not save session.'); return; }
      onAuthenticated({ role: mapAccountRole(a.lastRole), name: a.displayName, email: a.email, authSource: 'account' });
    } finally {
      setBusy(false);
    }
  };

  const handleQuickContinue = async () => {
    if (!account || !shouldShowQuickContinue(account, supabaseSessionEmail)) return;
    const sb = getSupabaseBrowserClient();
    if (sb) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.user?.email) {
        setAuthError('Session expired — sign in again.');
        setAccount(null);
        await signOutAuth();
        return;
      }
      const meta = session.user.user_metadata as { full_name?: string; name?: string };
      const name = meta.full_name?.trim() || meta.name?.trim() || session.user.email.split('@')[0] || account.displayName;
      updateAccountLastRole(account.lastRole);
      onAuthenticated({ role: mapAccountRole(account.lastRole), name, email: session.user.email, authSource: 'account' });
      return;
    }
    updateAccountLastRole(account.lastRole);
    onAuthenticated({ role: mapAccountRole(account.lastRole), name: account.displayName, email: account.email, authSource: 'account' });
  };

  const handleUseAnotherAccount = () => {
    void (async () => {
      await signOutAuth();
      setAccount(null);
      setPassword('');
      setAuthError(null);
      setSupabaseSessionEmail(null);
    })();
  };

  const switchMode = (m: AuthFormMode) => {
    setFormMode(m);
    setAuthError(null);
    setPassword('');
    setConfirmPassword('');
    setNeedsConfirmation(false);
  };

  return (
    <div className="entry-shell">
      <div className="entry-shell-glow" aria-hidden />
      {/* Animated background orbs */}
      <div className="auth-bg-orb auth-bg-orb-a" aria-hidden />
      <div className="auth-bg-orb auth-bg-orb-b" aria-hidden />
      <div className="auth-bg-orb auth-bg-orb-c" aria-hidden />
      <div className="auth-bg-orb auth-bg-orb-d" aria-hidden />

<AnimatePresence mode="wait">
        <motion.div
          key={phase + formMode}
          className="entry-card"
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="entry-brand">
            {onBack && (
              <motion.button
                type="button"
                className="entry-back auth-back-to-plan"
                onClick={onBack}
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <ChevronLeft size={15} />
                Plans
              </motion.button>
            )}
            <MotrixLogo size={34} showWordmark={false} animate={false} />
            <div>
              <div className="entry-brand-title">AIbotics</div>
              <div className="entry-brand-sub">
                {authMode === 'personal' ? 'Personal account' : 'Teacher sign-in'}
              </div>
            </div>
          </div>

          {phase === 'signin' && (
            <>
              {/* Quick continue */}
              {showQuick && account && (
                <motion.div
                  className="entry-quick"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="entry-quick-avatar" aria-hidden>
                    {savedAvatar ? (
                      <StudentProfileAvatar
                        kind={savedAvatar.kind}
                        emoji={savedAvatar.emoji}
                        robotPresetId={savedAvatar.robotPreset}
                        accent={savedAvatar.color}
                        size={48}
                      />
                    ) : initials(account.displayName)}
                  </div>
                  <div className="entry-quick-text">
                    <div className="entry-quick-label">Welcome back</div>
                    <div className="entry-quick-name">{account.displayName}</div>
                    <div className="entry-quick-email">{account.email}</div>
                  </div>
                  <Button type="button" variant="primary" size="lg" className="entry-quick-btn" onClick={handleQuickContinue}>
                    Continue
                  </Button>
                  <button type="button" className="entry-link-btn" onClick={handleUseAnotherAccount}>
                    Use another account
                  </button>
                </motion.div>
              )}

              {!showQuick && (
                <>
                  {/* Sign-in / Sign-up toggle */}
                  <div className="auth-mode-tabs">
                    {(['signin', 'signup'] as AuthFormMode[]).map((m) => (
                      <motion.button
                        key={m}
                        type="button"
                        className={`auth-mode-tab ${formMode === m ? 'active' : ''}`}
                        onClick={() => switchMode(m)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        {m === 'signin' ? 'Sign in' : 'Create account'}
                      </motion.button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    {needsConfirmation ? (
                      <motion.div
                        key="confirm"
                        className="auth-confirm-panel"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                      >
                        <div className="auth-confirm-icon">📬</div>
                        <p className="auth-confirm-text">
                          Check your inbox — we sent a confirmation link to <strong>{email}</strong>.
                          Click it to activate your account, then sign in here.
                        </p>
                        <button type="button" className="entry-link-btn" onClick={() => { setNeedsConfirmation(false); switchMode('signin'); }}>
                          Back to sign in
                        </button>
                      </motion.div>
                    ) : formMode === 'signin' ? (
                      <motion.form
                        key="signin-form"
                        className="entry-form"
                        onSubmit={handlePasswordSignIn}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.22 }}
                      >
                        <label className="entry-label" htmlFor="auth-email">Email</label>
                        <input id="auth-email" className="entry-input" type="email" autoComplete="email"
                          value={email} onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@school.edu" required />

                        <label className="entry-label" htmlFor="auth-password">Password</label>
                        <div className="entry-input-wrap">
                          <input id="auth-password" className="entry-input" type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password" value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••" minLength={8} required />
                          <button type="button" className="entry-input-eye" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}>
                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>

                        <div className="entry-row">
                          <label className="entry-check">
                            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                            <span>Remember me on this device</span>
                          </label>
                        </div>

                        <div className="entry-role-row" role="group" aria-label="Role">
                          <button type="button" className={`entry-seg ${accountRole === 'student' ? 'active' : ''}`} onClick={() => setAccountRole('student')}>Student</button>
                          <button type="button" className={`entry-seg ${accountRole === 'teacher' ? 'active' : ''}`} onClick={() => setAccountRole('teacher')}>Educator</button>
                        </div>

                        {authError && (
                          <motion.p className="entry-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                            {authError}
                          </motion.p>
                        )}

                        <Button type="submit" variant="primary" size="lg" className="entry-submit" disabled={busy}>
                          {busy ? <><Loader2 size={14} className="entry-spinner" /> Signing in…</> : 'Sign in'}
                        </Button>
                      </motion.form>
                    ) : (
                      <motion.form
                        key="signup-form"
                        className="entry-form"
                        onSubmit={handleSignUp}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.22 }}
                      >
                        <label className="entry-label" htmlFor="signup-name">Your name</label>
                        <input id="signup-name" className="entry-input" type="text" autoComplete="name"
                          value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Alex Johnson" />

                        <label className="entry-label" htmlFor="signup-email">Email</label>
                        <input id="signup-email" className="entry-input" type="email" autoComplete="email"
                          value={email} onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@school.edu" required />

                        <label className="entry-label" htmlFor="signup-password">Password</label>
                        <div className="entry-input-wrap">
                          <input id="signup-password" className="entry-input" type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password" value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="At least 8 characters" minLength={8} required />
                          <button type="button" className="entry-input-eye" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}>
                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>

                        <label className="entry-label" htmlFor="signup-confirm">Confirm password</label>
                        <input id="signup-confirm" className="entry-input" type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password" value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repeat password" required />

                        <div className="entry-role-row" role="group" aria-label="Role">
                          <button type="button" className={`entry-seg ${accountRole === 'student' ? 'active' : ''}`} onClick={() => setAccountRole('student')}>Student</button>
                          <button type="button" className={`entry-seg ${accountRole === 'teacher' ? 'active' : ''}`} onClick={() => setAccountRole('teacher')}>Educator</button>
                        </div>

                        {authError && (
                          <motion.p className="entry-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                            {authError}
                          </motion.p>
                        )}

                        <Button type="submit" variant="primary" size="lg" className="entry-submit" disabled={busy}>
                          {busy ? <><Loader2 size={14} className="entry-spinner" /> Creating account…</> : 'Create account'}
                        </Button>

                        <p className="entry-hint" style={{ textAlign: 'center', marginTop: 4 }}>
                          By signing up you agree to use this platform for educational purposes.
                        </p>
                      </motion.form>
                    )}
                  </AnimatePresence>

                </>
              )}
            </>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
