'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [deviceLabel, setDeviceLabel] = useState('Phone publisher');
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [legacyUploading, setLegacyUploading] = useState(false);
  const [status, setStatus] = useState('Ready to provision a phone WebRTC session.');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<PhoneWebRTCSessionResponse | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
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
      current === 'Legacy JPEG fallback uploading.' || current === 'Phone WebRTC publishing.' ? 'Camera preview stopped.' : current
    ));
  }, []);

  const stopPublishing = useCallback(async () => {
    const sessionId = session?.session_id;
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
  }, [session?.session_id]);

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
        width: { ideal: 1280 },
        height: { ideal: 720 },
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

  const loadExistingSession = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/camera/phone-webrtc/session`, { cache: 'no-store' });
      if (!response.ok) {
        return;
      }
      const payload = await response.json() as PhoneWebRTCSessionResponse;
      setSession(payload);
      setStatus(payload.message);
    } catch {
      // Ignore missing or unreachable session here.
    }
  };

  const provisionSession = async (forceNew = false) => {
    setSessionLoading(true);
    try {
      setError(null);
      await fetch(`${API_BASE}/api/camera/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'phone-webrtc' }),
      });

      const response = await fetch(`${API_BASE}/api/camera/phone-webrtc/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_label: deviceLabel.trim() || 'Phone publisher', force_new: forceNew }),
      });
      if (!response.ok) {
        throw new Error('Failed to provision phone WebRTC session.');
      }

      const payload = await response.json() as PhoneWebRTCSessionResponse;
      setSession(payload);
      setStatus(payload.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to provision phone WebRTC session.');
      setStatus('Phone WebRTC session setup failed.');
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
    if (!session?.session_id) {
      setError('Provision a phone WebRTC session first.');
      setStatus('Phone WebRTC session required.');
      return;
    }

    setPublishLoading(true);
    try {
      setError(null);
      const mediaStream = await ensurePreview();
      await stopPublishing();

      const pc = new RTCPeerConnection(rtcConfiguration(session.ice_servers));
      pcRef.current = pc;

      mediaStream.getTracks().forEach((track) => pc.addTrack(track, mediaStream));

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setPublishing(true);
          setStatus('Phone WebRTC publishing.');
          void fetch(`${API_BASE}/api/camera/phone-webrtc/publisher-live/${session.session_id}`, { method: 'POST' });
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
          session_id: session.session_id,
          sdp: localDescription.sdp,
          type: localDescription.type,
        }),
      });
      if (!publishResponse.ok) {
        throw new Error('Failed to publish WebRTC offer.');
      }

      setStatus('Publisher offer sent. Waiting for dashboard viewer answer...');

      let remoteAnswer: { sdp: string; type: RTCSdpType } | null = null;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const answerResponse = await fetch(`${API_BASE}/api/camera/phone-webrtc/viewer-answer/${session.session_id}`, {
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
      setStatus('Phone WebRTC publish failed.');
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
    void loadExistingSession();
    return () => {
      void stopPublishing();
      stopPreview();
    };
  }, [stopPreview, stopPublishing]);

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

  return (
    <main className="app-shell" style={{ maxWidth: 920 }}>
      <div className="top-bar compact-top-bar">
        <div>
          <p className="eyebrow">SketchBot remote camera</p>
          <h1>Phone WebRTC Publisher</h1>
          <p className="subdued-text">This page can now provision a phone WebRTC session and publish a live browser-to-browser stream to the dashboard through backend signaling. The legacy JPEG uploader remains only as a fallback.</p>
        </div>
        <div className="status-pills">
          <span className="status-pill">{publishing ? 'Publishing' : session?.publisher_status ?? 'idle'}</span>
          <Link className="tab" href="/">
            Dashboard
          </Link>
        </div>
      </div>

      <section className="panel" style={{ display: 'grid', gap: 14 }}>
        <div className="panel-header">
          <p className="panel-eyebrow">Session setup</p>
          <div className="panel-title">Provision phone-webrtc session metadata</div>
          <p className="panel-subtitle">The backend coordinates the session and signaling state. Provision or refresh the session before you start publishing.</p>
        </div>

        <div className="grid-2">
          <label>
            Device label
            <input value={deviceLabel} onChange={(event) => setDeviceLabel(event.target.value)} placeholder="Ahmad iPhone" />
          </label>
          <label>
            Lens
            <select value={facingMode} onChange={(event) => setFacingMode(event.target.value as FacingMode)}>
              <option value="environment">Back camera</option>
              <option value="user">Front camera</option>
            </select>
          </label>
        </div>

        <p className="panel-subtitle">If you change the lens selection, tap `Start preview` again before publishing.</p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="tab active" type="button" disabled={sessionLoading} onClick={() => void provisionSession(false)}>
            {sessionLoading ? 'Provisioning...' : 'Provision session'}
          </button>
          <button className="tab" type="button" disabled={sessionLoading} onClick={() => void provisionSession(true)}>
            Refresh session
          </button>
          <button className="tab" type="button" onClick={() => void startPreview()}>
            Start preview
          </button>
          <button className="tab active" type="button" disabled={publishLoading || !session?.session_id} onClick={() => void startPublishing()}>
            {publishLoading ? 'Publishing...' : 'Start WebRTC publish'}
          </button>
          <button className="tab" type="button" onClick={() => void stopPublishing()} disabled={!publishing && !publishLoading}>
            Stop publish
          </button>
          <button className="tab" type="button" onClick={stopPreview} disabled={!previewing && !legacyUploading}>
            Stop preview
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
            <li>No phone WebRTC session provisioned yet.</li>
          </ul>
        )}
      </section>

      <section className="panel" style={{ display: 'grid', gap: 14 }}>
        <div className="panel-header">
          <p className="panel-eyebrow">Local preview</p>
          <div className="panel-title">Preview camera locally on the device</div>
          <p className="panel-subtitle">This checks framing and also supplies the stream tracks used by WebRTC publishing.</p>
          {!isSecureCameraContext ? (
            <p className="panel-subtitle" style={{ color: '#ffd2d0' }}>
              Camera access is blocked here because this page is running over plain HTTP. Use HTTPS on the phone, or test the camera page on localhost.
            </p>
          ) : null}
        </div>

        <div className="workspace-card">
          <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: '#050b16', minHeight: 320 }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', display: 'block', minHeight: 320, objectFit: 'cover', background: '#050b16' }}
            />
          </div>
        </div>
      </section>

      <section className="panel" style={{ display: 'grid', gap: 14 }}>
        <div className="panel-header">
          <p className="panel-eyebrow">Fallback</p>
          <div className="panel-title">Legacy JPEG upload fallback</div>
          <p className="panel-subtitle">This keeps the older browser-frame upload path available for debugging while the WebRTC path stabilizes. It is not the target architecture.</p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="tab" type="button" onClick={() => void startLegacyUpload()} disabled={legacyUploading}>
            {legacyUploading ? 'Uploading fallback...' : 'Start legacy fallback'}
          </button>
          <button className="tab" type="button" onClick={() => setLegacyUploading(false)} disabled={!legacyUploading}>
            Stop fallback
          </button>
        </div>
      </section>

      <ul className="compact-list">
        <li>Status: {status}</li>
        <li>Backend: {API_BASE}</li>
        <li>Tip: mount the phone above the canvas and keep AprilTags fully visible.</li>
        {error ? <li style={{ color: '#ffd2d0' }}>Error: {error}</li> : null}
      </ul>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </main>
  );
}
