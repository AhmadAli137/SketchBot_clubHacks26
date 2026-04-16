'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, QrCode } from 'lucide-react';

import { SimulatorCanvas } from '@/components/simulator-canvas';

import type { LearningStageProps } from './types';

export function LearningStage({
  showSimulator,
  showLiveCameraShell,
  shouldMountVideo,
  cameraFrameUrl,
  liveVideoAspectRatio,
  cameraBuddyQrUrl,
  sourceSaving,
  backendLinkCopied,
  cameraSource,
  browserCameraStatus,
  companionConnectionStatus,
  cameraWaitingMessage,
  canvasDetected,
  liveCameraOverlayUrl,
  liveMarkerOverlayUrl,
  detectionSvg,
  videoRef,
  composing,
  featuredSvgContent,
  workspaceCameraRef,
  onActivateCompanionCamera,
  onActivateBrowserCamera,
  onCopyBackendUrl,
}: LearningStageProps) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });
  const [markerOverlayFailed, setMarkerOverlayFailed] = useState(false);

  useEffect(() => {
    const node = areaRef.current;
    if (!node) {
      return;
    }

    const update = () => {
      setAreaSize({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setMarkerOverlayFailed(false);
  }, [liveMarkerOverlayUrl]);

  const liveStageRect = useMemo(() => {
    const width = areaSize.width;
    const height = areaSize.height;
    const aspectRatio = liveVideoAspectRatio && liveVideoAspectRatio > 0 ? liveVideoAspectRatio : 3 / 4;

    if (!width || !height) {
      return null;
    }

    const containerAspectRatio = width / height;
    if (containerAspectRatio > aspectRatio) {
      const stageHeight = height;
      const stageWidth = stageHeight * aspectRatio;
      return {
        left: (width - stageWidth) / 2,
        top: 0,
        width: stageWidth,
        height: stageHeight,
      };
    }

    const stageWidth = width;
    const stageHeight = stageWidth / aspectRatio;
    return {
      left: 0,
      top: (height - stageHeight) / 2,
      width: stageWidth,
      height: stageHeight,
    };
  }, [areaSize.height, areaSize.width, liveVideoAspectRatio]);

  return (
    <div
      ref={(node) => {
        areaRef.current = node;
        if (workspaceCameraRef) {
          workspaceCameraRef.current = node;
        }
      }}
      className="learn-canvas-area"
    >
      {showLiveCameraShell && (
        <>
          {liveStageRect && (
            <div
              style={{
                position: 'absolute',
                left: liveStageRect.left,
                top: liveStageRect.top,
                width: liveStageRect.width,
                height: liveStageRect.height,
                overflow: 'hidden',
                background: '#050b16',
              }}
            >
              {shouldMountVideo && (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill',
                    background: '#050b16',
                  }}
                />
              )}
              {!shouldMountVideo && cameraFrameUrl && (
                <Image src={cameraFrameUrl} alt="Camera feed" fill style={{ objectFit: 'fill' }} unoptimized />
              )}
              {liveCameraOverlayUrl && (
                <Image
                  src={liveCameraOverlayUrl}
                  alt="Drawing overlay"
                  fill
                  style={{ objectFit: 'fill', pointerEvents: 'none' }}
                  unoptimized
                />
              )}
              {liveMarkerOverlayUrl && !markerOverlayFailed ? (
                <img
                  src={liveMarkerOverlayUrl}
                  alt=""
                  onError={() => setMarkerOverlayFailed(true)}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill',
                    pointerEvents: 'none',
                  }}
                />
              ) : (
                detectionSvg
              )}
            </div>
          )}
          {!shouldMountVideo && !cameraFrameUrl && cameraWaitingMessage && (
            <div className="learn-camera-waiting-card">
              <div className="learn-camera-connect-eyebrow">Live camera</div>
              <div className="learn-camera-connect-title">Connecting the camera feed</div>
              <p className="learn-camera-connect-copy">{cameraWaitingMessage}</p>
              {cameraSource === 'phone-webrtc' && cameraBuddyQrUrl && (
                <div className="learn-camera-connect-qr-shell">
                  <Image src={cameraBuddyQrUrl} alt="Camera Buddy QR code" width={176} height={176} unoptimized />
                  <button type="button" className="btn-ghost" onClick={onCopyBackendUrl}>
                    {backendLinkCopied ? 'Copied classroom link' : 'Copy classroom link'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showSimulator && (
        <SimulatorCanvas
          svgContent={featuredSvgContent}
          isGenerating={composing}
          style={{ position: 'absolute', inset: 0 }}
        />
      )}

      {showSimulator && (
        <div className="learn-camera-connect-card">
          <div className="learn-camera-connect-eyebrow">Camera Buddy</div>
          <div className="learn-camera-connect-title">Connect a phone or tablet camera</div>
          <p className="learn-camera-connect-copy">
            Scan this code in Camera Buddy to go live, or use this device if you want the laptop camera instead.
          </p>
          <div className="learn-camera-connect-actions">
            <button className="btn-cta" type="button" disabled={sourceSaving} onClick={onActivateCompanionCamera}>
              <QrCode size={14} />
              Use Camera Buddy
            </button>
            <button className="btn-ghost" type="button" disabled={sourceSaving} onClick={onActivateBrowserCamera}>
              <Camera size={14} />
              Use this device
            </button>
          </div>
          <div className="learn-camera-connect-qr-shell">
            {cameraBuddyQrUrl ? (
              <>
                <Image src={cameraBuddyQrUrl} alt="Camera Buddy QR code" width={188} height={188} unoptimized />
                <button type="button" className="btn-ghost" onClick={onCopyBackendUrl}>
                  {backendLinkCopied ? 'Copied classroom link' : 'Copy classroom link'}
                </button>
              </>
            ) : (
              <div className="learn-camera-connect-qr-placeholder">Preparing Camera Buddy link…</div>
            )}
          </div>
          <div className="learn-camera-connect-status">
            {cameraSource === 'browser-camera' ? browserCameraStatus : companionConnectionStatus}
          </div>
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
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--green)',
              boxShadow: '0 0 6px rgba(77,255,184,0.5)',
            }}
          />
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
