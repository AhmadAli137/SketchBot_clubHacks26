'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, Camera, QrCode, VideoOff } from 'lucide-react';

import { SimPlayground } from '@/components/sim-playground';
import { Button } from '@/components/ui/button';

import type { LearningStageProps } from './types';

type CameraPanelView = 'choose' | 'phone-qr';

export function LearningStage({
  showSimulator,
  shouldMountVideo,
  cameraConnecting,
  cameraFrameUrl,
  cameraBuddyQrUrl,
  classroomJoinCode,
  sourceSaving,
  backendLinkCopied,
  cameraSource,
  browserCameraStatus,
  companionConnectionStatus,
  cameraWaitingMessage,
  canvasDetected,
  liveCameraOverlayUrl,
  liveMarkerOverlayUrl,
  aprilTagDetections,
  canvasBorder,
  videoRef,
  onVideoMount,
  cameraReady,
  composing,
  featuredSvgContent,
  workspaceCameraRef,
  onActivateCompanionCamera,
  onActivateBrowserCamera,
  onDeactivateCamera,
  onCopyBackendUrl,
}: LearningStageProps) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [markerOverlayFailed, setMarkerOverlayFailed] = useState(false);
  const [panelView, setPanelView] = useState<CameraPanelView>('choose');
  const [videoDims, setVideoDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!shouldMountVideo && !cameraReady && !cameraConnecting) {
      setPanelView('choose');
    }
  }, [shouldMountVideo, cameraReady, cameraConnecting]);

  useEffect(() => {
    setMarkerOverlayFailed(false);
  }, [liveMarkerOverlayUrl]);

  const handleVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      localVideoRef.current = el;
      onVideoMount(el);

      if (!el) {
        setVideoDims(null);
        return;
      }

      const sync = () => {
        if (el.videoWidth > 0 && el.videoHeight > 0) {
          setVideoDims((prev) => {
            if (prev && prev.w === el.videoWidth && prev.h === el.videoHeight) return prev;
            return { w: el.videoWidth, h: el.videoHeight };
          });
        }
      };

      sync();
      el.addEventListener('loadedmetadata', sync);
      el.addEventListener('resize', sync);
    },
    [onVideoMount],
  );

  const showFeed = shouldMountVideo || (cameraReady && Boolean(cameraFrameUrl));

  const hasActiveStream =
    cameraReady &&
    ((shouldMountVideo) || Boolean(cameraFrameUrl));

  const cameraHelpText =
    cameraSource === 'browser-camera'
      ? browserCameraStatus
      : companionConnectionStatus;

  const statusDotClass = cameraReady ? 'live' : 'sim';

  const sourceLabel =
    cameraSource === 'phone-webrtc'
      ? 'Camera Buddy (Phone)'
      : cameraSource === 'browser-camera'
        ? 'This Device'
        : 'Camera';

  const statusLabel = cameraReady
    ? `${sourceLabel} — Live`
    : (shouldMountVideo || cameraConnecting)
      ? `Connecting ${sourceLabel}…`
      : 'No camera';

  return (
    <div
      ref={(node) => {
        areaRef.current = node;
        if (workspaceCameraRef) workspaceCameraRef.current = node;
      }}
      className="learn-canvas-area"
    >
      {showSimulator && (
        <SimPlayground
          svgContent={featuredSvgContent}
          isGenerating={composing}
          style={{ position: 'absolute', inset: 0 }}
        />
      )}

      {/* ── Active video / image feed — fills the entire area ── */}
      {showFeed && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            background: '#050b16',
          }}
        >
          {shouldMountVideo && (
            <video
              ref={handleVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                background: '#050b16',
              }}
            />
          )}
          {!shouldMountVideo && cameraFrameUrl && cameraReady && (
            <Image src={cameraFrameUrl} alt="Camera feed" fill style={{ objectFit: 'contain' }} unoptimized />
          )}
          {liveCameraOverlayUrl && (
            <Image
              src={liveCameraOverlayUrl}
              alt="Drawing overlay"
              fill
              style={{ objectFit: 'contain', pointerEvents: 'none' }}
              unoptimized
            />
          )}
          {liveMarkerOverlayUrl && !markerOverlayFailed ? (
            <img
              src={liveMarkerOverlayUrl}
              alt=""
              onError={() => setMarkerOverlayFailed(true)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
            />
          ) : (aprilTagDetections.length > 0 || canvasBorder.detected) && (() => {
            const vw = videoDims?.w ?? 1;
            const vh = videoDims?.h ?? 1;
            const sw = `${0.004 * vw}`;
            return (
              <svg
                viewBox={`0 0 ${vw} ${vh}`}
                preserveAspectRatio="xMidYMid meet"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  overflow: 'visible',
                  pointerEvents: 'none',
                }}
              >
                {aprilTagDetections.map((d) => (
                  <polygon
                    key={`tag-${d.tag_id}`}
                    points={d.corners.map((c) => `${c.x * vw},${c.y * vh}`).join(' ')}
                    fill="rgba(93,228,255,0.05)"
                    stroke="rgba(93,228,255,0.85)"
                    strokeWidth={sw}
                    strokeLinejoin="round"
                  />
                ))}
                {canvasBorder.detected && (
                  <>
                    <polygon
                      points={canvasBorder.corners.map((c) => `${c.x * vw},${c.y * vh}`).join(' ')}
                      fill="none"
                      stroke="rgba(255,79,140,0.92)"
                      strokeWidth={sw}
                      strokeLinejoin="round"
                    />
                    {canvasBorder.corners.map((c, i) => (
                      <circle
                        key={`border-${i}`}
                        cx={c.x * vw}
                        cy={c.y * vh}
                        r={0.012 * Math.max(vw, vh)}
                        fill="rgba(255,79,140,0.9)"
                        stroke="rgba(255,255,255,0.88)"
                        strokeWidth={sw}
                      />
                    ))}
                  </>
                )}
              </svg>
            );
          })()}
        </div>
      )}

      {/* ── Camera controls panel (visible in Live tab when no active stream) ── */}
      {!showSimulator && !hasActiveStream && !shouldMountVideo && !cameraConnecting && (
        <div className="live-camera-panel">
          <div className="live-camera-panel-inner">
            <div className="live-status-row">
              <div className={`learn-sys-dot ${statusDotClass}`} />
              <span className="live-status-label">{statusLabel}</span>
            </div>

            {/* ── Choose a source ── */}
            {panelView === 'choose' && (
              <>
                <div className="live-camera-panel-title">Connect a camera</div>
                <div className="live-camera-panel-copy">
                  Choose a camera source to see a live feed and enable paper detection.
                </div>
                <div className="live-camera-actions">
                  <Button
                    variant="primary"
                    size="md"
                    disabled={sourceSaving}
                    onClick={() => setPanelView('phone-qr')}
                    className="w-full"
                  >
                    <QrCode size={14} />
                    Camera Buddy (Phone)
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    disabled={sourceSaving}
                    onClick={onActivateBrowserCamera}
                    className="w-full"
                  >
                    <Camera size={13} />
                    This Device
                  </Button>
                </div>
              </>
            )}

            {/* ── Camera Buddy QR view ── */}
            {panelView === 'phone-qr' && (
              <>
                <button
                  type="button"
                  className="live-panel-back"
                  onClick={() => setPanelView('choose')}
                >
                  <ArrowLeft size={13} />
                  Back
                </button>

                <div className="live-camera-panel-title">Camera Buddy</div>
                <div className="live-camera-panel-copy">
                  Scan the QR code on your phone or enter the classroom code in the Camera Buddy app.
                </div>

                {cameraBuddyQrUrl && (
                  <div className="live-camera-qr-block">
                    <div className="live-camera-qr-row">
                      <div style={{ padding: 8, borderRadius: 16, background: '#fff', flexShrink: 0 }}>
                        <Image src={cameraBuddyQrUrl} alt="Camera Buddy QR" width={120} height={120} unoptimized />
                      </div>
                      <div className="live-camera-qr-meta">
                        <div className="live-camera-qr-label">Classroom code</div>
                        <div className="live-camera-qr-code">{classroomJoinCode}</div>
                        <Button variant="ghost" size="sm" onClick={onCopyBackendUrl} title="Copy classroom link">
                          {backendLinkCopied ? 'Copied!' : 'Copy link'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="live-camera-help">{companionConnectionStatus}</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Connecting overlay (shows over the dark video while waiting) ── */}
      {!showSimulator && (shouldMountVideo || cameraConnecting) && !cameraReady && (
        <div className="live-connecting-overlay">
          <div className="live-connecting-inner">
            <div className={`learn-sys-dot ${statusDotClass}`} style={{ width: 8, height: 8 }} />
            <span>Connecting {sourceLabel}…</span>
          </div>
          <div className="live-connecting-help">{cameraWaitingMessage}</div>
          {cameraSource === 'phone-webrtc' && cameraBuddyQrUrl && (
            <div className="live-connecting-qr">
              <Image src={cameraBuddyQrUrl} alt="QR" width={100} height={100} unoptimized style={{ borderRadius: 12 }} />
              <div style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.1em' }}>{classroomJoinCode}</div>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={onDeactivateCamera}>
            <VideoOff size={12} />
            Disconnect {sourceLabel}
          </Button>
        </div>
      )}

      {/* ── Active stream top-bar with status + disconnect ── */}
      {!showSimulator && hasActiveStream && (
        <div className="live-active-bar">
          <div className="learn-sys-dot live" />
          <span className="live-active-label">{sourceLabel} — Live</span>
          <button type="button" className="live-disconnect-btn" onClick={onDeactivateCamera} title={`Disconnect ${sourceLabel}`}>
            <VideoOff size={11} />
            <span className="live-disconnect-label">Disconnect</span>
          </button>
        </div>
      )}

      {canvasDetected && !showSimulator && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid rgba(77,255,184,0.28)',
            background: 'rgba(5,8,22,0.8)',
            color: 'var(--green)',
            fontSize: '0.7rem',
            fontWeight: 700,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px rgba(77,255,184,0.5)' }} />
          Paper detected
        </div>
      )}

      {showSimulator && (
        <div className="learn-hw-toast" style={{ bottom: 14, opacity: 0.75 }}>
          Simulator mode — connect hardware to go Live
        </div>
      )}
    </div>
  );
}
