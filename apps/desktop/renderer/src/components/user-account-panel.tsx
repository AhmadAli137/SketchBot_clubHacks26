'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { LogOut, X, Trophy, Zap, Flame, BookOpen, ExternalLink, Sparkles, Cpu, Music, Volume2, VolumeX } from 'lucide-react';
import type { AuthRole } from '@/components/auth-screen';
import { getProgressSummary, getStudentProgress } from '@/lib/progress-store';
import { StudentProfileAvatar } from '@/components/student-profile-avatar';
import { useEntitlements, tierLabel } from '@/lib/use-entitlements';
import {
  getAgenticSettings,
  setAgenticTutorEnabled,
  onAgenticSettingsChange,
} from '@/lib/agentic-settings';
import {
  getAudioSettings,
  setMusicVolume,
  setTutorVolume,
  onAudioSettingsChange,
} from '@/lib/audio-settings';
import { SurfacePicker } from '@/components/surface-picker';
import { useRuntimeConfig } from '@/lib/config';

const PRICING_URL = 'https://sayspark.ca/pricing';
const ACCOUNT_URL = 'https://sayspark.ca/account';

type Props = {
  role: AuthRole;
  name: string;
  email?: string;
  // Serial reported by the firmware on hello (e.g. SKETCH-A1B2-C3D4).
  // Null when no real chassis is connected; drives the Register-Robot
  // affordance and pre-fills the admin-web claim form via deep link.
  robotSerial?: string | null;
  onSignOut: () => void;
  onClose: () => void;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserAccountPanel({ role, name, email, robotSerial, onSignOut, onClose }: Props) {
  const { apiBase } = useRuntimeConfig();
  const progress = useMemo(() => {
    if (role !== 'student' || !name) return null;
    return getProgressSummary(name);
  }, [role, name]);

  const avatarData = useMemo(() => {
    if (!name) return null;
    const sp = getStudentProgress(name, 'explorer');
    return {
      kind: sp.profile_avatar_kind ?? 'emoji',
      emoji: sp.avatar ?? '🤖',
      robotPreset: sp.robot_preset ?? 'orbit',
      color: sp.favorite_color ?? 'var(--cyan)',
    } as const;
  }, [name]);

  const { entitlements } = useEntitlements(role !== 'guest');

  // Parent toggle for the agentic tutor's proactive observation loop.
  // Persisted in localStorage; the renderer's tick loop reads this live.
  const [agenticEnabled, setAgenticEnabled] = useState<boolean>(() =>
    getAgenticSettings().agenticTutorEnabled,
  );
  useEffect(() => onAgenticSettingsChange((s) => setAgenticEnabled(s.agenticTutorEnabled)), []);

  // Music + Spark voice volumes. The slider drives the localStorage-
  // backed audio-settings store; menu-music and tutor-panel TTS both
  // subscribe to it and react in real time.
  const [audio, setAudio] = useState(() => getAudioSettings());
  useEffect(() => onAudioSettingsChange(setAudio), []);

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
          {avatarData ? (
            <StudentProfileAvatar
              kind={avatarData.kind}
              emoji={avatarData.emoji}
              robotPresetId={avatarData.robotPreset}
              accent={avatarData.color}
              size={56}
              className="account-panel-avatar"
            />
          ) : (
            <div className="account-panel-avatar">{name.slice(0, 2).toUpperCase()}</div>
          )}
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

        {/* Robot section — visible whenever a chassis has identified itself
            on the local-runtime WS. The Register button opens the admin
            web's account page with ?serial= pre-filled so binding is one
            click for the user. */}
        {role !== 'guest' && robotSerial && (
          <div className="account-panel-toggle-row">
            <div className="account-panel-toggle-text">
              <div className="account-panel-toggle-title">
                <Cpu size={13} />
                Connected robot
              </div>
              <div
                className="account-panel-toggle-sub"
                style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em' }}
              >
                {robotSerial}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <a
                href={`${ACCOUNT_URL}?serial=${encodeURIComponent(robotSerial)}`}
                target="_blank"
                rel="noreferrer"
                className="account-upgrade-btn"
                title="Bind this robot to your SaySpark account"
              >
                Register <ExternalLink size={11} />
              </a>
              <button
                type="button"
                className="account-upgrade-btn"
                title="Open the calibration wizard"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('sketchbot:open-calibration'));
                  onClose();
                }}
              >
                Calibrate
              </button>
              <button
                type="button"
                className="account-upgrade-btn"
                title="Quick check that calibration is still accurate (~30s)"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('sketchbot:open-drift-check'));
                  onClose();
                }}
              >
                Drift check
              </button>
            </div>
          </div>
        )}

        {/* Surface profile picker (Cal.6). Only shown when a real bot
            is on the LAN — switching surfaces in sim mode wouldn't do
            anything (the simulator doesn't care about wheel friction). */}
        {role !== 'guest' && robotSerial && (
          <SurfacePicker apiBase={apiBase} robotConnected={!!robotSerial} />
        )}

        {/* Volume sliders — music + Spark's voice. Live-applied; drag to
            preview. Values persist in localStorage so quiet households
            don't have to re-set every session. */}
        <div className="account-panel-volume-row">
          <div className="account-panel-volume-head">
            <Music size={13} />
            <span className="account-panel-volume-label">Music</span>
            <span className="account-panel-volume-value">{Math.round(audio.musicVolume * 100)}%</span>
          </div>
          <div className="account-panel-volume-track">
            {audio.musicVolume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(audio.musicVolume * 100)}
              onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
              aria-label="Music volume"
              className="account-panel-volume-slider"
            />
          </div>
        </div>

        <div className="account-panel-volume-row">
          <div className="account-panel-volume-head">
            <Sparkles size={13} />
            <span className="account-panel-volume-label">Spark&apos;s voice</span>
            <span className="account-panel-volume-value">{Math.round(audio.tutorVolume * 100)}%</span>
          </div>
          <div className="account-panel-volume-track">
            {audio.tutorVolume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(audio.tutorVolume * 100)}
              onChange={(e) => setTutorVolume(Number(e.target.value) / 100)}
              aria-label="Spark's voice volume"
              className="account-panel-volume-slider"
            />
          </div>
        </div>

        {/* Agentic tutor parent toggle. Hidden for guest accounts since
            it's most relevant to households where a parent is making the
            call on behalf of a kid. */}
        {role !== 'guest' && (
          <div className="account-panel-toggle-row">
            <div className="account-panel-toggle-text">
              <div className="account-panel-toggle-title">
                <Sparkles size={13} />
                Spark observes & coaches
              </div>
              <div className="account-panel-toggle-sub">
                When on, Spark watches the session and offers occasional hints
                or encouragement. Turn off for quieter sessions.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={agenticEnabled}
              className={`account-panel-toggle${agenticEnabled ? ' on' : ''}`}
              onClick={() => setAgenticTutorEnabled(!agenticEnabled)}
              title={agenticEnabled ? 'Turn off proactive coaching' : 'Turn on proactive coaching'}
            >
              <span className="account-panel-toggle-knob" />
            </button>
          </div>
        )}

        <button type="button" className="account-panel-signout" onClick={onSignOut}>
          <LogOut size={15} />
          Sign out
        </button>
      </motion.div>
    </>
  );
}
