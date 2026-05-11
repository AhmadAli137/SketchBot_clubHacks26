'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ChevronDown, Map, Flame, HelpCircle, BarChart2 } from 'lucide-react';

import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { useGuidedTour } from '@/components/guided-tour/guided-tour-context';

import { Button } from '@/components/ui/button';
import { SaySparkLogo } from '@/components/sayspark-logo';
import { AGE_GROUP_META, type AgeGroup } from '@/lib/concept-types';
import { getConceptPreviews, ROBOT_LAB_CONCEPT_IDS } from '@/lib/concept-catalog';
import { SaveStatus } from '@/components/save-status';

import type { LearningHeaderProps } from './types';

export function LearningHeader({
  conceptId,
  conceptTitle,
  ageGroup,
  sysStatus,
  sysLabel,
  topStatus,
  showSimulator,
  showSystemStatus,
  studentName,
  xp = 0,
  level = 1,
  levelName = 'Doodler',
  levelEmoji = '✏️',
  xpProgress = 0,
  nextXP = 50,
  streakDays = 0,
  sparks = 0,
  creditsRemaining,
  monthlyCredits,
  planTier,
  profileAvatar,
  sessionId,
  isSandbox = false,
  onBackToHome,
  onAgeGroupChange,
  onOpenConceptMap,
  onConceptSelect,
  onToggleSystemStatus,
  onClosePopover,
  onChangeDifficulty,
}: LearningHeaderProps) {
  const { triggerTour } = useGuidedTour();
  const reducedMotion = usePrefersReducedMotion();
  const systemPanelRef = useRef<HTMLDivElement | null>(null);
  const conceptDropdownRef = useRef<HTMLDivElement | null>(null);
  const ageDropdownRef = useRef<HTMLDivElement | null>(null);
  const [showConceptDropdown, setShowConceptDropdown] = useState(false);
  const [showAgeDropdown, setShowAgeDropdown] = useState(false);

  const conceptPreviews = useMemo(() => getConceptPreviews(), []);
  const activeConcept = useMemo(
    () => (conceptId ? conceptPreviews.find((c) => c.id === conceptId) : undefined),
    [conceptPreviews, conceptId],
  );
  const headerConceptEmoji = activeConcept?.emoji ?? (conceptId ? '🗺️' : '✏️');
  const isRobotLab = Boolean(
    conceptId && (ROBOT_LAB_CONCEPT_IDS as readonly string[]).includes(conceptId),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClosePopover();
        setShowConceptDropdown(false);
        setShowAgeDropdown(false);
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (systemPanelRef.current?.contains(target)) return;
      if (conceptDropdownRef.current?.contains(target)) return;
      if (ageDropdownRef.current?.contains(target)) return;
      onClosePopover();
      setShowConceptDropdown(false);
      setShowAgeDropdown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [onClosePopover]);

  return (
    <>
      <header className="learn-header" data-tour="session-hub">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBackToHome}
          title="Back to main menu"
          className="rounded-[var(--radius-md)]"
        >
          <ArrowLeft size={13} />
          Menu
        </Button>

        <SaveStatus sessionId={sessionId ?? null} />

        {profileAvatar ? (
          <div className="learn-header-profile-avatar" title="Your profile look">
            {profileAvatar}
          </div>
        ) : null}

        {/* In sandbox the middle of the header is otherwise empty, so add a
            balancing spacer here that mirrors the one further right. Net
            effect: the brand floats visually centered between the left
            controls and the right controls. */}
        {isSandbox && <div className="learn-header-spacer" />}

        <div className="learn-header-brand">
          <SaySparkLogo size={26} showWordmark={false} animate={false} />
          <span className="learn-header-name">SaySpark</span>
        </div>

        {!isSandbox && <div className="learn-header-divider" />}

        {!isSandbox && (
        <div className="learn-concept-picker-wrapper" ref={conceptDropdownRef}>
          <button
            type="button"
            className="learn-concept-picker"
            title={conceptTitle}
            onClick={() => setShowConceptDropdown((v) => !v)}
          >
            <span className="learn-concept-emoji">{headerConceptEmoji}</span>
            <span className="learn-concept-name">{conceptTitle}</span>
            <ChevronDown size={12} style={{ opacity: 0.5, flexShrink: 0, transition: 'transform 120ms', transform: showConceptDropdown ? 'rotate(180deg)' : undefined }} />
          </button>

          {showConceptDropdown && (
            <div className="concept-dropdown">
              <button
                type="button"
                className={`concept-dropdown-item ${!conceptId ? 'active' : ''}`}
                onClick={() => {
                  onConceptSelect?.('', 'Free Draw');
                  setShowConceptDropdown(false);
                }}
              >
                <span className="concept-dropdown-emoji">✏️</span>
                <div className="concept-dropdown-text">
                  <span className="concept-dropdown-title">Free Draw</span>
                  <span className="concept-dropdown-sub">Open-ended creative drawing</span>
                </div>
              </button>
              {conceptPreviews.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`concept-dropdown-item ${conceptId === c.id ? 'active' : ''}`}
                  onClick={() => {
                    onConceptSelect?.(c.id, c.title);
                    setShowConceptDropdown(false);
                  }}
                >
                  <span className="concept-dropdown-emoji">{c.emoji}</span>
                  <div className="concept-dropdown-text">
                    <span className="concept-dropdown-title">{c.title}</span>
                    <span className="concept-dropdown-sub">{c.subtitle}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {!isSandbox && <div className="learn-header-divider" />}

        {!isSandbox && (
        <div className="gamification-bar" data-tour="gamification-bar" title={`Level ${level}: ${levelName} — ${xp} XP (${Math.round(xpProgress * 100)}% to next)`}>
          <span className="gamification-level-badge">
            <span className="gamification-level-emoji">{levelEmoji}</span>
            <span className="gamification-level-num">Lv.{level}</span>
          </span>
          <div className="gamification-xp-track">
            <div className="gamification-xp-fill" style={{ width: `${Math.round(xpProgress * 100)}%` }} />
          </div>
          <span className="gamification-xp-label">{xp} XP</span>
          {streakDays > 0 && (
            <span className={`gamification-streak ${streakDays >= 7 ? 'hot' : ''} ${streakDays >= 14 ? 'blazing' : ''}`} title={`${streakDays}-day streak!`}>
              <Flame size={13} />
              <span className="gamification-streak-num">{streakDays}</span>
            </span>
          )}
        </div>
        )}

        <div className="learn-header-spacer" />

        {!isSandbox && (
        <div className="learn-concept-picker-wrapper" ref={ageDropdownRef}>
          <button
            type="button"
            className="learn-concept-picker"
            title={AGE_GROUP_META[ageGroup].description}
            onClick={() => setShowAgeDropdown((v) => !v)}
          >
            <span className="learn-concept-emoji">{AGE_GROUP_META[ageGroup].emoji}</span>
            <span className="learn-concept-name">{AGE_GROUP_META[ageGroup].label}</span>
            <ChevronDown size={12} style={{ opacity: 0.5, flexShrink: 0, transition: 'transform 120ms', transform: showAgeDropdown ? 'rotate(180deg)' : undefined }} />
          </button>

          {showAgeDropdown && (
            <div className="concept-dropdown">
              {(Object.entries(AGE_GROUP_META) as [AgeGroup, (typeof AGE_GROUP_META)[AgeGroup]][]).map(([nextAgeGroup, meta]) => (
                <button
                  key={nextAgeGroup}
                  type="button"
                  className={`concept-dropdown-item ${ageGroup === nextAgeGroup ? 'active' : ''}`}
                  onClick={() => {
                    onAgeGroupChange(nextAgeGroup);
                    setShowAgeDropdown(false);
                  }}
                >
                  <span className="concept-dropdown-emoji">{meta.emoji}</span>
                  <div className="concept-dropdown-text">
                    <span className="concept-dropdown-title">{meta.label}</span>
                    <span className="concept-dropdown-sub">{meta.description}</span>
                  </div>
                </button>
              ))}
              {onChangeDifficulty && (
                <>
                  <div className="concept-dropdown-divider" />
                  <button
                    type="button"
                    className="concept-dropdown-item concept-dropdown-item-action"
                    onClick={() => {
                      setShowAgeDropdown(false);
                      onChangeDifficulty();
                    }}
                  >
                    <span className="concept-dropdown-emoji"><BarChart2 size={14} /></span>
                    <div className="concept-dropdown-text">
                      <span className="concept-dropdown-title">Re-take level assessment</span>
                      <span className="concept-dropdown-sub">Confirm or change your tier</span>
                    </div>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        )}

        {!isSandbox && <div className="learn-header-divider" />}

        <button
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8, flexShrink: 0, whiteSpace: 'nowrap' }}
          onClick={onToggleSystemStatus}
          title={sysLabel}
        >
          <motion.div
            key={sysStatus}
            className={`learn-sys-dot ${sysStatus}`}
            initial={reducedMotion ? false : { scale: 0.88, opacity: 0.85 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 26 }}
          />
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600 }}>{sysLabel}</span>
        </button>

        {!isSandbox && sparks > 0 && (
          <button
            type="button"
            className="header-sparks-pill"
            data-tour="header-sparks"
            onClick={onOpenConceptMap}
            title="Open your learning map to spend Sparks in the Avatar Shop"
          >
            <span>⚡</span>
            <motion.span key={sparks} initial={{ scale: 1.3 }} animate={{ scale: 1 }} transition={{ duration: 0.25 }}>
              {sparks}
            </motion.span>
          </button>
        )}

        {!isSandbox && creditsRemaining !== undefined && monthlyCredits !== undefined && (
          <div
            className={`header-credits-pill ${creditsRemaining <= 0 ? 'depleted' : creditsRemaining < monthlyCredits * 0.15 ? 'low' : ''}`}
            title={`${creditsRemaining} of ${monthlyCredits} AI credits remaining this month${planTier ? ` · ${planTier} plan` : ''}`}
          >
            <span>🤖</span>
            <span>{creditsRemaining < 0 ? '∞' : creditsRemaining}</span>
          </div>
        )}

        {!isSandbox && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenConceptMap}
            title="Learning path — lessons, unlocks, and your stats"
            className="rounded-[var(--radius-md)]"
            data-tour="header-map-btn"
          >
            <Map size={13} />
            Map
          </Button>
        )}

        <button
          type="button"
          className="learn-header-help-btn"
          onClick={() => triggerTour('studentSession')}
          title="Workspace walkthrough"
          aria-label="Workspace walkthrough"
        >
          <HelpCircle size={14} />
        </button>

      </header>

      {showSystemStatus && (
        <div className="learn-popover learn-system-popover" ref={systemPanelRef}>
          {topStatus.map(({ label, value }) => (
            <div key={label} className="learn-popover-row">
              <span className="learn-popover-label">{label}</span>
              <span className="learn-popover-value">{value}</span>
            </div>
          ))}
          <div className="learn-popover-foot">
            {(() => {
              // 'showSimulator' is camera-driven (no live video → show
              // the sandbox 3D scene). Telling the user "Hardware
              // offline" when the robot is actually connected is wrong
              // — split the message into camera vs robot concerns so
              // each piece of hardware is reported honestly.
              const robotValue = topStatus.find((s) => s.label === 'Robot')?.value;
              const cameraValue = topStatus.find((s) => s.label === 'Camera')?.value;
              const robotOnline  = robotValue  === 'Connected';
              const cameraOnline = cameraValue === 'Live';
              if (robotOnline && cameraOnline) return 'Hardware active';
              if (robotOnline && !cameraOnline) return 'Robot connected · simulator canvas (no camera)';
              if (!robotOnline && cameraOnline) return 'Camera live · simulator canvas (no robot paired)';
              return 'Hardware offline — using simulator';
            })()}
          </div>
        </div>
      )}
    </>
  );
}
