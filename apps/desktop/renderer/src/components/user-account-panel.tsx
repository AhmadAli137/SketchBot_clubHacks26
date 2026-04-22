'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';
import { LogOut, X, Trophy, Zap, Flame, BookOpen, ExternalLink } from 'lucide-react';
import type { AuthRole } from '@/components/auth-screen';
import { getProgressSummary } from '@/lib/progress-store';
import { useEntitlements, tierLabel } from '@/lib/use-entitlements';

const PRICING_URL = 'https://aibotics.app/pricing';

type Props = {
  role: AuthRole;
  name: string;
  email?: string;
  onSignOut: () => void;
  onClose: () => void;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserAccountPanel({ role, name, email, onSignOut, onClose }: Props) {
  const progress = useMemo(() => {
    if (role !== 'student' || !name) return null;
    return getProgressSummary(name);
  }, [role, name]);

  const { entitlements } = useEntitlements(role !== 'guest');

  const xpPct = progress ? Math.round(progress.progress * 100) : 0;
  const credPct = entitlements
    ? Math.min(100, Math.round((entitlements.credits_used / Math.max(1, entitlements.monthly_credits)) * 100))
    : 0;
  const isFree = entitlements?.tier === 'free';
  const outOfCredits = entitlements ? entitlements.credits_remaining <= 0 : false;
  const lowCredits = !outOfCredits && entitlements ? entitlements.credits_remaining <= 10 : false;

  return (
    <>
      <motion.div
        className="account-panel-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        className="account-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 40 }}
      >
        <button type="button" className="account-panel-close" onClick={onClose} title="Close">
          <X size={18} />
        </button>

        {/* Identity */}
        <div className="account-panel-header">
          <div className="account-panel-avatar">{initials(name)}</div>
          <div className="account-panel-name">{name}</div>
          {email && <div className="account-panel-email">{email}</div>}
          <div className="account-panel-badges">
            <span className="account-panel-role-badge">
              {role === 'teacher' ? 'Teacher' : 'Student'}
            </span>
            {entitlements && (
              <span className={`account-panel-tier-badge${isFree ? ' is-free' : ''}`}>
                {isFree ? 'Trial' : tierLabel(entitlements.tier)}
              </span>
            )}
          </div>
        </div>

        {/* Progress stats — students only */}
        {progress && (
          <>
            <div className="account-panel-stats">
              {[
                { icon: <Zap size={13} />, value: `${progress.levelEmoji} Lv.${progress.level}`, label: progress.levelName },
                { icon: <Trophy size={13} />, value: String(progress.xp), label: 'Total XP' },
                { icon: <Flame size={13} />, value: String(progress.streak.current_streak_days), label: 'Day streak' },
                { icon: <BookOpen size={13} />, value: String(progress.conceptsMastered), label: 'Mastered' },
              ].map(({ icon, value, label }) => (
                <div key={label} className="account-stat">
                  <div className="account-stat-icon">{icon}</div>
                  <div className="account-stat-value">{value}</div>
                  <div className="account-stat-label">{label}</div>
                </div>
              ))}
            </div>
            <div className="account-xp-wrap">
              <div className="account-xp-labels">
                <span>{progress.xp} XP</span>
                <span>{progress.nextXP} XP</span>
              </div>
              <div className="account-xp-track">
                <motion.div
                  className="account-xp-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${xpPct}%` }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                />
              </div>
            </div>
          </>
        )}

        {/* Subscription / credits */}
        {entitlements && (
          <div className={`account-credits-card${outOfCredits ? ' is-exhausted' : lowCredits ? ' is-low' : ''}`}>
            <div className="account-credits-header">
              <span className="account-credits-label">AI Credits</span>
              <span className="account-credits-count">
                <span className={outOfCredits ? 'account-credits-zero' : ''}>{entitlements.credits_remaining}</span>
                <span className="account-credits-of"> / {entitlements.monthly_credits}</span>
              </span>
            </div>
            <div className="account-credits-track">
              <div className="account-credits-fill" style={{ width: `${credPct}%` }} />
            </div>
            {outOfCredits && (
              <p className="account-credits-note account-credits-note--warn">
                Credits reset on the 1st of each month.
              </p>
            )}
            {isFree && (
              <div className="account-credits-upgrade">
                <p className="account-credits-note">
                  {outOfCredits
                    ? 'Upgrade to continue using AI features.'
                    : 'Trial plan — 50 AI credits/month included.'}
                </p>
                <a
                  href={PRICING_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="account-upgrade-btn"
                >
                  View plans <ExternalLink size={11} />
                </a>
              </div>
            )}
          </div>
        )}

        <div className="account-panel-gap" />

        <button type="button" className="account-panel-signout" onClick={onSignOut}>
          <LogOut size={15} />
          Sign out
        </button>
      </motion.div>
    </>
  );
}
