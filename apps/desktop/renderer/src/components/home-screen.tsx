'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Settings, Flame, Trophy, Map as MapIcon, Users, RefreshCw, MessageSquareText, BookOpen, HelpCircle, ArrowLeft } from 'lucide-react';

import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useGuidedTour } from '@/components/guided-tour/guided-tour-context';

import { ConceptMap } from '@/components/concept-map';
import { RobotAvatarPreset } from '@/components/robot-avatar-preset';
import { StudentProfileAvatar } from '@/components/student-profile-avatar';
import {
  getConceptPreviews,
  ROBOT_LAB_CONCEPT_IDS,
  type ConceptPreview,
} from '@/lib/concept-catalog';
import { AGE_GROUP_META, type AgeGroup, type ProfileAvatarKind } from '@/lib/concept-types';
import { ROBOT_PRESETS, DEFAULT_ROBOT_PRESET, type RobotPresetId } from '@/lib/robot-presets';
import {
  getStudentProgress,
  incrementSessions,
  setAgeGroup,
  updateStudentProfile,
  getProgressSummary,
} from '@/lib/progress-store';
import { Button } from '@/components/ui/button';
import { ClassroomSettingsModal } from '@/components/classroom-settings-modal';
import { TeacherFeedbackModal } from '@/components/teacher-feedback-modal';
import type { ChallengePack, ClassroomProfile } from '@/lib/platform-types';
import { useChallenges } from '@/lib/use-challenges';
import { RobotHub } from '@/components/robot-hub';
import { SandboxHeroScene } from '@/components/sandbox-scene';
import { getDifficultyLevel } from '@/lib/progress-store';

import type { AuthRole } from './auth-screen';
import { getClassSession } from '@/lib/session-store';
import {
  createSession,
  groupForHome,
  getSession,
  updateSession as updateSavedSession,
  type SavedSession,
} from '@/lib/session-storage';
import { SessionTile } from '@/components/session-tiles';
import {
  listUserTemplates,
  deleteUserTemplate,
  cloneTemplateObjects,
  type UserTemplate,
} from '@/lib/scene-builder';

const CONCEPT_PREVIEWS: ConceptPreview[] = getConceptPreviews();

/** Hero spotlight — rotate between fresh robotics labs and core math paths */
const FEATURED_TOPIC_IDS: readonly string[] = ['cone-ring-gauntlet', 'path-planning'];

type LeaderboardEntry = {
  rank: number;
  student_name: string;
  xp: number;
  level: number;
  level_name: string;
  level_emoji: string;
  badge_count: number;
  streak_days: number;
};

export type StartSessionOptions = {
  lessonPlanning?: boolean;
  conceptTitle?: string;
  challengeId?: string;
  /** When provided, the session view restores this saved workspace instead of creating a new one. */
  sessionId?: string;
};

function friendlyName(name: string): string {
  if (!name) return 'there';
  // If auto-generated from email prefix (all lowercase + digits, no spaces), extract only alpha part
  if (/^[a-z][a-z0-9._-]*$/.test(name)) {
    const alpha = name.replace(/[0-9._-].*/, '').trim();
    const base = alpha || name;
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  return name;
}

type HomeScreenProps = {
  role: AuthRole;
  userName: string;
  isRobotConnected: boolean;
  classroomName?: string;
  studentCount?: number;
  apiBase?: string;
  onStartSession: (conceptId?: string, starterPrompt?: string, ageGroup?: AgeGroup, options?: StartSessionOptions) => void;
  onSignOut: () => void;
  onBackToMenu?: () => void;
  onClassroomSaved?: (profile: ClassroomProfile) => void;
  onOpenTeacherDashboard?: () => void;
};

export function HomeScreen({
  role,
  userName,
  isRobotConnected,
  classroomName,
  studentCount,
  apiBase = '',
  onStartSession,
  onSignOut,
  onBackToMenu,
  onClassroomSaved,
  onOpenTeacherDashboard,
}: HomeScreenProps) {
  const [ageGroup, setAgeGroupState] = useState<AgeGroup>('explorer');
  const [showClassroomModal, setShowClassroomModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [teacherLeaderboard, setTeacherLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [teacherDetailName, setTeacherDetailName] = useState<string | null>(null);
  const [teacherDetail, setTeacherDetail] = useState<Record<string, unknown> | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showJourney, setShowJourney] = useState(false);
  const [journeyInitialTab, setJourneyInitialTab] = useState<'path' | 'stats'>('path');
  const [profile, setProfile] = useState({
    avatar: '🤖',
    favorite_color: 'var(--cyan)',
    bio: '',
    profile_avatar_kind: 'emoji' as ProfileAvatarKind,
    robot_preset: DEFAULT_ROBOT_PRESET as RobotPresetId,
  });
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  // Session library — bumps on rename/delete so tiles re-read storage
  const [sessionsRev, setSessionsRev] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const { triggerTour } = useGuidedTour();

  const { packs } = useChallenges('sketchbot', apiBase || undefined);
  const difficultyLevel = userName ? (getDifficultyLevel(userName) ?? ageGroup) : ageGroup;

  const cardGridContainer = useMemo(
    () => ({
      hidden: {},
      show: {
        transition: { staggerChildren: reducedMotion ? 0 : 0.055, delayChildren: reducedMotion ? 0 : 0.05 },
      },
    }),
    [reducedMotion],
  );

  const cardGridItem = useMemo(
    () => ({
      hidden: reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 },
      show: {
        opacity: 1,
        y: 0,
        transition: { duration: reducedMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] as const },
      },
    }),
    [reducedMotion],
  );

  const cardHoverTap = reducedMotion
    ? {}
    : { whileHover: { scale: 1.015 }, whileTap: { scale: 0.985 } };

  const syncAndFetchLeaderboard = useCallback(async () => {
    if (!apiBase || !userName) return;
    try {
      const summary = getProgressSummary(userName);
      if (summary) {
        const classSession = getClassSession();
        await fetch(`${apiBase}/api/progress/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_name: userName,
            xp: summary.xp,
            level: summary.level,
            level_name: summary.levelName,
            level_emoji: summary.levelEmoji,
            badge_count: summary.badges.length,
            streak_days: summary.streak.current_streak_days,
            drawings_count: summary.drawingCount,
            concepts_started: summary.conceptsStarted,
            concepts_mastered: summary.conceptsMastered,
            session_id: classSession?.sessionId ?? null,
          }),
        });
      }
      const res = await fetch(`${apiBase}/api/progress/leaderboard`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard ?? []);
      }
    } catch {
      // Network error — leaderboard unavailable
    }
  }, [apiBase, userName]);

  const fetchTeacherLeaderboard = useCallback(async () => {
    if (!apiBase || role !== 'teacher') return;
    try {
      const res = await fetch(`${apiBase}/api/progress/leaderboard`);
      if (res.ok) {
        const data = await res.json();
        setTeacherLeaderboard(data.leaderboard ?? []);
      }
    } catch {
      setTeacherLeaderboard([]);
    }
  }, [apiBase, role]);

  useEffect(() => {
    if (!userName) {
      return;
    }

    try {
      const progress = getStudentProgress(userName, 'explorer');
      setAgeGroupState(progress.age_group);
      setProfile({
        avatar: progress.avatar ?? '🤖',
        favorite_color: progress.favorite_color ?? 'var(--cyan)',
        bio: progress.bio ?? '',
        profile_avatar_kind: progress.profile_avatar_kind ?? 'emoji',
        robot_preset: (progress.robot_preset as RobotPresetId) ?? DEFAULT_ROBOT_PRESET,
      });
    } catch {
      // Ignore localStorage parse failures and keep the default group.
    }

    syncAndFetchLeaderboard();
  }, [userName, syncAndFetchLeaderboard]);

  useEffect(() => {
    if (role === 'teacher') {
      setAgeGroupState('builder');
    }
  }, [role]);

  useEffect(() => {
    void fetchTeacherLeaderboard();
  }, [fetchTeacherLeaderboard]);

  useEffect(() => {
    if (!apiBase || !teacherDetailName) {
      setTeacherDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/progress/${encodeURIComponent(teacherDetailName)}`);
        if (!res.ok) {
          if (!cancelled) setTeacherDetail(null);
          return;
        }
        const data = (await res.json()) as Record<string, unknown>;
        if (!cancelled) setTeacherDetail(data);
      } catch {
        if (!cancelled) setTeacherDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, teacherDetailName]);

  const handleStart = (concept: ConceptPreview | null) => {
    if (userName) {
      incrementSessions(userName);
    }

    // Create a fresh session record so the workspace persists from the first message.
    const conceptTitle = concept?.title ?? 'Sandbox';
    const newSession = createSession(userName || 'guest', {
      conceptId: concept?.id ?? null,
      conceptTitle,
      ageGroup,
      prompt: concept?.starterPrompt ?? '',
    });

    // If there's a matching challenge pack for this concept, auto-launch the first challenge
    if (concept && packs.length > 0) {
      const matchingPack = packs.find((p) => p.conceptId === concept.id);
      if (matchingPack && matchingPack.challenges.length > 0) {
        onStartSession(concept.id, concept.starterPrompt, ageGroup, {
          challengeId: matchingPack.challenges[0].id,
          conceptTitle,
          sessionId: newSession.id,
        });
        return;
      }
    }

    onStartSession(
      concept?.id,
      concept?.starterPrompt,
      ageGroup,
      { conceptTitle, sessionId: newSession.id },
    );
  };

  const handleResumeSession = (id: string) => {
    const session = getSession(userName || 'guest', id);
    if (!session) {
      // Tile referenced a deleted session — refresh the list
      setSessionsRev((n) => n + 1);
      return;
    }
    onStartSession(
      session.conceptId ?? undefined,
      session.prompt || undefined,
      session.ageGroup,
      {
        conceptTitle: session.conceptTitle ?? 'Sandbox',
        sessionId: session.id,
      },
    );
  };

  const sessionGroups = useMemo(() => {
    void sessionsRev; // re-read when rev bumps
    return groupForHome(userName || 'guest');
  }, [sessionsRev, userName]);

  // User-built course templates (Phase 2 — persisted via scene-builder lib)
  const userTemplates: UserTemplate[] = useMemo(() => {
    void sessionsRev;
    return listUserTemplates(userName || 'guest');
  }, [sessionsRev, userName]);

  /** Start a new sandbox session preloaded with a saved course template. */
  const handleStartUserTemplate = (template: UserTemplate) => {
    if (userName) incrementSessions(userName);
    const newSession = createSession(userName || 'guest', {
      conceptId: null,
      conceptTitle: template.name,
      ageGroup,
      prompt: '',
      name: template.name,
    });
    // Seed the session with the cloned objects before launching
    updateSavedSession(userName || 'guest', newSession.id, {
      sceneObjects: cloneTemplateObjects(template),
    });
    onStartSession(undefined, undefined, ageGroup, {
      conceptTitle: template.name,
      sessionId: newSession.id,
    });
  };

  const handleDeleteUserTemplate = (id: string, name: string) => {
    if (window.confirm(`Delete "${name}"? This can't be undone.`)) {
      deleteUserTemplate(userName || 'guest', id);
      setSessionsRev((n) => n + 1);
    }
  };

  const handleStartChallenge = (challengeId: string) => {
    const pack = packs.find((p) => p.challenges.some((c) => c.id === challengeId));
    const challenge = pack?.challenges.find((c) => c.id === challengeId);
    if (!challenge || !pack) return;
    if (userName) incrementSessions(userName);
    onStartSession(
      pack.conceptId ?? '',
      undefined,
      ageGroup,
      { challengeId: challenge.id, conceptTitle: pack.name },
    );
  };

  const handleAgeGroupChange = (nextAgeGroup: AgeGroup) => {
    setAgeGroupState(nextAgeGroup);
    if (userName) {
      setAgeGroup(userName, nextAgeGroup);
    }
  };

  const handleProfileSave = (nextProfile: typeof profile) => {
    if (userName) {
      updateStudentProfile(userName, {
        avatar: nextProfile.avatar,
        favorite_color: nextProfile.favorite_color,
        bio: nextProfile.bio,
        profile_avatar_kind: nextProfile.profile_avatar_kind,
        robot_preset: nextProfile.robot_preset,
      });
    }
    setProfile(nextProfile);
    setShowProfileModal(false);
  };

  const studentProgress = useMemo(() => {
    if (role !== 'student' || !userName) {
      return null;
    }

    return getStudentProgress(userName, ageGroup);
  }, [role, userName, ageGroup]);

  const gamification = useMemo(() => {
    if (!userName) return null;
    return getProgressSummary(userName);
  }, [userName, studentProgress]); // eslint-disable-line react-hooks/exhaustive-deps

  const studentStats = useMemo(() => {
    if (!studentProgress) {
      return { badges: 0, sessions: 0, conceptsStarted: 0, drawings: 0 };
    }

    const conceptsStarted = Object.values(studentProgress.concepts).filter((concept) =>
      Object.values(concept.layer_progress).some((status) => status !== 'untouched'),
    ).length;

    const conceptsMastered = Object.values(studentProgress.concepts).filter((concept) => concept.mastered).length;

    return {
      badges: studentProgress.badges.length,
      sessions: studentProgress.total_sessions,
      conceptsStarted,
      conceptsMastered,
      drawings: studentProgress.drawings.length,
    };
  }, [studentProgress]);

  const featuredConcepts = useMemo(() => {
    const byId = new Map(CONCEPT_PREVIEWS.map((c) => [c.id, c]));
    return FEATURED_TOPIC_IDS.map((id) => byId.get(id)).filter((c): c is ConceptPreview => Boolean(c));
  }, []);

  const initialTopicCount = 10;
  const visibleConcepts = showAllTopics
    ? CONCEPT_PREVIEWS
    : CONCEPT_PREVIEWS.slice(0, Math.min(initialTopicCount, CONCEPT_PREVIEWS.length));

  return (
    <div className="onboarding-shell">
      <div className="auth-bg-orb auth-bg-orb-a" />
      <div className="auth-bg-orb auth-bg-orb-b" />
      <div className="auth-bg-orb auth-bg-orb-c" />

      {/* Top-left back button */}
      {onBackToMenu && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onBackToMenu}
          style={{ position: 'fixed', top: 14, left: 14, zIndex: 10, fontSize: '0.75rem', minHeight: 32, gap: 5 } as React.CSSProperties}
        >
          <ArrowLeft size={13} />
          Menu
        </Button>
      )}

      {/* Top-right toolbar — leave 52px gap on right for the persistent profile button */}
      <div style={{ position: 'fixed', top: 14, right: 58, display: 'flex', gap: 8, zIndex: 10, alignItems: 'center' }}>
        {role === 'teacher' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              style={{ fontSize: '0.75rem', minHeight: 32, gap: 5 } as React.CSSProperties}
              onClick={() => setShowFeedbackModal(true)}
            >
              <MessageSquareText size={13} />
              Feedback
            </Button>
            <Button
              variant="ghost"
              size="sm"
              style={{ fontSize: '0.75rem', minHeight: 32, gap: 5 } as React.CSSProperties}
              onClick={() => setShowClassroomModal(true)}
            >
              <Settings size={13} />
              Classroom
            </Button>
            {onOpenTeacherDashboard && (
              <Button
                variant="ghost"
                size="sm"
                style={{ fontSize: '0.75rem', minHeight: 32, gap: 5 } as React.CSSProperties}
                onClick={onOpenTeacherDashboard}
              >
                Class Session
              </Button>
            )}
          </>
        )}
        {(role === 'student' || role === 'guest') && (
          <button
            type="button"
            className="learn-header-help-btn"
            onClick={() => triggerTour('studentHome')}
            title="Home screen walkthrough"
            aria-label="Home screen walkthrough"
          >
            <HelpCircle size={14} />
          </button>
        )}
      </div>

      <div className="onboarding-inner">
        <div className="onboarding-greeting">
          <h1>
            {role === 'teacher'
              ? `Welcome back, ${friendlyName(userName)}`
              : role === 'guest'
                ? 'Sandbox Mode'
                : `Hi, ${friendlyName(userName)}!`}
          </h1>
          <p>
            {role === 'teacher'
              ? `${classroomName ?? 'Your classroom'} — ${studentCount ?? 0} student${studentCount !== 1 ? 's' : ''}`
              : role === 'guest'
                ? 'You\'re in free-draw mode. No lessons or XP — just you and the bot.'
                : 'Your student dashboard is ready. Pick a lesson or customize your profile.'}
          </p>
        </div>

        {role === 'guest' && (
          <>
            <SandboxHeroScene />
            <div className="guest-unlock-nudge">
              <span className="guest-unlock-icon">🎓</span>
              <span className="guest-unlock-text">
                Want lessons, XP, and badges?
              </span>
              <button type="button" className="guest-unlock-btn" onClick={onSignOut}>
                Switch to Personal Tutor →
              </button>
            </div>
          </>
        )}

        {role === 'teacher' && (
          <section style={{ width: '100%', maxWidth: 920, margin: '0 auto 24px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
              }}
            >
              <div
                style={{
                  border: '1px solid rgba(120,140,255,0.2)',
                  borderRadius: 16,
                  padding: 16,
                  background: 'rgba(5,8,22,0.35)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Users size={18} />
                  <strong>Roster</strong>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: 0 }}>
                  {studentCount ?? 0} student{(studentCount ?? 0) !== 1 ? 's' : ''} on this device
                  {classroomName ? ` · ${classroomName}` : ''}
                </p>
                <Button variant="primary" size="sm" style={{ marginTop: 12 }} onClick={() => setShowClassroomModal(true)}>
                  Manage classroom
                </Button>
              </div>
              <div
                style={{
                  border: '1px solid rgba(120,140,255,0.2)',
                  borderRadius: 16,
                  padding: 16,
                  background: 'rgba(5,8,22,0.35)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Trophy size={18} />
                    <strong>Synced progress</strong>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ padding: 4 }}
                    onClick={() => void fetchTeacherLeaderboard()}
                    title="Refresh leaderboard"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 8px' }}>
                  Students who synced XP to this hub. Tap a row for server-stored summary.
                </p>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {teacherLeaderboard.length === 0 ? (
                    <span style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>
                      No rows yet — students sync when they open the home screen with the backend running.
                    </span>
                  ) : (
                    teacherLeaderboard.map((e) => (
                      <button
                        key={e.student_name}
                        type="button"
                        onClick={() => setTeacherDetailName((n) => (n === e.student_name ? null : e.student_name))}
                        style={{
                          display: 'flex',
                          width: '100%',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          marginBottom: 4,
                          borderRadius: 10,
                          border:
                            teacherDetailName === e.student_name
                              ? '1px solid rgba(77,226,255,0.5)'
                              : '1px solid rgba(120,140,255,0.12)',
                          background: 'rgba(5,8,22,0.55)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          color: 'inherit',
                          font: 'inherit',
                        }}
                      >
                        <span>
                          #{e.rank} {e.student_name}
                        </span>
                        <span>
                          {e.level_emoji} Lv.{e.level} · {e.xp} XP
                        </span>
                      </button>
                    ))
                  )}
                </div>
                {teacherDetailName && teacherDetail && teacherDetail.found === false && (
                  <p style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--muted)' }}>No synced row for this name.</p>
                )}
                {teacherDetailName && teacherDetail && teacherDetail.found !== false && (
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: '0.82rem',
                      color: 'var(--muted)',
                      borderTop: '1px solid rgba(120,140,255,0.15)',
                      paddingTop: 10,
                    }}
                  >
                    <strong style={{ color: 'var(--text)' }}>
                      {String(teacherDetail.student_name ?? teacherDetailName)}
                    </strong>
                    <div>Drawings (synced): {String(teacherDetail.drawings_count ?? '—')}</div>
                    <div>Concepts started: {String(teacherDetail.concepts_started ?? '—')}</div>
                    <div>Concepts mastered: {String(teacherDetail.concepts_mastered ?? '—')}</div>
                    <div>Streak (days): {String(teacherDetail.streak_days ?? '—')}</div>
                  </div>
                )}
              </div>
              <div
                style={{
                  border: '1px solid rgba(120,140,255,0.2)',
                  borderRadius: 16,
                  padding: 16,
                  background: 'rgba(5,8,22,0.35)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <MessageSquareText size={18} />
                  <strong>Product feedback</strong>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: '0 0 12px' }}>
                  Save notes to this computer&apos;s hub log, or open email to the team (address from server config).
                </p>
                <Button variant="primary" size="sm" onClick={() => setShowFeedbackModal(true)}>
                  Feedback &amp; email
                </Button>
              </div>
            </div>
          </section>
        )}

        {role === 'student' ? (
          <>
          <div className="dashboard-top-grid">
            <section className="student-profile-panel" data-tour="home-profile">
              <div className="student-profile-card" style={{ borderColor: profile.favorite_color }}>
                <div className="student-profile-header">
                  <div className="student-profile-avatar-wrap">
                    <StudentProfileAvatar
                      kind={profile.profile_avatar_kind}
                      emoji={profile.avatar}
                      robotPresetId={profile.robot_preset}
                      accent={profile.favorite_color}
                      size={52}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="student-profile-name">{friendlyName(userName)}</div>
                    <div className="student-profile-subtitle">
                      {gamification
                        ? `${gamification.levelEmoji} Lv.${gamification.level} ${gamification.levelName}`
                        : `${AGE_GROUP_META[ageGroup].emoji} ${AGE_GROUP_META[ageGroup].label}`}
                    </div>
                  </div>
                  {gamification && gamification.streak.current_streak_days > 0 && (
                    <div className="home-streak-badge" title={`${gamification.streak.current_streak_days}-day streak`}>
                      <Flame size={14} />
                      <span>{gamification.streak.current_streak_days}</span>
                    </div>
                  )}
                </div>

                {gamification && (
                  <div className="home-xp-section">
                    <div className="home-xp-header">
                      <span className="home-xp-amount">{gamification.xp} XP</span>
                      <span className="home-xp-next">
                        {gamification.level < 12
                          ? `${gamification.nextXP - gamification.xp} XP to Lv.${gamification.level + 1}`
                          : 'Max level!'}
                      </span>
                    </div>
                    <div className="home-xp-track">
                      <div className="home-xp-fill" style={{ width: `${Math.round(gamification.progress * 100)}%` }} />
                    </div>
                  </div>
                )}

                <div className="student-profile-stats">
                  <div>
                    <strong>{studentStats.sessions}</strong>
                    <span>Sessions</span>
                  </div>
                  <div>
                    <strong>{studentStats.badges}</strong>
                    <span>Badges</span>
                  </div>
                  <div>
                    <strong>{studentStats.conceptsStarted}</strong>
                    <span>Concepts</span>
                  </div>
                  <div>
                    <strong>{studentStats.drawings}</strong>
                    <span>Drawings</span>
                  </div>
                  <div>
                    <strong>{studentStats.conceptsMastered ?? 0}</strong>
                    <span>Mastered</span>
                  </div>
                </div>
                <div className="student-profile-actions">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setJourneyInitialTab('stats');
                      setShowJourney(true);
                    }}
                    style={{ gap: 6 } as React.CSSProperties}
                  >
                    <MapIcon size={14} />
                    Progress &amp; path
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowProfileModal(true)}>
                    Customize look
                  </Button>
                </div>
              </div>

            </section>

            <div className="home-hero-section">
              <div className="home-age-group-selector">
                {(['explorer', 'builder', 'engineer'] as AgeGroup[]).map((ag) => (
                  <button
                    key={ag}
                    type="button"
                    className={`home-age-pill${ageGroup === ag ? ' active' : ''}`}
                    style={{ '--pill-color': AGE_GROUP_META[ag].color } as React.CSSProperties}
                    onClick={() => handleAgeGroupChange(ag)}
                  >
                    <span>{AGE_GROUP_META[ag].emoji}</span>
                    <span>{AGE_GROUP_META[ag].label}</span>
                    <span className="home-age-pill-sub">{AGE_GROUP_META[ag].description}</span>
                  </button>
                ))}
              </div>
              <motion.div
                className="concept-card-grid"
                data-tour="home-topics"
                variants={cardGridContainer}
                initial="hidden"
                animate="show"
              >
                <motion.button
                  type="button"
                  className="concept-card free-explore"
                  variants={cardGridItem}
                  onClick={() => handleStart(null)}
                  {...cardHoverTap}
                >
                  <span className="concept-card-emoji">Draw</span>
                  <div className="concept-card-title">Free Draw</div>
                  <div className="concept-card-subtitle">Open prompt, any subject — no guided steps</div>
                  <div className="concept-card-domain-badge" style={{ color: 'var(--pink)', background: 'rgba(255,79,216,0.12)', borderColor: 'transparent' }}>
                    freestyle
                  </div>
                </motion.button>
                {visibleConcepts.map((concept) => (
                  <motion.button
                    key={concept.id}
                    type="button"
                    data-concept={concept.id}
                    className={`concept-card ${(ROBOT_LAB_CONCEPT_IDS as readonly string[]).includes(concept.id) ? 'concept-card--robot-lab' : ''}`}
                    variants={cardGridItem}
                    onClick={() => handleStart(concept)}
                    {...cardHoverTap}
                  >
                    <span className="concept-card-emoji">{concept.emoji}</span>
                    <div className="concept-card-title">{concept.title}</div>
                    <div className="concept-card-subtitle">{concept.subtitle}</div>
                    <div className="concept-card-domain-badge">{concept.domain}</div>
                  </motion.button>
                ))}
              </motion.div>
              {!showAllTopics && CONCEPT_PREVIEWS.length > visibleConcepts.length && (
                <button type="button" className="show-all-topics-btn" onClick={() => setShowAllTopics(true)}>
                  Show all topics
                </button>
              )}
              {showAllTopics && (
                <button type="button" className="show-all-topics-btn" onClick={() => setShowAllTopics(false)}>
                  Show fewer topics
                </button>
              )}
            </div>
          </div>

          {leaderboard.length > 1 && (
            <div className="home-leaderboard home-leaderboard--wide">
              <div className="home-leaderboard-title">
                <Trophy size={14} />
                <span>Classroom Leaderboard</span>
              </div>
              <div className="home-leaderboard-list home-leaderboard-list--wide">
                {leaderboard.slice(0, 8).map((entry) => (
                  <div
                    key={entry.student_name}
                    className={`home-leaderboard-row ${entry.student_name === userName ? 'is-me' : ''}`}
                  >
                    <span className="home-lb-rank">#{entry.rank}</span>
                    <span className="home-lb-name">{entry.student_name}</span>
                    <span className="home-lb-level">{entry.level_emoji} Lv.{entry.level}</span>
                    {entry.streak_days > 0 && (
                      <span className="home-lb-streak">
                        <Flame size={10} />
                        {entry.streak_days}
                      </span>
                    )}
                    <span className="home-lb-xp">
                      {entry.student_name === userName ? `${entry.xp} XP` : `${entry.badge_count} badges`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
        ) : role === 'teacher' ? (
          <div className="home-hero-section">
            <div className="home-hero-copy">
              <h2>Ready for the classroom?</h2>
              <p>Select a concept and launch a session for your class.</p>
            </div>
            <motion.div
              className="home-hero-card-grid"
              variants={cardGridContainer}
              initial="hidden"
              animate="show"
            >
              <motion.button
                type="button"
                className="hero-card hero-card-primary"
                variants={cardGridItem}
                onClick={() => handleStart(null)}
                {...cardHoverTap}
              >
                <span className="hero-card-emoji">🎨</span>
                <div className="hero-card-title">Free Draw</div>
                <div className="hero-card-copy">Any prompt, any idea — just jump in and draw.</div>
              </motion.button>
              {featuredConcepts.map((concept) => (
                <motion.button
                  key={concept.id}
                  type="button"
                  data-concept={concept.id}
                  className="hero-card"
                  variants={cardGridItem}
                  onClick={() => handleStart(concept)}
                  {...cardHoverTap}
                >
                  <span className="hero-card-emoji">{concept.emoji}</span>
                  <div className="hero-card-title">{concept.title}</div>
                  <div className="hero-card-copy">{concept.subtitle}</div>
                </motion.button>
              ))}
            </motion.div>
          </div>
        ) : null}

        {role !== 'student' && (
        <div className="concept-domain-section">
          {/* Header row: title (+ subtitle for guests) + age-pills aligned right */}
          <div className="sessions-header">
            <div className="sessions-header-left">
              <h2>{role === 'guest' ? 'Your sessions' : 'Activities'}</h2>
              {role === 'guest' && (
                <p className="sessions-header-sub">
                  Pick up where you left off or start a new one. Every session auto-saves chats and code.
                </p>
              )}
            </div>
            {role === 'guest' && (
              <div className="home-age-group-selector home-age-group-selector--inline">
                {(['explorer', 'builder', 'engineer'] as AgeGroup[]).map((ag) => (
                  <button
                    key={ag}
                    type="button"
                    className={`home-age-pill${ageGroup === ag ? ' active' : ''}`}
                    style={{ '--pill-color': AGE_GROUP_META[ag].color } as React.CSSProperties}
                    onClick={() => handleAgeGroupChange(ag)}
                  >
                    <span>{AGE_GROUP_META[ag].emoji}</span>
                    <span>{AGE_GROUP_META[ag].label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Unified sessions gallery (guest only): [+ New] [Continue] [...Saved] [...Recent] */}
          {role === 'guest' && (
            <motion.div
              className="sessions-gallery"
              variants={cardGridContainer}
              initial="hidden"
              animate="show"
            >
              <motion.button
                type="button"
                className="session-tile session-tile--new"
                variants={cardGridItem}
                onClick={() => handleStart(null)}
                {...cardHoverTap}
              >
                <div className="session-tile-new-icon">+</div>
                <div className="session-tile-new-label">New session</div>
                <div className="session-tile-new-sub">Blank workspace — free draw</div>
              </motion.button>

              {sessionGroups.continueWith && (
                <motion.div variants={cardGridItem}>
                  <SessionTile
                    session={sessionGroups.continueWith}
                    variant="continue"
                    userName={userName || 'guest'}
                    onResume={handleResumeSession}
                    onChange={() => setSessionsRev((n) => n + 1)}
                  />
                </motion.div>
              )}

              {sessionGroups.saved.map((s: SavedSession) => (
                <motion.div key={s.id} variants={cardGridItem}>
                  <SessionTile
                    session={s}
                    variant="saved"
                    userName={userName || 'guest'}
                    onResume={handleResumeSession}
                    onChange={() => setSessionsRev((n) => n + 1)}
                  />
                </motion.div>
              ))}

              {sessionGroups.recent.map((s: SavedSession) => (
                <motion.div key={s.id} variants={cardGridItem}>
                  <SessionTile
                    session={s}
                    variant="continue"
                    userName={userName || 'guest'}
                    onResume={handleResumeSession}
                    onChange={() => setSessionsRev((n) => n + 1)}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Your courses — user-built templates (Phase 2) */}
          {role === 'guest' && userTemplates.length > 0 && (
            <>
              <div className="sessions-templates-header" style={{ marginTop: 14 }}>
                <h3>Your courses</h3>
                <p>Built in the sandbox — click to open in a fresh session.</p>
              </div>
              <div className="sessions-gallery">
                {userTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className="user-course-tile"
                    onClick={() => handleStartUserTemplate(tpl)}
                  >
                    <span className="user-course-tile-emoji">🧱</span>
                    <div className="user-course-tile-title">{tpl.name}</div>
                    <div className="user-course-tile-sub">
                      {tpl.sceneObjects.length} object{tpl.sceneObjects.length === 1 ? '' : 's'}
                    </div>
                    <button
                      type="button"
                      className="user-course-tile-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteUserTemplate(tpl.id, tpl.name);
                      }}
                      aria-label="Delete course"
                      title="Delete"
                    >
                      ×
                    </button>
                  </button>
                ))}
              </div>
            </>
          )}

          {role === 'guest' && (
            <div className="sessions-templates-header">
              <h3>Or start from a template</h3>
              <p>Each one opens a new session pre-loaded with a concept and starter prompt.</p>
            </div>
          )}

          <motion.div
            className="concept-card-grid"
            data-tour="home-topics"
            variants={cardGridContainer}
            initial="hidden"
            animate="show"
          >
            {role !== 'guest' && (
              <motion.button
                type="button"
                className="concept-card free-explore"
                variants={cardGridItem}
                onClick={() => handleStart(null)}
                {...cardHoverTap}
              >
                <span className="concept-card-emoji">🎨</span>
                <div className="concept-card-title">Free Draw</div>
                <div className="concept-card-subtitle">Open prompt, any subject - no guided steps</div>
                <div className="concept-card-domain-badge" style={{ color: 'var(--pink)', background: 'rgba(255,79,216,0.12)', borderColor: 'transparent' }}>
                  freestyle
                </div>
              </motion.button>
            )}

            {visibleConcepts.map((concept) => (
              <motion.button
                key={concept.id}
                type="button"
                data-concept={concept.id}
                className={`concept-card ${
                  (ROBOT_LAB_CONCEPT_IDS as readonly string[]).includes(concept.id)
                    ? 'concept-card--robot-lab'
                    : ''
                }`}
                variants={cardGridItem}
                onClick={() => handleStart(concept)}
                {...cardHoverTap}
              >
                <span className="concept-card-emoji">{concept.emoji}</span>
                <div className="concept-card-title">{concept.title}</div>
                <div className="concept-card-subtitle">{concept.subtitle}</div>
                <div className="concept-card-domain-badge">{concept.domain}</div>
              </motion.button>
            ))}
          </motion.div>

          {!showAllTopics && CONCEPT_PREVIEWS.length > visibleConcepts.length && (
            <button type="button" className="show-all-topics-btn" onClick={() => setShowAllTopics(true)}>
              Show all topics
            </button>
          )}
          {showAllTopics && (
            <button type="button" className="show-all-topics-btn" onClick={() => setShowAllTopics(false)}>
              Show fewer topics
            </button>
          )}
        </div>
        )}

        {packs.length > 0 && (
          <div className="concept-domain-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <BookOpen size={16} style={{ color: 'var(--cyan)' }} />
              <h2 style={{ margin: 0 }}>Challenge Library</h2>
            </div>
            <div className="tap-to-enter-hint" style={{ marginBottom: 16 }}>
              Pick a guided challenge — the tutor walks you through every step.
            </div>
            <RobotHub
              isRobotConnected={isRobotConnected}
              selectedChallengeId={selectedChallengeId}
              difficultyLevel={difficultyLevel}
              packs={packs}
              onSelectChallenge={(id) => setSelectedChallengeId(id)}
              onStartFreeSession={() => handleStart(null)}
            />
            {selectedChallengeId !== null && (
              <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handleStartChallenge(selectedChallengeId)}
                >
                  Start challenge →
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setSelectedChallengeId(null)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        <AnimatePresence>
          {showProfileModal && (
            <motion.div
              className="profile-modal-overlay"
              initial={{ opacity: reducedMotion ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: reducedMotion ? 1 : 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
              onClick={() => setShowProfileModal(false)}
            >
              <motion.div
                className="profile-modal"
                initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, scale: 0.98, y: 8 }}
                transition={{ duration: reducedMotion ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
                onClick={(event) => event.stopPropagation()}
              >
              <h3>Customize your look</h3>
              <div className="profile-form-row">
                <label>How you appear</label>
                <div className="profile-look-toggle">
                  <button
                    type="button"
                    className={`profile-look-opt ${profile.profile_avatar_kind === 'robot' ? 'active' : ''}`}
                    onClick={() => setProfile((c) => ({ ...c, profile_avatar_kind: 'robot' }))}
                  >
                    Robot buddy
                  </button>
                  <button
                    type="button"
                    className={`profile-look-opt ${profile.profile_avatar_kind === 'emoji' ? 'active' : ''}`}
                    onClick={() => setProfile((c) => ({ ...c, profile_avatar_kind: 'emoji' }))}
                  >
                    Emoji
                  </button>
                </div>
              </div>

              {profile.profile_avatar_kind === 'robot' ? (
                <div className="profile-form-row">
                  <label>Robot style</label>
                  <div className="profile-robot-grid">
                    {ROBOT_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`profile-robot-choice ${profile.robot_preset === p.id ? 'active' : ''}`}
                        onClick={() => setProfile((c) => ({ ...c, robot_preset: p.id }))}
                        title={p.description}
                      >
                        <RobotAvatarPreset preset={p.id} accent={profile.favorite_color} size={44} />
                        <span className="profile-robot-label">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="profile-form-row">
                  <label>Emoji</label>
                  <div className="profile-avatar-grid">
                    {['🤖', '🚀', '🧠', '🎨', '⚙️', '🌟'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className={`profile-avatar-choice ${profile.avatar === emoji ? 'active' : ''}`}
                        onClick={() => setProfile((current) => ({ ...current, avatar: emoji }))}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="profile-form-row">
                <label>Color</label>
                <div className="profile-color-grid">
                  {['var(--cyan)', 'var(--amber)', 'var(--violet)', 'var(--pink)', 'var(--green)'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`profile-color-choice ${profile.favorite_color === color ? 'active' : ''}`}
                      style={{ background: color }}
                      onClick={() => setProfile((current) => ({ ...current, favorite_color: color }))}
                    />
                  ))}
                </div>
              </div>

              <div className="profile-form-row">
                <label>Goal</label>
                <textarea
                  className="profile-bio-input"
                  value={profile.bio}
                  onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))}
                  placeholder="What do you want to learn today?"
                />
              </div>

              <div className="profile-modal-actions">
                <Button variant="ghost" size="md" onClick={() => setShowProfileModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="md" onClick={() => handleProfileSave(profile)}>
                  Save profile
                </Button>
              </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {showClassroomModal && (
          <ClassroomSettingsModal
            open
            onClose={() => setShowClassroomModal(false)}
            onSaved={(p) => {
              onClassroomSaved?.(p);
              void fetchTeacherLeaderboard();
            }}
            onStartLessonPlanning={(conceptId, title, starterPrompt) => {
              onStartSession(
                conceptId,
                starterPrompt,
                role === 'teacher' ? 'builder' : ageGroup,
                { lessonPlanning: true, conceptTitle: title },
              );
            }}
          />
        )}

        {showFeedbackModal && role === 'teacher' && (
          <TeacherFeedbackModal
            open
            onClose={() => setShowFeedbackModal(false)}
            apiBase={apiBase}
            teacherDisplayName={userName}
          />
        )}

        {role === 'student' && showJourney && userName ? (
          <ConceptMap
            studentName={userName}
            ageGroup={ageGroup}
            initialTab={journeyInitialTab}
            onConceptSelect={(conceptId, _title) => {
              const preview = CONCEPT_PREVIEWS.find((c) => c.id === conceptId);
              onStartSession(conceptId, preview?.starterPrompt, ageGroup);
              setShowJourney(false);
            }}
            onClose={() => setShowJourney(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
