'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';
import { API_BASE } from '@/lib/config';
import type { PhoneWebRTCSessionResponse, RTCIceServerConfig } from '@/lib/types';

type FacingMode = 'environment' | 'user';

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForIceGatheringComplete(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') {
    return;
  }

  await new Promise<void>((resolve) => {
    const onIceGatheringStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onIceGatheringStateChange);
  });
}

function rtcConfiguration(iceServers?: RTCIceServerConfig[]): RTCConfiguration {
  return {
    iceServers: (iceServers ?? []).map((server) => ({
      urls: server.urls,
      username: server.username ?? undefined,
      credential: server.credential ?? undefined,
    })),
  };
}

export default function RemoteCameraPage() {
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [deviceLabel, setDeviceLabel] = useState('Companion camera');
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [legacyUploading, setLegacyUploading] = useState(false);
  const [status, setStatus] = useState('Ready to provision a companion camera session.');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<PhoneWebRTCSessionResponse | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const uploadBusyRef = useRef(false);
  const isSecureCameraContext =
    typeof window !== 'undefined' &&
    (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setPreviewing(false);
    setLegacyUploading(false);
    setStatus((current) => (
      current === 'Legacy JPEG fallback uploading.' || current === 'Companion WebRTC publishing.' ? 'Camera preview stopped.' : current
    ));
  }, []);

  const stopPublishing = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const pc = pcRef.current;
    if (pc) {
      pc.close();
      pcRef.current = null;
    }
    setPublishing(false);
    if (sessionId) {
      try {
        await fetch(`${API_BASE}/api/camera/phone-webrtc/publisher-stop/${sessionId}`, { method: 'POST' });
      } catch {
        // Ignore shutdown cleanup failures.
      }
    }
  }, []);

  const ensurePreview = async () => {
    if (streamRef.current) {
      return streamRef.current;
    }
    if (!isSecureCameraContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access requires HTTPS or localhost.');
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 640 },
        height: { ideal: 360 },
        frameRate: { ideal: 20, max: 24 },
      },
      audio: false,
    });

    streamRef.current = mediaStream;
    if (videoRef.current) {
      videoRef.current.srcObject = mediaStream;
      await videoRef.current.play().catch(() => {});
    }
    setPreviewing(true);
    return mediaStream;
  };

  const loadExistingSession = useCallback(async (): Promise<PhoneWebRTCSessionResponse | null> => {
    try {
      const response = await fetch(`${API_BASE}/api/camera/phone-webrtc/session`, { cache: 'no-store' });
      if (!response.ok) {
        return null;
      }
      const payload = await response.json() as PhoneWebRTCSessionResponse;
      setSession(payload);
      sessionIdRef.current = payload.session_id;
      setStatus((current) => (publishing ? current : payload.message));
      setError(null);
      return payload;
    } catch {
      // Ignore missing or unreachable session here.
      return null;
    }
  }, [publishing]);

  const provisionSession = async (forceNew = false): Promise<PhoneWebRTCSessionResponse | null> => {
    setSessionLoading(true);
    try {
      setError(null);
      const sourceResponse = await fetch(`${API_BASE}/api/camera/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'phone-webrtc' }),
      });
      if (!sourceResponse.ok) {
        throw new Error('Unable to switch the backend to companion camera mode.');
      }

      const response = await fetch(`${API_BASE}/api/camera/phone-webrtc/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_label: deviceLabel.trim() || 'Companion camera', force_new: forceNew }),
      });
      if (!response.ok) {
        throw new Error(`Failed to provision companion WebRTC session (${response.status}).`);
      }

      const payload = await response.json() as PhoneWebRTCSessionResponse;
      setSession(payload);
      sessionIdRef.current = payload.session_id;
      setStatus(payload.message);
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to provision companion WebRTC session.');
      setStatus('Companion WebRTC session setup failed.');
      return null;
    } finally {
      setSessionLoading(false);
    }
  };

  const startPreview = async () => {
    try {
      setError(null);
      await ensurePreview();
      setStatus('Local preview ready. You can now start WebRTC publishing.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to access the camera.');
      setStatus('Camera preview failed.');
    }
  };

  const startPublishing = async () => {
    setPublishLoading(true);
    try {
      let activeSession = session;
      if (!activeSession?.session_id) {
        activeSession = await loadExistingSession();
      }

      if (!activeSession?.session_id) {
        activeSession = await provisionSession(false);
      }

      if (!activeSession?.session_id) {
        throw new Error('The backend did not return a usable companion camera session.');
      }

      setError(null);
      const mediaStream = await ensurePreview();
      await stopPublishing();

      const pc = new RTCPeerConnection(rtcConfiguration(activeSession.ice_servers));
      pcRef.current = pc;

      mediaStream.getTracks().forEach((track) => pc.addTrack(track, mediaStream));

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setPublishing(true);
          setStatus('Companion WebRTC publishing.');
          void fetch(`${API_BASE}/api/camera/phone-webrtc/publisher-live/${activeSession.session_id}`, { method: 'POST' });
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
          setPublishing(false);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      const localDescription = pc.localDescription;
      if (!localDescription) {
        throw new Error('Publisher local description missing.');
      }

      const publishResponse = await fetch(`${API_BASE}/api/camera/phone-webrtc/publisher-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSession.session_id,
          sdp: localDescription.sdp,
          type: localDescription.type,
        }),
      });
      if (!publishResponse.ok) {
        throw new Error(`Failed to publish WebRTC offer (${publishResponse.status}).`);
      }

      setStatus('Publisher offer sent. Waiting for dashboard viewer answer...');

      let remoteAnswer: { sdp: string; type: RTCSdpType } | null = null;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const answerResponse = await fetch(`${API_BASE}/api/camera/phone-webrtc/viewer-answer/${activeSession.session_id}`, {
          cache: 'no-store',
        });
        if (answerResponse.ok) {
          const payload = await answerResponse.json() as { sdp: string; type: RTCSdpType };
          remoteAnswer = payload;
          break;
        }
        await delay(1000);
      }

      if (!remoteAnswer) {
        throw new Error('Timed out waiting for dashboard viewer answer.');
      }

      await pc.setRemoteDescription(remoteAnswer);
      setStatus('Viewer answer applied. Waiting for peer connection...');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start WebRTC publishing.');
      setStatus('Companion WebRTC publish failed.');
      await stopPublishing();
    } finally {
      setPublishLoading(false);
    }
  };

  const startLegacyUpload = async () => {
    try {
      setError(null);
      await ensurePreview();
      await fetch(`${API_BASE}/api/camera/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'browser-camera' }),
      });
      setLegacyUploading(true);
      setStatus('Legacy JPEG fallback uploading.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start legacy upload.');
      setStatus('Legacy upload failed.');
    }
  };

  useEffect(() => {
    sessionIdRef.current = session?.session_id ?? null;
  }, [session?.session_id]);

  useEffect(() => {
    void loadExistingSession();
    const sessionPoll = window.setInterval(() => {
      void loadExistingSession();
    }, 4000);
    return () => {
      window.clearInterval(sessionPoll);
      void stopPublishing();
      stopPreview();
    };
  }, [loadExistingSession, stopPreview, stopPublishing]);

  useEffect(() => {
    if (!legacyUploading) {
      return;
    }

    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || uploadBusyRef.current || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      uploadBusyRef.current = true;
      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Canvas context unavailable.');
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7));
        if (!blob) {
          throw new Error('Unable to encode camera frame.');
        }

        const response = await fetch(`${API_BASE}/api/camera/browser-frame`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob,
        });
        if (!response.ok) {
          throw new Error('Frame upload failed.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Frame upload failed.');
        setStatus('Legacy upload interrupted.');
        setLegacyUploading(false);
      } finally {
        uploadBusyRef.current = false;
      }
    }, 350);

    return () => {
      window.clearInterval(timer);
    };
  }, [legacyUploading]);

  const startPhoneCamera = async () => {
    setStatus('Starting companion camera...');
    await startPublishing();
  };

  const stopPhoneCamera = async () => {
    await stopPublishing();
    stopPreview();
    setStatus('Companion camera stopped.');
  };

  const connectionLabel = publishing ? 'Live' : publishLoading ? 'Connecting' : session?.publisher_status ?? 'idle';
  const sessionLabel = session?.session_id ?? 'Will sync automatically from the dashboard';
  const viewerLabel = session?.viewer_status ?? 'idle';
  const canStopPhoneCamera = previewing || publishing || publishLoading || legacyUploading;

  return (
    <main className="app-shell" style={{ maxWidth: 920 }}>
      <div className="top-bar compact-top-bar">
        <div>
          <p className="eyebrow">SketchBot remote camera</p>
          <h1>Companion Camera</h1>
          <p className="subdued-text">This page is the camera companion for the dashboard. One tap starts preview, syncs the session, and begins publishing the live camera stream from a phone, tablet, or laptop.</p>
        </div>
        <div className="status-pills">
          <span className="status-pill">{connectionLabel}</span>
          <ThemeToggle />
          <Link className="tab" href="/">
            Dashboard
          </Link>
        </div>
      </div>

      <section className="panel" style={{ display: 'grid', gap: 14 }}>
        <div className="panel-header">
          <p className="panel-eyebrow">Guided Flow</p>
          <div className="panel-title">Use this device as the live camera</div>
          <p className="panel-subtitle">Tap the main button below. The app will reuse the dashboard session when available, start the local preview, and publish the stream automatically.</p>
        </div>

        <div className="grid-2">
          <label>
            Device label
            <input value={deviceLabel} onChange={(event) => setDeviceLabel(event.target.value)} placeholder="Studio tablet camera" />
          </label>
          <label>
            Lens
            <select value={facingMode} onChange={(event) => setFacingMode(event.target.value as FacingMode)}>
              <option value="environment">Back camera</option>
              <option value="user">Front camera</option>
            </select>
          </label>
        </div>

        <div className="inline-actions">
          <button className="btn btn-primary" type="button" disabled={publishLoading || publishing} onClick={() => void startPhoneCamera()}>
            {publishLoading ? 'Starting companion camera...' : publishing ? 'Companion camera live' : 'Start Companion Camera'}
          </button>
          <button className="btn" type="button" onClick={() => void stopPhoneCamera()} disabled={!canStopPhoneCamera}>
            Stop Camera
          </button>
        </div>

        <div className="phone-guidance">
          <div className="status-card">
            <strong>Status</strong>
            <span>{status}</span>
          </div>
          <div className="status-card">
            <strong>Session</strong>
            <span>{sessionLabel}</span>
          </div>
          <div className="badge-line">
            <span className="mini-pill">Preview: {previewing ? 'ready' : 'idle'}</span>
            <span className="mini-pill">Publisher: {connectionLabel}</span>
            <span className="mini-pill">Viewer: {viewerLabel}</span>
          </div>
        </div>

        <details className="details-card">
          <summary>Advanced controls</summary>
          <div className="details-body">
            <p className="muted-note">These controls are still available for debugging, but the normal path should just be the main start button.</p>
            <div className="inline-actions">
              <button className="tab active" type="button" disabled={sessionLoading} onClick={() => void provisionSession(false)}>
                {sessionLoading ? 'Provisioning...' : 'Provision session'}
              </button>
              <button className="tab" type="button" disabled={sessionLoading} onClick={() => void provisionSession(true)}>
                Refresh session
              </button>
              <button className="tab" type="button" onClick={() => void startPreview()}>
                Start preview only
              </button>
              <button className="tab" type="button" onClick={() => void stopPublishing()} disabled={!publishing && !publishLoading}>
                Stop publish only
              </button>
              <button className="tab" type="button" onClick={stopPreview} disabled={!previewing && !legacyUploading}>
                Stop preview only
              </button>
            </div>
            {session ? (
              <ul className="compact-list">
                <li>Session: {session.session_id}</li>
                <li>Source: {session.source}</li>
                <li>Source status: {session.source_status}</li>
                <li>Publisher status: {session.publisher_status}</li>
                <li>Viewer status: {session.viewer_status}</li>
                <li>Ingest protocol: {session.ingest_protocol}</li>
                <li>Viewer protocol: {session.viewer_protocol}</li>
                <li>Analysis mode: {session.analysis_mode}</li>
                <li>ICE servers: {session.ice_servers.length}</li>
              </ul>
            ) : (
              <ul className="compact-list">
                <li>Waiting for the dashboard to prepare a companion session.</li>
              </ul>
            )}
          </div>
        </details>
      </section>

      <section className="panel" style={{ display: 'grid', gap: 14 }}>
        <div className="panel-header">
          <p className="panel-eyebrow">Local preview</p>
          <div className="panel-title">Preview camera locally on the device</div>
          <p className="panel-subtitle">This checks framing and also supplies the stream tracks used by WebRTC publishing.</p>
          {!isSecureCameraContext ? (
            <p className="panel-subtitle" style={{ color: '#ffd2d0' }}>
              Camera access is blocked here because this page is running over plain HTTP. Use HTTPS on the companion device, or test the camera page on localhost.
            </p>
          ) : null}
        </div>

        <div className="workspace-card">
          <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: 'var(--stage-backdrop)', minHeight: 320 }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', display: 'block', minHeight: 320, objectFit: 'cover', background: 'var(--stage-backdrop)' }}
            />
          </div>
        </div>
      </section>

      <details className="details-card">
        <summary>Legacy JPEG fallback</summary>
        <div className="details-body">
          <p className="muted-note">Keep this only for debugging while the WebRTC path stabilizes. It is not the main user path anymore.</p>
          <div className="inline-actions">
            <button className="tab" type="button" onClick={() => void startLegacyUpload()} disabled={legacyUploading}>
              {legacyUploading ? 'Uploading fallback...' : 'Start legacy fallback'}
            </button>
            <button className="tab" type="button" onClick={() => setLegacyUploading(false)} disabled={!legacyUploading}>
              Stop fallback
            </button>
          </div>
        </div>
      </details>

      <ul className="compact-list compact-status-list">
        <li>Status: {status}</li>
        <li>Backend: {API_BASE}</li>
        <li>Tip: mount the companion device above the canvas and keep AprilTags fully visible.</li>
        {error ? <li style={{ color: '#ffd2d0' }}>Error: {error}</li> : null}
      </ul>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </main>
  );
}
