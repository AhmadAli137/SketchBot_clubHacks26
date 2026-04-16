'use client';

import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { ConceptMap } from '@/components/concept-map';
import { TutorPanel } from '@/components/tutor-panel';
import type { BlockProgram } from '@/components/block-editor';
import { LearningHeader } from '@/components/student-dashboard/learning-header';
import { LearningStage } from '@/components/student-dashboard/learning-stage';
import { PromptComposer } from '@/components/student-dashboard/prompt-composer';
import type { StudentDashboardProps } from '@/components/student-dashboard/types';
import type { AgeGroup, ConceptLayer } from '@/lib/concept-types';
import { awardBadge, saveDrawing } from '@/lib/progress-store';

export function StudentDashboard({
  topStatus,
  backendReachable,
  cameraReady,
  robotReady,
  cameraSource,
  cameraFrameUrl,
  companionConnectionStatus,
  browserCameraStatus,
  companionBackendUrl,
  browserCameraReady,
  phoneViewerReady,
  liveVideoAspectRatio,
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
  onConceptSelect,
  onBackToHome,
  onActivateCompanionCamera,
  onActivateBrowserCamera,
  onCopyBackendUrl,
  onPromptChange,
  onSubmitPrompt,
  onUploadFile,
  onLoadTask,
}: StudentDashboardProps) {
  const [activeLayer, setActiveLayer] = useState<ConceptLayer>('intuitive');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(ageGroupProp);
  const [showCameraControls, setShowCameraControls] = useState(false);
  const [showSystemStatus, setShowSystemStatus] = useState(false);
  const [showConceptMap, setShowConceptMap] = useState(false);
  const [celebrationBadge, setCelebrationBadge] = useState<{ emoji: string; name: string } | null>(null);
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<'language' | 'blocks' | 'code'>('language');
  const [codeGeneratedSvg, setCodeGeneratedSvg] = useState<string | null>(null);
  const [blockPreviewSvg, setBlockPreviewSvg] = useState<string | null>(null);
  const [cameraBuddyQrUrl, setCameraBuddyQrUrl] = useState<string | null>(null);
  const workspaceCameraRef = useRef<HTMLDivElement | null>(null);

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
    const timeout = window.setTimeout(() => setCelebrationBadge(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [cameraReady, studentName]);

  const hasLiveCamera =
    cameraReady &&
    ((cameraSource === 'phone-webrtc' && phoneViewerReady) ||
      (cameraSource === 'browser-camera' && browserCameraReady) ||
      (cameraSource !== 'phone-webrtc' && cameraSource !== 'browser-camera' && Boolean(cameraFrameUrl)));

  const shouldMountVideo = cameraSource === 'browser-camera' || cameraSource === 'phone-webrtc';
  const showLiveCameraShell =
    hasLiveCamera ||
    shouldMountVideo ||
    (cameraReady && Boolean(cameraFrameUrl)) ||
    cameraSource === 'companion-camera' ||
    cameraSource === 'external-camera' ||
    cameraSource === 'kit-webrtc';
  const showSimulator = !showLiveCameraShell;
  const cameraWaitingMessage =
    cameraSource === 'phone-webrtc'
      ? companionConnectionStatus
      : cameraSource === 'browser-camera'
        ? browserCameraStatus
        : cameraReady
          ? 'Waiting for the latest camera frame to arrive.'
          : null;

  const sysStatus: 'live' | 'sim' | 'error' =
    hasLiveCamera && robotReady ? 'live' : hasLiveCamera ? 'sim' : !backendReachable ? 'error' : 'sim';

  const sysLabel = sysStatus === 'live' ? 'Live' : sysStatus === 'error' ? 'Offline' : 'Simulator';

  const hasVisionData = aprilTagDetections.length > 0 || canvasBorder.detected;
  const detectionSvg = hasVisionData ? (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      {aprilTagDetections.map((detection) => (
        <polygon
          key={`tag-${detection.tag_id}`}
          points={detection.corners.map((corner) => `${corner.x},${corner.y}`).join(' ')}
          fill="rgba(93,228,255,0.05)"
          stroke="rgba(93,228,255,0.85)"
          strokeWidth="0.004"
          strokeLinejoin="round"
        />
      ))}
      {canvasBorder.detected && (
        <>
          <polygon
            points={canvasBorder.corners.map((corner) => `${corner.x},${corner.y}`).join(' ')}
            fill="none"
            stroke="rgba(255,79,140,0.92)"
            strokeWidth="0.004"
            strokeLinejoin="round"
          />
          {canvasBorder.corners.map((corner, index) => (
            <circle
              key={`border-${index}`}
              cx={corner.x}
              cy={corner.y}
              r="0.012"
              fill="rgba(255,79,140,0.9)"
              stroke="rgba(255,255,255,0.88)"
              strokeWidth="0.004"
            />
          ))}
        </>
      )}
    </svg>
  ) : null;

  const handlePromptSubmit = (event: FormEvent) => {
    setLastSubmittedPrompt(prompt);
    onSubmitPrompt(event);
  };

  const handleBlockRun = async (program: BlockProgram) => {
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
        throw new Error(payload.message || 'Block execution failed.');
      }

      if (payload.svg) {
        setCodeGeneratedSvg(payload.svg);
      }
      setLastSubmittedPrompt(payload.task_name || conceptTitle || 'block program');
    } catch (error) {
      console.error('Block runner failed', error);
      setLastSubmittedPrompt('Block runner error');
    }
  };

  useEffect(() => {
    if (!cameraReady || !studentName || !activeJobName) {
      return;
    }

    saveDrawing(studentName, {
      prompt: activeJobName,
      concept_id: conceptId ?? undefined,
      layer: activeLayer,
    });
  }, [cameraReady, activeJobName, studentName, conceptId, activeLayer]);

  return (
    <div className="app-shell learning-app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <LearningHeader
        conceptId={conceptId}
        conceptTitle={conceptTitle}
        ageGroup={ageGroup}
        sysStatus={sysStatus}
        sysLabel={sysLabel}
        topStatus={topStatus}
        showSimulator={showSimulator}
        showSystemStatus={showSystemStatus}
        showCameraControls={showCameraControls}
        sourceSaving={sourceSaving}
        cameraSource={cameraSource}
        browserCameraStatus={browserCameraStatus}
        companionConnectionStatus={companionConnectionStatus}
        backendLinkCopied={backendLinkCopied}
        cameraBuddyQrUrl={cameraBuddyQrUrl}
        onBackToHome={onBackToHome}
        onAgeGroupChange={setAgeGroup}
        onOpenConceptMap={() => setShowConceptMap(true)}
        onToggleSystemStatus={() => setShowSystemStatus((value) => !value)}
        onToggleCameraControls={() => setShowCameraControls((value) => !value)}
        onCloseCameraControls={() => setShowCameraControls(false)}
        onActivateCompanionCamera={onActivateCompanionCamera}
        onActivateBrowserCamera={onActivateBrowserCamera}
        onCopyBackendUrl={onCopyBackendUrl}
      />

      <div className="learn-body" style={{ flex: 1, minHeight: 0 }}>
        <div className="learn-canvas-col">
          <LearningStage
            showSimulator={showSimulator}
            showLiveCameraShell={showLiveCameraShell}
            shouldMountVideo={shouldMountVideo}
            cameraFrameUrl={cameraFrameUrl}
            liveVideoAspectRatio={liveVideoAspectRatio}
            cameraBuddyQrUrl={cameraBuddyQrUrl}
            sourceSaving={sourceSaving}
            backendLinkCopied={backendLinkCopied}
            cameraSource={cameraSource}
            browserCameraStatus={browserCameraStatus}
            companionConnectionStatus={companionConnectionStatus}
              cameraWaitingMessage={cameraWaitingMessage}
              canvasDetected={canvasDetected}
              liveCameraOverlayUrl={liveCameraOverlayUrl}
              liveMarkerOverlayUrl={liveMarkerOverlayUrl}
              detectionSvg={detectionSvg}
            videoRef={videoRef}
            composing={composing}
            featuredSvgContent={
              interactionMode === 'blocks'
                ? blockPreviewSvg ?? codeGeneratedSvg ?? featuredTasks[0]?.svg_content ?? null
                : codeGeneratedSvg ?? featuredTasks[0]?.svg_content ?? null
            }
            workspaceCameraRef={workspaceCameraRef}
            onActivateCompanionCamera={onActivateCompanionCamera}
            onActivateBrowserCamera={onActivateBrowserCamera}
            onCopyBackendUrl={onCopyBackendUrl}
          />

          <PromptComposer
            interactionMode={interactionMode}
            activeLayer={activeLayer}
            prompt={prompt}
            composing={composing}
            uploading={uploading}
            featuredTasks={featuredTasks}
            conceptId={conceptId}
            apiBase={apiBase}
            onPromptChange={onPromptChange}
            onSubmitPrompt={handlePromptSubmit}
            onUploadFile={onUploadFile}
            onLoadTask={onLoadTask}
            onInteractionModeChange={setInteractionMode}
            onBlockRun={handleBlockRun}
            onBlockPreviewSvgChange={setBlockPreviewSvg}
            onCodeSvgResult={(svg) => {
              setCodeGeneratedSvg(svg);
              setLastSubmittedPrompt('code execution result');
            }}
          />
        </div>

        <div className="learn-tutor-col">
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
          />
        </div>
      </div>

      {showConceptMap && (
        <ConceptMap
          studentName={studentName}
          ageGroup={ageGroup}
          onConceptSelect={(nextConceptId, nextConceptTitle) => {
            onConceptSelect?.(nextConceptId, nextConceptTitle);
          }}
          onClose={() => setShowConceptMap(false)}
        />
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
    </div>
  );
}
