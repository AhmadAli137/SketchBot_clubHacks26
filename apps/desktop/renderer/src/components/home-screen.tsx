'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Settings } from 'lucide-react';

import { getConceptPreviews, type ConceptPreview } from '@/lib/concept-catalog';
import { AGE_GROUP_META, type AgeGroup } from '@/lib/concept-types';
import { getStudentProgress, incrementSessions, setAgeGroup, updateStudentProfile } from '@/lib/progress-store';
import { Button } from '@/components/ui/button';

import type { AuthRole } from './auth-screen';

const CONCEPT_PREVIEWS: ConceptPreview[] = getConceptPreviews();

type HomeScreenProps = {
  role: AuthRole;
  userName: string;
  isRobotConnected: boolean;
  classroomName?: string;
  studentCount?: number;
  onStartSession: (conceptId?: string, starterPrompt?: string, ageGroup?: AgeGroup) => void;
  onSignOut: () => void;
};

export function HomeScreen({
  role,
  userName,
  isRobotConnected,
  classroomName,
  studentCount,
  onStartSession,
  onSignOut,
}: HomeScreenProps) {
  const [ageGroup, setAgeGroupState] = useState<AgeGroup>('explorer');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profile, setProfile] = useState({ avatar: '🤖', favorite_color: 'var(--cyan)', bio: '' });
  const [showAllTopics, setShowAllTopics] = useState(false);

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
      });
    } catch {
      // Ignore localStorage parse failures and keep the default group.
    }
  }, [userName]);

  const handleStart = (concept: ConceptPreview | null) => {
    if (userName) {
      incrementSessions(userName);
    }

    onStartSession(concept?.id, concept?.starterPrompt, ageGroup);
  };

  const handleAgeGroupChange = (nextAgeGroup: AgeGroup) => {
    setAgeGroupState(nextAgeGroup);
    if (userName) {
      setAgeGroup(userName, nextAgeGroup);
    }
  };

  const handleProfileSave = (nextProfile: { avatar: string; favorite_color: string; bio: string }) => {
    if (userName) {
      updateStudentProfile(userName, nextProfile);
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

  const featuredConcepts = CONCEPT_PREVIEWS.slice(0, 2);
  const visibleConcepts = showAllTopics ? CONCEPT_PREVIEWS : CONCEPT_PREVIEWS.slice(0, 5);

  return (
    <div className="onboarding-shell">
      <div className="auth-bg-orb auth-bg-orb-a" />
      <div className="auth-bg-orb auth-bg-orb-b" />
      <div className="auth-bg-orb auth-bg-orb-c" />

      <div style={{ position: 'fixed', top: 14, right: 14, display: 'flex', gap: 8, zIndex: 10 }}>
        {role === 'teacher' && (
          <Button variant="ghost" size="sm" style={{ fontSize: '0.75rem', minHeight: 32, gap: 5 } as React.CSSProperties}>
            <Settings size={13} />
            Classroom
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onSignOut}
          style={{ fontSize: '0.75rem', minHeight: 32 } as React.CSSProperties}
        >
          Sign out
        </Button>
      </div>

      <div className="onboarding-inner">
        <div className="onboarding-greeting">
          <h1>{role === 'teacher' ? `Welcome back, ${userName}` : `Hi, ${userName}!`}</h1>
          <p>
            {role === 'teacher'
              ? `${classroomName ?? 'Your classroom'} - ${studentCount ?? 0} student${studentCount !== 1 ? 's' : ''}`
              : 'Your student dashboard is ready. Pick a lesson or customize your profile.'}
          </p>
        </div>

        {role === 'student' ? (
          <div className="dashboard-top-grid">
            <section className="student-profile-panel">
              <div className="student-profile-card" style={{ borderColor: profile.favorite_color }}>
                <div className="student-profile-header">
                  <div className="student-profile-avatar" style={{ background: profile.favorite_color }}>
                    {profile.avatar}
                  </div>
                  <div>
                    <div className="student-profile-name">{userName}</div>
                    <div className="student-profile-subtitle">{AGE_GROUP_META[ageGroup].emoji} {AGE_GROUP_META[ageGroup].label}</div>
                  </div>
                </div>
                <p className="student-profile-bio">
                  {profile.bio || 'Customize your avatar, set a goal, and watch your progress grow.'}
                </p>
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
                    <span>Concepts started</span>
                  </div>
                  <div>
                    <strong>{studentStats.drawings}</strong>
                    <span>Drawings saved</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button variant="ghost" size="sm" onClick={() => setShowProfileModal(true)}>
                    Customize profile
                  </Button>
                </div>
              </div>
            </section>

            <div className="home-hero-section">
              <div className="home-hero-copy">
                <h2>Today’s adventure</h2>
                <p>Choose one of these top activities to continue your learning.</p>
              </div>
              <div className="home-hero-card-grid">
                <button
                  type="button"
                  className="hero-card hero-card-primary"
                  onClick={() => handleStart(null)}
                >
                  <span className="hero-card-emoji">🎨</span>
                  <div className="hero-card-title">Free Draw</div>
                  <div className="hero-card-copy">Any prompt, any idea — just jump in and draw.</div>
                </button>
                {featuredConcepts.map((concept) => (
                  <button
                    key={concept.id}
                    type="button"
                    className="hero-card"
                    onClick={() => handleStart(concept)}
                  >
                    <span className="hero-card-emoji">{concept.emoji}</span>
                    <div className="hero-card-title">{concept.title}</div>
                    <div className="hero-card-copy">{concept.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="home-hero-section">
            <div className="home-hero-copy">
              <h2>Ready for the classroom?</h2>
              <p>Select a concept and launch a session for your class.</p>
            </div>
            <div className="home-hero-card-grid">
              <button
                type="button"
                className="hero-card hero-card-primary"
                onClick={() => handleStart(null)}
              >
                <span className="hero-card-emoji">🎨</span>
                <div className="hero-card-title">Free Draw</div>
                <div className="hero-card-copy">Any prompt, any idea — just jump in and draw.</div>
              </button>
              {featuredConcepts.map((concept) => (
                <button
                  key={concept.id}
                  type="button"
                  className="hero-card"
                  onClick={() => handleStart(concept)}
                >
                  <span className="hero-card-emoji">{concept.emoji}</span>
                  <div className="hero-card-title">{concept.title}</div>
                  <div className="hero-card-copy">{concept.subtitle}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="concept-domain-section">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2>More to explore</h2>
            <div className="tap-to-enter-hint">Tap a card to launch the experience instantly.</div>
          </div>

          <div className="concept-card-grid">
            <button
              type="button"
              className="concept-card free-explore"
              onClick={() => handleStart(null)}
              style={{ animationDelay: '0ms' }}
            >
              <span className="concept-card-emoji">Draw</span>
              <div className="concept-card-title">Free Draw</div>
              <div className="concept-card-subtitle">Open prompt, any subject - no guided steps</div>
              <div className="concept-card-domain-badge" style={{ color: 'var(--pink)', background: 'rgba(255,79,216,0.12)', borderColor: 'transparent' }}>
                freestyle
              </div>
            </button>

            {visibleConcepts.map((concept, index) => (
              <button
                key={concept.id}
                type="button"
                className="concept-card"
                onClick={() => handleStart(concept)}
                style={{ animationDelay: `${(index + 1) * 40}ms` }}
              >
                <span className="concept-card-emoji">{concept.emoji}</span>
                <div className="concept-card-title">{concept.title}</div>
                <div className="concept-card-subtitle">{concept.subtitle}</div>
                <div className="concept-card-domain-badge">{concept.domain}</div>
              </button>
            ))}
          </div>

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

        {showProfileModal && (
          <div className="profile-modal-overlay" onClick={() => setShowProfileModal(false)}>
            <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
              <h3>Customize your profile</h3>
              <div className="profile-form-row">
                <label>Avatar</label>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
