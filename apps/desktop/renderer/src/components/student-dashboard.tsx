'use client';

import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Cpu, Video, Code2, Send, Loader2, ChevronRight } from 'lucide-react';

import { ConceptMap } from '@/components/concept-map';
import { ProgressMap } from '@/components/progress-map';
import { TutorPanel } from '@/components/tutor-panel';
import type { BlockProgram } from '@/components/block-editor';
import { LearningHeader } from '@/components/student-dashboard/learning-header';
import { LearningStage } from '@/components/student-dashboard/learning-stage';
import { PromptComposer } from '@/components/student-dashboard/prompt-composer';
import { SimPlayground } from '@/components/sim-playground';
import type { StudentDashboardProps } from '@/components/student-dashboard/types';
import type { AgeGroup, ConceptLayer, InputMode } from '@/lib/concept-types';
import {
  awardBadge,
  saveDrawing,
  getStudentXPInfo,
  getSparks,
  getStreakInfo,
  getStudentProgress,
  getDifficultyLevel,
  updateStreak,
  recordInputModeUsed,
  scheduleProgressSync,
  setProgressSyncApiBase,
} from '@/lib/progress-store';
import type { ProfileAvatarKind } from '@/lib/concept-types';
import { StudentProfileAvatar } from '@/components/student-profile-avatar';
import { LevelUpCelebration, useXPToast } from '@/components/gamification';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { canUpload } from '@/lib/classroom-restrictions';
import { useEntitlements } from '@/lib/use-entitlements';
import { PaywallOverlay } from '@/components/paywall-overlay';
import { LessonHud } from '@/components/lesson-player/lesson-hud';
import { BotAvatar } from '@/components/lesson-player/bot-avatar';
import { useChallenges } from '@/lib/use-challenges';
import { challengeToLessonPlan } from '@/lib/challenge-to-lesson';
import { ROBOT_LAB_CONCEPT_IDS } from '@/lib/concept-catalog';

export function StudentDashboard({
  topStatus,
  backendReachable,
  cameraReady,
  robotReady,
  cameraSource,
  cameraSourceStatus,
  cameraFrameUrl,
  companionConnectionStatus,
  browserCameraStatus,
  companionBackendUrl,
  classroomJoinCode,
  browserCameraReady,
  phoneViewerReady,
  videoRef,
  sourceSaving,
  backendLinkCopied,
  canvasDetected,
  aprilTagDetections,
  canvasBorder,
  liveCameraOverlayUrl,
  liveMarkerOverlayUrl,
  prompt,
  composing,
  uploading,
  featuredTasks,
  activeJobName,
  conceptId = null,
  conceptTitle = 'Free Draw',
  ageGroup: ageGroupProp = 'explorer',
  studentName = '',
  apiBase = '',
  lessonPlanActive = false,
  activeChallengeId = null,
  onChallengeComplete,
  appMode = 'sandbox',
  classroomRestrictions,
  userRole = 'student',
  onConceptSelect,
  onBackToHome,
  onChangeDifficulty,
  onVideoMount,
  onActivateCompanionCamera,
  onActivateBrowserCamera,
  onDeactivateCamera,
  onCopyBackendUrl,
  onPromptChange,
  onSubmitPrompt,
  onUploadFile,
  onLoadTask,
}: StudentDashboardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const sessionActorRole: 'teacher' | 'student' = userRole === 'teacher' ? 'teacher' : 'student';
  const uploadDisabled = userRole === 'student' && classroomRestrictions && !canUpload(classroomRestrictions);
  const isRobotChallenge = conceptId != null && (ROBOT_LAB_CONCEPT_IDS as readonly string[]).includes(conceptId);
  type WorkspaceTab = 'simulator' | 'live' | 'programming';

  const [activeLayer, setActiveLayer] = useState<ConceptLayer>('intuitive');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(ageGroupProp);
  const [showSystemStatus, setShowSystemStatus] = useState(false);
  const [showConceptMap, setShowConceptMap] = useState(false);
  const [celebrationBadge, setCelebrationBadge] = useState<{ emoji: string; name: string } | null>(null);
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState<string | null>(null);
  const difficultyLevel = studentName ? (getDifficultyLevel(studentName) ?? ageGroupProp) : ageGroupProp;
  const { entitlements, refresh: refreshEntitlements } = useEntitlements(userRole !== 'guest');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'rules' | 'blocks' | 'code' | 'arduino'>(
    difficultyLevel === 'explorer' ? 'rules' : difficultyLevel === 'engineer' ? 'arduino' : 'blocks',
  );
  const [codeGeneratedSvg, setCodeGeneratedSvg] = useState<string | null>(null);
  const [blockPreviewSvg, setBlockPreviewSvg] = useState<string | null>(null);
  const [cameraBuddyQrUrl, setCameraBuddyQrUrl] = useState<string | null>(null);
  const [forceSimulator, setForceSimulator] = useState(false);
  const [liveViewRequested, setLiveViewRequested] = useState(false);
  const [showCameraDropToast, setShowCameraDropToast] = useState(false);
  const cameraWasReadyRef = useRef(false);
  const [showCodeFocus, setShowCodeFocus] = useState(false);
  const [blockRunnerNotice, setBlockRunnerNotice] = useState<string | null>(null);
  const [tutorCollapsed, setTutorCollapsed] = useState(false);
  const [primaryTab, setPrimaryTab] = useState<WorkspaceTab>('simulator');
  const [secondaryTab, setSecondaryTab] = useState<WorkspaceTab | null>('programming');
  const [showPromptGallery, setShowPromptGallery] = useState(false);
  const workspaceCameraRef = useRef<HTMLDivElement | null>(null);

  // Challenge lesson player
  const { packs: challengePacks } = useChallenges('sketchbot', apiBase || undefined);
  // effectiveChallengeId: explicit prop takes priority; if absent, auto-detect
  // the first challenge for the current concept once packs have loaded.
  const [effectiveChallengeId, setEffectiveChallengeId] = useState<string | null>(activeChallengeId);
  useEffect(() => {
    if (activeChallengeId) { setEffectiveChallengeId(activeChallengeId); return; }
  }, [activeChallengeId]);
  // Reset when concept changes so the auto-detect picks the right challenge
  useEffect(() => {
    if (!activeChallengeId) setEffectiveChallengeId(null);
  }, [conceptId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (effectiveChallengeId) return;
    if (!conceptId || challengePacks.length === 0) return;
    const match = challengePacks.find((p) => p.conceptId === conceptId);
    const first = match?.challenges[0];
    if (first) setEffectiveChallengeId(first.id);
  }, [effectiveChallengeId, conceptId, challengePacks]);
  const activeChallenge = useMemo(() => {
    if (!effectiveChallengeId) return null;
    for (const pack of challengePacks) {
      const found = pack.challenges.find((c) => c.id === effectiveChallengeId);
      if (found) return { challenge: found, pack };
    }
    return null;
  }, [effectiveChallengeId, challengePacks]);
  const lessonPlan = useMemo(
    () => (activeChallenge ? challengeToLessonPlan(activeChallenge.challenge, ageGroup) : null),
    [activeChallenge, ageGroup],
  );
  const handleDrawingRequest = (drawPrompt: string) => {
    onPromptChange(drawPrompt);
    setLastSubmittedPrompt(drawPrompt);
    awaitingResultRef.current = true;
    trackInputMode('language');
    onSubmitPrompt({ preventDefault: () => {} } as FormEvent);
  };
  const handleLessonComplete = () => {
    setEffectiveChallengeId(null);
    onChallengeComplete?.();
  };

  // Confirmation flow: a newly-generated drawing must be approved by the
  // student before the simulator actually starts drawing it.
  const [approvedSvg, setApprovedSvg] = useState<string | null>(null);
  const [pendingTask, setPendingTask] = useState<{ svg: string; label: string } | null>(null);
  const awaitingResultRef = useRef(false);
  const hasInitializedSvgRef = useRef(false);

  const [gamificationData, setGamificationData] = useState<{
    xp: number; level: number; levelName: string; levelEmoji: string; progress: number; nextXP: number; streakDays: number;
  }>({ xp: 0, level: 1, levelName: 'Doodler', levelEmoji: '✏️', progress: 0, nextXP: 50, streakDays: 0 });

  const [profileAppearance, setProfileAppearance] = useState<{
    kind: ProfileAvatarKind;
    emoji: string;
    robotPreset: string;
    color: string;
  }>({ kind: 'emoji', emoji: '🤖', robotPreset: 'orbit', color: 'var(--cyan)' });

  const xpToast = useXPToast();

  const [levelUpData, setLevelUpData] = useState<null | {
    newLevel: number;
    levelName: string;
    levelEmoji: string;
    previousXP: number;
    newXP: number;
    xpAwarded: number;
  }>(null);

  const prevXPRef = useRef<number>(0);
  const prevLevelRef = useRef<number>(1);

  const refreshGamification = (opts?: { reason?: string; emoji?: string; silent?: boolean }) => {
    if (!studentName) return;
    const xpInfo = getStudentXPInfo(studentName);
    const streakInfo = getStreakInfo(studentName);
    if (xpInfo) {
      const previousXP = prevXPRef.current;
      const previousLevel = prevLevelRef.current;
      const xpDelta = xpInfo.xp - previousXP;

      setGamificationData({
        xp: xpInfo.xp,
        level: xpInfo.level,
        levelName: xpInfo.levelName,
        levelEmoji: xpInfo.levelEmoji,
        progress: xpInfo.progress,
        nextXP: xpInfo.nextXP,
        streakDays: streakInfo?.current_streak_days ?? 0,
      });

      if (!opts?.silent && xpDelta > 0 && previousXP > 0) {
        xpToast.push(xpDelta, { reason: opts?.reason, emoji: opts?.emoji ?? '⭐' });
      }

      if (xpInfo.level > previousLevel && previousLevel >= 1 && previousXP > 0) {
        setLevelUpData({
          newLevel: xpInfo.level,
          levelName: xpInfo.levelName,
          levelEmoji: xpInfo.levelEmoji,
          previousXP,
          newXP: xpInfo.xp,
          xpAwarded: xpDelta,
        });
      }

      prevXPRef.current = xpInfo.xp;
      prevLevelRef.current = xpInfo.level;

      scheduleProgressSync(studentName);
    }

    const sp = getStudentProgress(studentName, ageGroup);
    setProfileAppearance({
      kind: sp.profile_avatar_kind ?? 'emoji',
      emoji: sp.avatar ?? '🤖',
      robotPreset: sp.robot_preset ?? 'orbit',
      color: sp.favorite_color ?? 'var(--cyan)',
    });
  };

  useEffect(() => {
    setProgressSyncApiBase(apiBase || null);
  }, [apiBase]);

  useEffect(() => {
    if (studentName) {
      const streakResult = updateStreak(studentName);
      refreshGamification({ silent: true });
      if (streakResult && streakResult.xpAwarded > 0) {
        xpToast.push(streakResult.xpAwarded, {
          reason: `🔥 ${streakResult.current}-day streak`,
          emoji: '🔥',
        });
        refreshGamification({ silent: true });
      }
    }
  }, [studentName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAgeGroup(ageGroupProp);
  }, [ageGroupProp]);

  useEffect(() => {
    let cancelled = false;

    if (!companionBackendUrl) {
      setCameraBuddyQrUrl(null);
      return;
    }

    QRCode.toDataURL(companionBackendUrl, {
      margin: 1,
      width: 220,
      color: {
        dark: '#12304a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) {
          setCameraBuddyQrUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCameraBuddyQrUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [companionBackendUrl]);

  useEffect(() => {
    if (!studentName || !cameraReady) {
      return;
    }

    const isNew = awardBadge(studentName, 'first-drawing');
    if (!isNew) {
      return;
    }

    setCelebrationBadge({ emoji: '✏️', name: 'First Drawing' });
    refreshGamification();
    const timeout = window.setTimeout(() => setCelebrationBadge(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [cameraReady, studentName]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasLiveCamera =
    cameraReady &&
    ((cameraSource === 'phone-webrtc' && phoneViewerReady) ||
      (cameraSource === 'browser-camera' && browserCameraReady) ||
      (cameraSource !== 'phone-webrtc' && cameraSource !== 'browser-camera' && Boolean(cameraFrameUrl)));

  const shouldMountVideo =
    (cameraSource === 'browser-camera' && browserCameraReady) ||
    (cameraSource === 'phone-webrtc' && phoneViewerReady);
  const cameraConnecting =
    !shouldMountVideo &&
    ((cameraSource === 'browser-camera' && !browserCameraReady) ||
     (cameraSource === 'phone-webrtc' && !phoneViewerReady &&
      cameraSourceStatus !== 'awaiting-publisher' && cameraSourceStatus !== 'awaiting-session'));
  const cameraDisconnected =
    !cameraReady &&
    (cameraSource === 'companion-camera' || cameraSource === 'browser-camera' || cameraSource === 'phone-webrtc');

  const showLiveCameraShell =
    !forceSimulator &&
    (hasLiveCamera ||
      shouldMountVideo ||
      (cameraReady && Boolean(cameraFrameUrl)) ||
      cameraSource === 'companion-camera' ||
      cameraSource === 'external-camera' ||
      cameraSource === 'kit-webrtc');
  const showSimulator = forceSimulator || !hasLiveCamera;
  const cameraWaitingMessage =
    cameraSource === 'phone-webrtc'
      ? companionConnectionStatus
      : cameraSource === 'browser-camera'
        ? browserCameraStatus
        : cameraReady
          ? 'Waiting for the latest camera frame to arrive.'
          : null;

  // Show a brief toast only when the camera *drops* after being live — not on initial connection
  useEffect(() => {
    if (cameraReady) {
      cameraWasReadyRef.current = true;
      setShowCameraDropToast(false);
    } else if (cameraWasReadyRef.current && cameraDisconnected) {
      setShowCameraDropToast(true);
      const timer = setTimeout(() => setShowCameraDropToast(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [cameraReady, cameraDisconnected]);

  const sysStatus: 'live' | 'sim' | 'error' =
    hasLiveCamera && robotReady ? 'live' : hasLiveCamera ? 'sim' : !backendReachable ? 'error' : 'sim';

  const sysLabel = sysStatus === 'live' ? 'Live' : sysStatus === 'error' ? 'Offline' : 'Simulator';

  const featuredSvgContent = useMemo(() => {
    if (interactionMode === 'blocks') return blockPreviewSvg ?? codeGeneratedSvg ?? featuredTasks[0]?.svg_content ?? null;
    if (interactionMode === 'arduino') return featuredTasks[0]?.svg_content ?? null;
    return codeGeneratedSvg ?? featuredTasks[0]?.svg_content ?? null;
  }, [blockPreviewSvg, codeGeneratedSvg, featuredTasks, interactionMode]);

  useEffect(() => {
    if (!hasLiveCamera) return;
    if (primaryTab === 'live' || secondaryTab === 'live') return;
    setPrimaryTab('live');
  }, [hasLiveCamera]); // eslint-disable-line react-hooks/exhaustive-deps

  const splitEnabled = secondaryTab !== null;

  const resolveDefaultSecondary = (currentPrimary: WorkspaceTab) => {
    if (currentPrimary === 'programming') return hasLiveCamera ? 'live' : 'simulator';
    return 'programming';
  };


  const trackInputMode = (mode: InputMode) => {
    if (!studentName) return;
    const newBadges = recordInputModeUsed(studentName, mode);
    if (newBadges.length > 0) {
      refreshGamification({ silent: true });
    }
  };

  const handlePromptSubmit = (event: FormEvent) => {
    setLastSubmittedPrompt(prompt);
    awaitingResultRef.current = true;
    trackInputMode('language');
    onSubmitPrompt(event);
  };

  const handleInteractionModeChange = (mode: 'rules' | 'blocks' | 'code' | 'arduino') => {
    setInteractionMode(mode);
    setPrimaryTab('programming');
    setBlockRunnerNotice(null);
    if (mode !== 'rules' && mode !== 'arduino') trackInputMode(mode);
  };

  // Watch for newly generated SVG content. On the very first non-null value
  // (initial load or restored state), auto-approve silently. After that, every
  // change requires explicit confirmation from the student.
  useEffect(() => {
    if (!featuredSvgContent) return;
    if (featuredSvgContent === approvedSvg) return;
    if (pendingTask && pendingTask.svg === featuredSvgContent) return;

    if (!hasInitializedSvgRef.current && !awaitingResultRef.current) {
      setApprovedSvg(featuredSvgContent);
      hasInitializedSvgRef.current = true;
      return;
    }

    // When a lesson is active, the drawing was triggered by the lesson HUD —
    // auto-approve it so the simulator starts immediately (no confirmation toast).
    if (lessonPlan) {
      setApprovedSvg(featuredSvgContent);
      awaitingResultRef.current = false;
      hasInitializedSvgRef.current = true;
      return;
    }

    setPendingTask({
      svg: featuredSvgContent,
      label: lastSubmittedPrompt?.trim() || 'your new drawing',
    });
    awaitingResultRef.current = false;
    hasInitializedSvgRef.current = true;
  }, [featuredSvgContent, approvedSvg, pendingTask, lastSubmittedPrompt, lessonPlan]);

  const confirmPendingTask = () => {
    if (!pendingTask) return;
    setApprovedSvg(pendingTask.svg);
    setPendingTask(null);
  };

  const dismissPendingTask = () => {
    setPendingTask(null);
  };

  const renderWorkspace = (tab: WorkspaceTab) => {
    if (tab === 'simulator') {
      return (
        <SimPlayground
          svgContent={approvedSvg}
          isGenerating={composing || Boolean(pendingTask)}
          style={{ position: 'absolute', inset: 0 }}
          conceptId={conceptId}
          activeLayer={activeLayer}
        />
      );
    }

    if (tab === 'live') {
      return (
        <LearningStage
          showSimulator={false}
          shouldMountVideo={shouldMountVideo}
          cameraConnecting={cameraConnecting}
          cameraFrameUrl={cameraFrameUrl}
          cameraBuddyQrUrl={cameraBuddyQrUrl}
          classroomJoinCode={classroomJoinCode}
          sourceSaving={sourceSaving}
          backendLinkCopied={backendLinkCopied}
          cameraSource={cameraSource}
          browserCameraStatus={browserCameraStatus}
          companionConnectionStatus={companionConnectionStatus}
          cameraWaitingMessage={cameraWaitingMessage}
          cameraReady={cameraReady}
          canvasDetected={canvasDetected}
          liveCameraOverlayUrl={liveCameraOverlayUrl}
          liveMarkerOverlayUrl={liveMarkerOverlayUrl}
          aprilTagDetections={aprilTagDetections}
          canvasBorder={canvasBorder}
          videoRef={videoRef}
          onVideoMount={onVideoMount}
          composing={composing}
          featuredSvgContent={approvedSvg}
          workspaceCameraRef={workspaceCameraRef}
          onActivateCompanionCamera={() => {
            setForceSimulator(false);
            setLiveViewRequested(true);
            onActivateCompanionCamera();
          }}
          onActivateBrowserCamera={() => {
            setForceSimulator(false);
            setLiveViewRequested(true);
            onActivateBrowserCamera();
          }}
          onDeactivateCamera={() => {
            setForceSimulator(true);
            setLiveViewRequested(false);
            onDeactivateCamera();
          }}
          onCopyBackendUrl={onCopyBackendUrl}
        />
      );
    }

    return (
      <div className="workspace-programming">
        {blockRunnerNotice && (
          <div className="block-runner-notice" role="alert">
            <span>{blockRunnerNotice}</span>
            <button type="button" className="block-runner-notice-dismiss" onClick={() => setBlockRunnerNotice(null)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        {!isRobotChallenge && <PromptComposer
          interactionMode={interactionMode}
          difficultyLevel={difficultyLevel}
          activeLayer={activeLayer}
          prompt={prompt}
          composing={composing}
          uploading={uploading}
          featuredTasks={featuredTasks}
          conceptId={conceptId}
          apiBase={apiBase}
          showCodeFocus={showCodeFocus}
          onPromptChange={onPromptChange}
          onSubmitPrompt={handlePromptSubmit}
          onUploadFile={onUploadFile}
          onLoadTask={onLoadTask}
          onInteractionModeChange={handleInteractionModeChange}
          onBlockRun={handleBlockRun}
          onBlockPreviewSvgChange={setBlockPreviewSvg}
          onCodeSvgResult={(svg) => {
            awaitingResultRef.current = true;
            setCodeGeneratedSvg(svg);
            setLastSubmittedPrompt('code execution result');
            trackInputMode('code');
          }}
          onRulesRun={async (rules) => {
            setBlockRunnerNotice(null);
            try {
              await fetch(`${apiBase}/api/block-runner/rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ concept_id: conceptId, rules }),
              });
            } catch {
              setBlockRunnerNotice('Could not send rules to the robot. Is the runtime running?');
            }
          }}
          onToggleCodeFocus={() => setShowCodeFocus((value) => !value)}
        />}
      </div>
    );
  };

  const handleBlockRun = async (program: BlockProgram) => {
    setBlockRunnerNotice(null);
    awaitingResultRef.current = true;
    trackInputMode('blocks');
    try {
      const response = await fetch(`${apiBase}/api/block-runner/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          concept_id: conceptId,
          program,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        svg?: string | null;
        task_name?: string | null;
      };

      if (!response.ok || payload.ok === false) {
        awaitingResultRef.current = false;
        setBlockRunnerNotice(payload.message || 'Block execution failed.');
        setLastSubmittedPrompt('Block runner notice');
        return;
      }

      if (payload.svg) {
        setCodeGeneratedSvg(payload.svg);
      }
      setLastSubmittedPrompt(payload.task_name || conceptTitle || 'block program');
    } catch (error) {
      awaitingResultRef.current = false;
      setBlockRunnerNotice(
        error instanceof Error ? error.message : 'Could not reach the block runner. Is the local backend running?',
      );
      setLastSubmittedPrompt('Block runner error');
    }
  };

  useEffect(() => {
    if (!cameraReady || !studentName || !activeJobName) {
      return;
    }
    if (sessionActorRole === 'teacher') {
      return;
    }

    saveDrawing(studentName, {
      prompt: activeJobName,
      concept_id: conceptId ?? undefined,
      layer: activeLayer,
    });
    refreshGamification();
  }, [cameraReady, activeJobName, studentName, conceptId, activeLayer, sessionActorRole]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="app-shell learning-app-shell"
      data-session-actor={sessionActorRole}
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}
    >
      {lessonPlanActive ? (
        <div className="lesson-plan-session-bar" role="status">
          Lesson plan session — follow your class steps below.
        </div>
      ) : null}
      <LearningHeader
        conceptId={conceptId}
        conceptTitle={conceptTitle}
        ageGroup={ageGroup}
        sysStatus={sysStatus}
        sysLabel={sysLabel}
        topStatus={topStatus}
        showSimulator={showSimulator}
        showSystemStatus={showSystemStatus}
        studentName={studentName}
        xp={gamificationData.xp}
        level={gamificationData.level}
        levelName={gamificationData.levelName}
        levelEmoji={gamificationData.levelEmoji}
        xpProgress={gamificationData.progress}
        nextXP={gamificationData.nextXP}
        streakDays={gamificationData.streakDays}
        sparks={studentName ? getSparks(studentName) : 0}
        creditsRemaining={entitlements?.credits_remaining}
        monthlyCredits={entitlements?.monthly_credits}
        planTier={entitlements?.tier}
        profileAvatar={
          studentName ? (
            <StudentProfileAvatar
              kind={profileAppearance.kind}
              emoji={profileAppearance.emoji}
              robotPresetId={profileAppearance.robotPreset}
              accent={profileAppearance.color}
              size={34}
            />
          ) : undefined
        }
        onBackToHome={onBackToHome}
        onAgeGroupChange={setAgeGroup}
        onOpenConceptMap={() => setShowConceptMap(true)}
        onConceptSelect={onConceptSelect}
        onToggleSystemStatus={() => setShowSystemStatus((v) => !v)}
        onClosePopover={() => setShowSystemStatus(false)}
        onChangeDifficulty={onChangeDifficulty}
      />

      {entitlements?.status === 'trialing' && entitlements.trial_end && (() => {
        const msLeft = new Date(entitlements.trial_end).getTime() - Date.now();
        const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
        return (
          <div className="trial-banner" role="status">
            <span className="trial-banner-icon">⏳</span>
            <span>
              <strong>{daysLeft === 0 ? 'Trial ends today' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left in your trial`}</strong>
              {' — '}your {entitlements.tier} plan features are active until trial ends.
            </span>
            <a href="https://sketch-bot-club-hacks26.vercel.app/pricing" target="_blank" rel="noreferrer" className="trial-banner-link">
              Manage plan →
            </a>
          </div>
        );
      })()}

      <div className={`workspace-root${tutorCollapsed ? ' tutor-collapsed' : ''}`} style={{ flex: 1, minHeight: 0 }}>
        {/* Workspace column: canvas panes + floating prompt bar */}
        <div className="workspace-column">
        <div className={`workspace-main ${splitEnabled ? 'split' : ''}`} style={{ minHeight: 0 }}>
          <div className="workspace-pane">
            <div className="workspace-tabs" data-tour="session-tabs">
              {(['simulator', 'live', 'programming'] as WorkspaceTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`workspace-tab ${primaryTab === tab ? 'active' : ''}`}
                  onClick={() => {
                    setPrimaryTab(tab);
                    if (secondaryTab === tab) {
                      setSecondaryTab(resolveDefaultSecondary(tab));
                    }
                  }}
                  disabled={secondaryTab === tab}
                >
                  {tab === 'simulator' ? <><Cpu size={13} />Simulator</> : tab === 'live' ? <><Video size={13} />Live Camera</> : <><Code2 size={13} />Code</>}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexShrink: 0 }}>
                {splitEnabled ? (
                  <button
                    type="button"
                    className="workspace-tab workspace-tab-close"
                    onClick={() => {
                      if (secondaryTab) {
                        setPrimaryTab(secondaryTab);
                      }
                      setSecondaryTab(null);
                    }}
                    title="Close this pane"
                    aria-label="Close pane"
                  >
                    ×
                  </button>
                ) : (
                  <button
                    type="button"
                    className="workspace-tab workspace-tab-subtle"
                    onClick={() => setSecondaryTab(resolveDefaultSecondary(primaryTab))}
                    title="Open split view"
                  >
                    Split view
                  </button>
                )}
              </div>
            </div>
            <div className="workspace-pane-body" style={{ position: 'relative' }}>
              {renderWorkspace(primaryTab)}
              {lessonPlan && (
                <LessonHud
                  plan={lessonPlan}
                  studentName={studentName}
                  apiBase={apiBase}
                  reducedMotion={reducedMotion}
                  onDrawingRequest={handleDrawingRequest}
                  onComplete={handleLessonComplete}
                  onXPChange={refreshGamification}
                />
              )}
            </div>
          </div>

          {secondaryTab ? (
            <div className="workspace-pane">
              <div className="workspace-tabs">
                {(['simulator', 'live', 'programming'] as WorkspaceTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`workspace-tab ${secondaryTab === tab ? 'active' : ''}`}
                    onClick={() => setSecondaryTab(tab)}
                    disabled={primaryTab === tab}
                  >
                    {tab === 'simulator' ? <><Cpu size={13} />Simulator</> : tab === 'live' ? <><Video size={13} />Live Camera</> : <><Code2 size={13} />Code</>}
                  </button>
                ))}
                <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                  <button
                    type="button"
                    className="workspace-tab workspace-tab-close"
                    onClick={() => setSecondaryTab(null)}
                    title="Close this pane"
                    aria-label="Close pane"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="workspace-pane-body">{renderWorkspace(secondaryTab)}</div>
            </div>
          ) : null}
        </div>

        {/* Floating prompt bar — free-draw and drawing concepts only, never for robot challenges */}
        {appMode === 'sandbox' && !isRobotChallenge && (
        <div className="floating-prompt-bar" data-tour="session-prompt">
          <form
            className="floating-prompt-form"
            onSubmit={(e) => { e.preventDefault(); handlePromptSubmit(e); }}
          >
            <button
              type="button"
              className="floating-prompt-gallery-btn"
              onClick={() => setShowPromptGallery((v) => !v)}
              title="Prompt gallery"
              aria-label="Open prompt gallery"
            >
              🗂
            </button>
            <textarea
              className="floating-prompt-input"
              rows={1}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder={composing ? 'Generating…' : 'Describe what to draw…'}
              disabled={composing}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handlePromptSubmit(e as unknown as FormEvent);
                }
              }}
            />
            <label
              className="floating-prompt-upload"
              title={uploadDisabled ? 'Upload disabled by your teacher' : 'Upload image'}
              style={{
                opacity: uploadDisabled ? 0.35 : 1,
                pointerEvents: uploadDisabled ? 'none' : undefined,
              }}
            >
              <input type="file" accept=".svg,image/*" onChange={onUploadFile} style={{ display: 'none' }} disabled={uploadDisabled} />
              📎
            </label>
            <motion.button
              type="submit"
              className="floating-prompt-submit"
              disabled={composing || uploading || !prompt.trim()}
              whileTap={
                reducedMotion || composing || uploading || !prompt.trim()
                  ? undefined
                  : { scale: 0.94 }
              }
              transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 28 }}
            >
              {composing
                ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                : <><Send size={13} />Generate</>}
            </motion.button>
          </form>

          {/* Prompt gallery panel */}
          {showPromptGallery && (
            <div className="prompt-gallery-panel">
              <div className="prompt-gallery-header">
                <span>Prompt Gallery</span>
                <button type="button" className="prompt-gallery-close" onClick={() => setShowPromptGallery(false)}>✕</button>
              </div>
              <div className="prompt-gallery-grid">
                {featuredTasks.length === 0 && (
                  <div className="prompt-gallery-empty">No saved drawings yet. Generate something!</div>
                )}
                {featuredTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="prompt-gallery-item"
                    onClick={() => {
                      onLoadTask(task);
                      setShowPromptGallery(false);
                    }}
                    title={task.prompt ?? task.name ?? undefined}
                  >
                    {task.svg_content ? (
                      <div
                        className="prompt-gallery-thumb"
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: task.svg_content }}
                      />
                    ) : (
                      <div className="prompt-gallery-thumb-empty">✏️</div>
                    )}
                    <span className="prompt-gallery-label">
                      {task.name ?? task.prompt?.slice(0, 30) ?? 'Drawing'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        )}{/* end floating-prompt-bar conditional */}
        </div>{/* end workspace-column */}

        {tutorCollapsed ? (
          <motion.button
            type="button"
            className={`tutor-drawer-handle ${pendingTask ? 'has-notification' : ''}`}
            onClick={() => setTutorCollapsed(false)}
            title={pendingTask ? 'Sketch has a drawing ready!' : 'Open Sketch tutor'}
            aria-label="Open Sketch tutor"
            initial={reducedMotion ? false : { x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reducedMotion ? undefined : { x: 20, opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
            whileHover={reducedMotion ? undefined : { scale: 1.08 }}
            whileTap={reducedMotion ? undefined : { scale: 0.93 }}
          >
            <BotAvatar emotion={pendingTask ? 'excited' : 'idle'} size={28} />
            {pendingTask && <span className="tutor-drawer-badge" aria-hidden="true">1</span>}
          </motion.button>
        ) : null}

        <div className={`tutor-dock ${tutorCollapsed ? 'collapsed' : ''}`}>
          <div className="tutor-dock-header">
            <BotAvatar emotion="idle" size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tutor-dock-title">Sketch</div>
              <div className="tutor-dock-subtitle">Your robot tutor</div>
            </div>
            <button type="button" className="btn-ghost tutor-dock-minimize" onClick={() => setTutorCollapsed(true)} title="Minimize">
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="tutor-dock-body">
            <TutorPanel
              studentName={studentName}
              ageGroup={ageGroup}
              conceptId={conceptId}
              conceptTitle={conceptTitle}
              activeLayer={activeLayer}
              apiBase={apiBase}
              drawingPrompt={lastSubmittedPrompt}
              pathCount={featuredTasks[0]?.path_count ?? 0}
              backendReachable={backendReachable}
              onLayerChange={setActiveLayer}
              onXPChange={refreshGamification}
              sessionActorRole={sessionActorRole}
              lessonPlanActive={lessonPlanActive}
              classroomRestrictions={userRole === 'student' ? classroomRestrictions : undefined}
            />
          </div>
        </div>
      </div>

      {pendingTask && !lessonPlan && !isRobotChallenge && (
        <div className="sketch-notify-card" role="dialog" aria-live="polite" aria-labelledby="sketch-notify-title">
          <div className="sketch-notify-avatar" aria-hidden="true">🤖</div>
          <div className="sketch-notify-body">
            <div className="sketch-notify-header">
              <span className="sketch-notify-name">Sketch</span>
              <span className="sketch-notify-tag">new drawing</span>
            </div>
            <div id="sketch-notify-title" className="sketch-notify-title">
              I finished <em>{pendingTask.label}</em>!
            </div>
            <div className="sketch-notify-copy">
              Ready for me to start drawing it in the simulator?
            </div>
            <div className="sketch-notify-actions">
              <button type="button" className="sketch-notify-btn ghost" onClick={dismissPendingTask}>
                Not yet
              </button>
              <button type="button" className="sketch-notify-btn primary" onClick={confirmPendingTask}>
                ▶ Start drawing
              </button>
            </div>
          </div>
          <button
            type="button"
            className="sketch-notify-dismiss"
            onClick={dismissPendingTask}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {showConceptMap && (
        <ProgressMap
          studentName={studentName}
          ageGroup={ageGroup}
          onConceptSelect={(nextConceptId, nextConceptTitle) => {
            onConceptSelect?.(nextConceptId, nextConceptTitle);
          }}
          onClose={() => setShowConceptMap(false)}
        />
      )}

      {showCameraDropToast && (
        <div className="camera-drop-toast" onClick={() => setShowCameraDropToast(false)}>
          <span>📷</span>
          <span>Camera disconnected — check your connection or switch to Simulator.</span>
          <button type="button" className="camera-drop-toast-dismiss" aria-label="Dismiss">✕</button>
        </div>
      )}

      {celebrationBadge && (
        <div className="celebration-overlay" onClick={() => setCelebrationBadge(null)}>
          <div className="celebration-card">
            <div className="celebration-emoji">{celebrationBadge.emoji}</div>
            <div className="celebration-title">Badge Earned!</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>{celebrationBadge.name}</div>
            <div className="celebration-body">Keep exploring to unlock more concepts and badges.</div>
            <button type="button" className="btn-cta" style={{ marginTop: 4 }} onClick={() => setCelebrationBadge(null)}>
              Continue Learning
            </button>
          </div>
        </div>
      )}


      <LevelUpCelebration
        show={Boolean(levelUpData)}
        newLevel={levelUpData?.newLevel ?? 1}
        levelName={levelUpData?.levelName ?? ''}
        levelEmoji={levelUpData?.levelEmoji ?? '✨'}
        previousXP={levelUpData?.previousXP ?? 0}
        newXP={levelUpData?.newXP ?? 0}
        xpAwarded={levelUpData?.xpAwarded ?? 0}
        onDismiss={() => setLevelUpData(null)}
      />

      {paywallVisible && entitlements && (
        <PaywallOverlay
          entitlements={entitlements}
          feature="AI Tutor"
          onDismiss={() => { setPaywallVisible(false); void refreshEntitlements(); }}
        />
      )}
    </div>
  );
}
