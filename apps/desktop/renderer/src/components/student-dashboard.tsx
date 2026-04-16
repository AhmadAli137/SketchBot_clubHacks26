'use client';

import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { ConceptMap } from '@/components/concept-map';
import { TutorPanel } from '@/components/tutor-panel';
import type { BlockProgram } from '@/components/block-editor';
import { LearningHeader } from '@/components/student-dashboard/learning-header';
import { LearningStage } from '@/components/student-dashboard/learning-stage';
import { PromptComposer } from '@/components/student-dashboard/prompt-composer';
import { SimPlayground } from '@/components/sim-playground';
import type { StudentDashboardProps } from '@/components/student-dashboard/types';
import type { AgeGroup, ConceptLayer } from '@/lib/concept-types';
import { awardBadge, saveDrawing } from '@/lib/progress-store';

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
  onConceptSelect,
  onBackToHome,
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
  type WorkspaceTab = 'simulator' | 'live' | 'programming';

  const [activeLayer, setActiveLayer] = useState<ConceptLayer>('intuitive');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(ageGroupProp);
  const [showSystemStatus, setShowSystemStatus] = useState(false);
  const [showConceptMap, setShowConceptMap] = useState(false);
  const [celebrationBadge, setCelebrationBadge] = useState<{ emoji: string; name: string } | null>(null);
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<'language' | 'blocks' | 'code'>('language');
  const [codeGeneratedSvg, setCodeGeneratedSvg] = useState<string | null>(null);
  const [blockPreviewSvg, setBlockPreviewSvg] = useState<string | null>(null);
  const [cameraBuddyQrUrl, setCameraBuddyQrUrl] = useState<string | null>(null);
  const [forceSimulator, setForceSimulator] = useState(false);
  const [liveViewRequested, setLiveViewRequested] = useState(false);
  const [showCameraDropToast, setShowCameraDropToast] = useState(false);
  const cameraWasReadyRef = useRef(false);
  const [showCodeFocus, setShowCodeFocus] = useState(false);
  const [tutorCollapsed, setTutorCollapsed] = useState(false);
  const [primaryTab, setPrimaryTab] = useState<WorkspaceTab>('simulator');
  const [secondaryTab, setSecondaryTab] = useState<WorkspaceTab | null>(null);
  const [showPromptGallery, setShowPromptGallery] = useState(false);
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
    return interactionMode === 'blocks'
      ? blockPreviewSvg ?? codeGeneratedSvg ?? featuredTasks[0]?.svg_content ?? null
      : codeGeneratedSvg ?? featuredTasks[0]?.svg_content ?? null;
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


  const handlePromptSubmit = (event: FormEvent) => {
    setLastSubmittedPrompt(prompt);
    onSubmitPrompt(event);
  };

  // When switching to blocks/code, reveal the programming tab automatically
  const handleInteractionModeChange = (mode: 'language' | 'blocks' | 'code') => {
    setInteractionMode(mode);
    if (mode !== 'language') {
      setPrimaryTab('programming');
    }
  };

  const renderWorkspace = (tab: WorkspaceTab) => {
    if (tab === 'simulator') {
      return <SimPlayground svgContent={featuredSvgContent} isGenerating={composing} style={{ position: 'absolute', inset: 0 }} />;
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
          featuredSvgContent={featuredSvgContent}
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
        <PromptComposer
          interactionMode={interactionMode}
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
            setCodeGeneratedSvg(svg);
            setLastSubmittedPrompt('code execution result');
          }}
          onToggleCodeFocus={() => setShowCodeFocus((value) => !value)}
        />
      </div>
    );
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
        onBackToHome={onBackToHome}
        onAgeGroupChange={setAgeGroup}
        onOpenConceptMap={() => setShowConceptMap(true)}
        onConceptSelect={onConceptSelect}
        onToggleSystemStatus={() => setShowSystemStatus((v) => !v)}
        onClosePopover={() => setShowSystemStatus(false)}
      />

      <div className={`workspace-root${tutorCollapsed ? ' tutor-collapsed' : ''}`} style={{ flex: 1, minHeight: 0 }}>
        {/* Workspace column: canvas panes + floating prompt bar */}
        <div className="workspace-column">
        <div className={`workspace-main ${splitEnabled ? 'split' : ''}`} style={{ minHeight: 0 }}>
          <div className="workspace-pane">
            <div className="workspace-tabs">
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
                  {tab === 'simulator' ? '🤖 Simulator' : tab === 'live' ? '📷 Live Camera' : '✏️ Code'}
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
            <div className="workspace-pane-body">{renderWorkspace(primaryTab)}</div>
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
                    {tab === 'simulator' ? '🤖 Simulator' : tab === 'live' ? '📷 Live Camera' : '✏️ Code'}
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

        {/* Floating prompt bar */}
        <div className="floating-prompt-bar">
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
            <label className="floating-prompt-upload" title="Upload image">
              <input type="file" accept=".svg,image/*" onChange={onUploadFile} style={{ display: 'none' }} />
              📎
            </label>
            {interactionMode === 'language' ? (
              <>
                <button type="button" className="floating-prompt-mode-btn" onClick={() => handleInteractionModeChange('blocks')} title="Block editor">Blocks</button>
                <button type="button" className="floating-prompt-mode-btn" onClick={() => handleInteractionModeChange('code')} title="Code editor">Code</button>
              </>
            ) : (
              <button type="button" className="floating-prompt-mode-btn active" onClick={() => handleInteractionModeChange('language')} title="Back to text prompt">
                {interactionMode === 'blocks' ? '⬛ Blocks' : '</> Code'} ✕
              </button>
            )}
            <button
              type="submit"
              className="floating-prompt-submit"
              disabled={composing || uploading || !prompt.trim() || interactionMode !== 'language'}
            >
              {composing ? '⏳' : '▶ Generate'}
            </button>
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
        </div>{/* end workspace-column */}

        {tutorCollapsed ? (
          <button
            type="button"
            className="tutor-drawer-handle"
            onClick={() => setTutorCollapsed(false)}
            title="Open Sketch tutor"
            aria-label="Open Sketch tutor"
          >
            🤖
          </button>
        ) : null}

        <div className={`tutor-dock ${tutorCollapsed ? 'collapsed' : ''}`}>
          <div className="tutor-dock-header">
            <div className="tutor-dock-avatar">🤖</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tutor-dock-title">Sketch</div>
              <div className="tutor-dock-subtitle">Your robot tutor</div>
            </div>
            <button type="button" className="btn-ghost tutor-dock-minimize" onClick={() => setTutorCollapsed(true)} title="Minimize">
              ‹
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
            />
          </div>
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
    </div>
  );
}
