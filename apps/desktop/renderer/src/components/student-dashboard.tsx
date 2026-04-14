'use client';

import Image from 'next/image';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, RefObject } from 'react';

import { DesktopRuntimeBanner } from '@/components/desktop-runtime-banner';
import { ThemeToggle } from '@/components/theme-toggle';
import type { TaskRecord } from '@/lib/types';

type StudentDashboardProps = {
  topStatus: Array<{ label: string; value: string }>;
  operatorMode: string;
  nextActionTitle: string;
  nextActionCopy: string;
  cameraModeLabel: string;
  cameraStatus: string;
  cameraSourceStatus: string;
  companionConnectionStatus: string;
  browserCameraStatus: string;
  companionBackendUrl: string;
  backendReachable: boolean;
  cameraReady: boolean;
  canvasReady: boolean;
  drawingReady: boolean;
  robotReady: boolean;
  activeJobName: string | null;
  prompt: string;
  composing: boolean;
  uploading: boolean;
  featuredTasks: TaskRecord[];
  overlayPreviewUrl: string | null;
  overlayPreviewLabel: string;
  cameraFrameUrl: string | null;
  browserCameraReady: boolean;
  phoneViewerReady: boolean;
  cameraSource: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  sourceSaving: boolean;
  backendLinkCopied: boolean;
  onActivateCompanionCamera: () => void;
  onActivateBrowserCamera: () => void;
  onCopyBackendUrl: () => void;
  onPromptChange: (value: string) => void;
  onSubmitPrompt: (event: FormEvent) => void;
  onUploadFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadTask: (task: TaskRecord) => void;
};

export function StudentDashboard({
  topStatus,
  operatorMode,
  nextActionTitle,
  nextActionCopy,
  cameraModeLabel,
  cameraStatus,
  companionConnectionStatus,
  browserCameraStatus,
  companionBackendUrl,
  backendReachable,
  cameraReady,
  canvasReady,
  drawingReady,
  robotReady,
  activeJobName,
  prompt,
  composing,
  uploading,
  featuredTasks,
  overlayPreviewUrl,
  overlayPreviewLabel,
  cameraFrameUrl,
  browserCameraReady,
  phoneViewerReady,
  cameraSource,
  videoRef,
  sourceSaving,
  backendLinkCopied,
  onActivateCompanionCamera,
  onActivateBrowserCamera,
  onCopyBackendUrl,
  onPromptChange,
  onSubmitPrompt,
  onUploadFile,
  onLoadTask,
}: StudentDashboardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const quickPromptIdeas = ['happy robot face', 'rocket ship', 'tiny dinosaur'];
  const showLiveVideo = (cameraSource === 'browser-camera' && browserCameraReady) || (cameraSource === 'phone-webrtc' && phoneViewerReady);

  useEffect(() => {
    let cancelled = false;

    void QRCode.toDataURL(companionBackendUrl, {
      margin: 1,
      width: 180,
      color: {
        dark: '#17304a',
        light: '#ffffff',
      },
    })
      .then((nextUrl) => {
        if (!cancelled) {
          setQrDataUrl(nextUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [companionBackendUrl]);

  return (
    <main className="app-shell">
      <div className="top-bar compact-top-bar top-bar-playful">
        <div>
          <p className="eyebrow">SketchBot operator UI</p>
          <h1>Let&apos;s get your robot drawing</h1>
          <p className="subdued-text">
            Follow the steps from top to bottom. Most students only need Camera Buddy, a fun drawing idea, and a clear view of the paper.
          </p>
          <div className="mission-strip">
            <span className="mission-chip">Join the room</span>
            <span className="mission-chip">Pick a fun drawing</span>
            <span className="mission-chip">Start the robot</span>
          </div>
        </div>
        <div className="status-pills">
          {topStatus.map((item) => (
            <span key={item.label} className="status-pill">
              {item.label}: {item.value}
            </span>
          ))}
          <ThemeToggle />
          <span className="mode-pill">{operatorMode}</span>
        </div>
      </div>

      <DesktopRuntimeBanner />

      <section className="panel quickstart-panel hero-panel">
        <div className="panel-header" style={{ marginBottom: 0 }}>
          <p className="panel-eyebrow">Mission control</p>
          <div className="panel-title" style={{ fontSize: '1.15rem' }}>{nextActionTitle}</div>
          <p className="panel-subtitle">{nextActionCopy}</p>
        </div>
      </section>

      <section className="grid-main dashboard-layout">
        <div className="side-stack">
          <div className="panel workspace-panel" style={{ display: 'grid', gap: 10 }}>
            <div className="section-header-row" style={{ flexWrap: 'wrap' }}>
              <div>
                <p className="panel-eyebrow">Robot view</p>
                <div className="panel-title" style={{ fontSize: '1.2rem' }}>Watch the paper and robot</div>
              </div>
              <div className="status-pills">
                <span className="section-badge">Camera: {cameraModeLabel}</span>
                <span className="section-badge">{cameraStatus}</span>
              </div>
            </div>

            <div className="workspace-card workspace-card-playful" style={{ minHeight: 460 }}>
              <div className="workspace-stage">
                <div className="canvas-frame">
                  {showLiveVideo ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#050b16' }}
                    />
                  ) : cameraFrameUrl ? (
                    <img
                      src={cameraFrameUrl}
                      alt={cameraStatus}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: 'var(--stage-backdrop)' }}
                    />
                  ) : (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'var(--stage-backdrop)',
                        display: 'grid',
                        placeItems: 'center',
                        color: 'var(--text)',
                        fontSize: 15,
                        padding: 24,
                        textAlign: 'center',
                        lineHeight: 1.6,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Camera view will appear here</div>
                        <div>{cameraSource === 'browser-camera' ? browserCameraStatus : companionConnectionStatus}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="side-stack">
          <div className="panel">
            <h3>1. Connect a camera</h3>
            <p className="subdued-text" style={{ marginBottom: 12 }}>
              Use Camera Buddy if you have a phone or tablet. Use This Device for a webcam on the computer.
            </p>
            <div className="kid-callout">
              <strong>Fastest path for kids</strong>
              <span>Open Camera Buddy and point the phone at this screen. The app will scan the room code automatically.</span>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <button className="btn btn-primary" type="button" disabled={sourceSaving} onClick={onActivateCompanionCamera}>
                {sourceSaving ? 'Selecting camera...' : 'Use Camera Buddy'}
              </button>
              <button className="btn" type="button" disabled={sourceSaving} onClick={onActivateBrowserCamera}>
                Use This Device Camera
              </button>
              <button className="btn" type="button" onClick={onCopyBackendUrl}>
                {backendLinkCopied ? 'Room address copied' : 'Copy room address'}
              </button>
            </div>
            <div style={{ display: 'grid', justifyItems: 'start', gap: 10, marginTop: 14 }}>
              <div className="qr-shell">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR code for the SketchBot room address" />
                ) : (
                  <div className="qr-placeholder">QR code</div>
                )}
              </div>
              <p className="subdued-text" style={{ margin: 0 }}>
                Open Camera Buddy and point it at this QR code to join the room without typing.
              </p>
            </div>
            <ul className="compact-list" style={{ marginTop: 12 }}>
              <li>Open Camera Buddy on the same Wi-Fi.</li>
              <li>Point the phone at the QR code or paste this room address: {companionBackendUrl}</li>
              <li>{cameraSource === 'browser-camera' ? browserCameraStatus : companionConnectionStatus}</li>
            </ul>
          </div>

          <div className="panel">
            <h3>2. Make a drawing</h3>
            <form onSubmit={onSubmitPrompt} style={{ display: 'grid', gap: 12 }}>
              <textarea value={prompt} onChange={(event) => onPromptChange(event.target.value)} rows={4} placeholder="Draw a smiling robot face" />
              <div className="prompt-chip-row">
                {quickPromptIdeas.map((idea) => (
                  <button key={idea} className="prompt-chip" type="button" onClick={() => onPromptChange(idea)}>
                    {idea}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" type="submit" disabled={composing || !prompt.trim()}>
                  {composing ? 'Making drawing...' : 'Make drawing'}
                </button>
                <label className="btn" style={{ cursor: uploading ? 'progress' : 'pointer' }}>
                  {uploading ? 'Uploading...' : 'Upload picture'}
                  <input type="file" accept=".svg,image/*" onChange={onUploadFile} style={{ display: 'none' }} />
                </label>
              </div>
            </form>
            {featuredTasks.length ? (
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                <strong>Recent drawings</strong>
                {featuredTasks.map((task) => (
                  <button key={task.id} className="btn recent-task-btn" type="button" onClick={() => onLoadTask(task)}>
                    {task.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="panel">
            <h3>3. Are you ready?</h3>
            <div className="kid-callout ready-callout">
              <strong>Green lights</strong>
              <span>When these mostly say yes, your robot room is ready.</span>
            </div>
            <ul className="compact-list">
              <li>App connected: {backendReachable ? 'yes' : 'not yet'}</li>
              <li>Camera ready: {cameraReady ? 'yes' : 'not yet'}</li>
              <li>Paper found: {canvasReady ? 'yes' : 'show all AprilTags'}</li>
              <li>Drawing ready: {drawingReady ? activeJobName ?? 'yes' : 'make one first'}</li>
              <li>Robot ready: {robotReady ? 'yes' : 'connect the robot'}</li>
            </ul>
            {overlayPreviewUrl ? (
              <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(120,140,255,0.16)', background: 'white', marginTop: 12 }}>
                <Image
                  src={overlayPreviewUrl}
                  alt={overlayPreviewLabel}
                  width={512}
                  height={512}
                  unoptimized
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
