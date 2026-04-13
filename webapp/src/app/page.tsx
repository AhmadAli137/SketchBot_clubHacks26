'use client';

import Link from 'next/link';
import Image from 'next/image';
import QRCode from 'qrcode';
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { API_BASE, WS_BASE } from '@/lib/config';
import { ThemeToggle } from '@/components/theme-toggle';
import { mockState } from '@/lib/mock-state';
import type {
  AppState,
  MediaSessionSummary,
  PhoneWebRTCSessionResponse,
  RTCIceServerConfig,
  TaskRecord,
  WebRTCConfigResponse,
} from '@/lib/types';

type CameraSource = 'pi-camera' | 'browser-camera' | 'phone-webrtc' | 'external-camera' | 'demo';

function svgToDataUrl(svg: string | null | undefined) {
  if (!svg) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function resolveMediaUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return `${API_BASE}${url}`;
}

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

export default function HomePage() {
  const [state, setState] = useState<AppState>(mockState);
  const [backendReachable, setBackendReachable] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'create'>('dashboard');
  const [piWebrtcReady, setPiWebrtcReady] = useState(false);
  const [piWebrtcFailed, setPiWebrtcFailed] = useState(false);
  const [phoneViewerReady, setPhoneViewerReady] = useState(false);
  const [phoneViewerError, setPhoneViewerError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [prompt, setPrompt] = useState('simple smiley face');
  const [uploading, setUploading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [cameraSource, setCameraSource] = useState<CameraSource>('pi-camera');
  const [externalCameraUrl, setExternalCameraUrl] = useState('');
  const [sourceSaving, setSourceSaving] = useState(false);
  const [phoneSessionLoading, setPhoneSessionLoading] = useState(false);
  const [phoneQrDataUrl, setPhoneQrDataUrl] = useState<string | null>(null);
  const [phoneCameraUrl, setPhoneCameraUrl] = useState('');
  const [phoneLinkCopied, setPhoneLinkCopied] = useState(false);
  const [webrtcIceServers, setWebrtcIceServers] = useState<RTCIceServerConfig[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisUploadBusyRef = useRef(false);
  const piPcRef = useRef<RTCPeerConnection | null>(null);
  const phonePcRef = useRef<RTCPeerConnection | null>(null);
  const shouldUsePiWebrtc = state.camera?.source === 'pi-camera' && Boolean(state.camera?.supports_webrtc);

  const refreshTasks = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/compose/tasks`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const payload = (await response.json()) as { tasks: TaskRecord[] };
      setTasks(payload.tasks ?? []);
    } catch {
      setTasks([]);
    }
  };

  const refreshState = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/state`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch state');
      const nextState = (await response.json()) as AppState;
      setState(nextState);
      setBackendReachable(true);
    } catch {
      setBackendReachable(false);
    }
  };

  const refreshWebRTCConfig = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/webrtc/config`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch WebRTC config');
      }
      const payload = (await response.json()) as WebRTCConfigResponse;
      setWebrtcIceServers(payload.ice_servers ?? []);
    } catch {
      setWebrtcIceServers([]);
    }
  };

  useEffect(() => {
    let cancelled = false;

    void refreshState();
    void refreshTasks();
    void refreshWebRTCConfig();
    const statePoll = window.setInterval(() => {
      if (!cancelled) {
        void refreshState();
      }
    }, 5000);

    const ws = new WebSocket(WS_BASE);
    ws.onmessage = (event) => {
      try {
        const nextState = JSON.parse(event.data) as AppState;
        if (!cancelled) {
          setState(nextState);
          setBackendReachable(true);
        }
      } catch {
        // Ignore invalid snapshots.
      }
    };
    ws.onerror = () => {
      // Keep polling state even if WebSocket transport is flaky in hosted environments.
    };
    ws.onclose = () => {
      // HTTP polling remains the source of truth for basic reachability.
    };

    return () => {
      cancelled = true;
      window.clearInterval(statePoll);
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (!shouldUsePiWebrtc) {
      setPiWebrtcReady(false);
      setPiWebrtcFailed(false);
      const pc = piPcRef.current;
      if (pc) {
        pc.close();
        piPcRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      return;
    }

    let cancelled = false;

    const startPiWebRTC = async () => {
      try {
        const pc = new RTCPeerConnection(rtcConfiguration(webrtcIceServers));
        piPcRef.current = pc;

        pc.ontrack = (event) => {
          const [stream] = event.streams;
          if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => {});
            setPiWebrtcReady(true);
            setPiWebrtcFailed(false);
          }
        };

        const offer = await pc.createOffer({ offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);

        const response = await fetch(`${API_BASE}/api/webrtc/offer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
        });
        if (!response.ok) {
          throw new Error('WebRTC offer failed');
        }

        const answer = await response.json();
        if (cancelled) {
          return;
        }
        await pc.setRemoteDescription(answer);
      } catch {
        if (!cancelled) {
          setPiWebrtcFailed(true);
          setPiWebrtcReady(false);
        }
      }
    };

    void startPiWebRTC();

    return () => {
      cancelled = true;
      const pc = piPcRef.current;
      if (pc) {
        pc.close();
        piPcRef.current = null;
      }
    };
  }, [shouldUsePiWebrtc, webrtcIceServers]);

  useEffect(() => {
    const source = state.camera?.source;
    if (!source) {
      return;
    }

    if (source === 'external-camera') {
      setCameraSource('external-camera');
      setExternalCameraUrl(state.camera?.external_url ?? '');
      return;
    }

    if (source === 'phone-webrtc') {
      setCameraSource('phone-webrtc');
      return;
    }

    if (source === 'browser-camera') {
      setCameraSource('browser-camera');
      return;
    }

    if (source === 'pi-camera' || source === 'demo') {
      setCameraSource(source);
    }
  }, [state.camera]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setPhoneCameraUrl(`${window.location.origin}/camera/remote`);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const buildQrCode = async () => {
      if (!phoneCameraUrl) {
        setPhoneQrDataUrl(null);
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(phoneCameraUrl, {
          margin: 1,
          width: 220,
          color: {
            dark: '#19324d',
            light: '#f8fbff',
          },
        });

        if (!cancelled) {
          setPhoneQrDataUrl(dataUrl);
        }
      } catch {
        if (!cancelled) {
          setPhoneQrDataUrl(null);
        }
      }
    };

    void buildQrCode();

    return () => {
      cancelled = true;
    };
  }, [phoneCameraUrl]);

  useEffect(() => {
    const sessionId = state.camera?.media_session?.session_id;
    const shouldUsePhoneWebrtc = state.camera?.source === 'phone-webrtc' && Boolean(sessionId);

    if (!shouldUsePhoneWebrtc || !sessionId) {
      setPhoneViewerReady(false);
      setPhoneViewerError(null);
      const pc = phonePcRef.current;
      if (pc) {
        pc.close();
        phonePcRef.current = null;
      }
      if (!shouldUsePiWebrtc && videoRef.current) {
        videoRef.current.srcObject = null;
      }
      return;
    }

    let cancelled = false;

    const startPhoneViewer = async () => {
      try {
        setPhoneViewerReady(false);
        setPhoneViewerError(null);

        let remoteOffer: { sdp: string; type: RTCSdpType } | null = null;
        for (let attempt = 0; attempt < 60; attempt += 1) {
          const response = await fetch(`${API_BASE}/api/camera/phone-webrtc/publisher-offer/${sessionId}`, {
            cache: 'no-store',
          });
          if (response.ok) {
            const payload = await response.json() as { sdp: string; type: RTCSdpType };
            remoteOffer = payload;
            break;
          }
          await delay(1000);
        }

        if (!remoteOffer) {
          throw new Error('Timed out waiting for the phone publisher offer.');
        }

        if (cancelled) {
          return;
        }

        const pc = new RTCPeerConnection(rtcConfiguration(state.camera?.media_session?.ice_servers ?? webrtcIceServers));
        phonePcRef.current = pc;

        pc.ontrack = (event) => {
          const [stream] = event.streams;
          if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => {});
            setPhoneViewerReady(true);
            setPhoneViewerError(null);
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setPhoneViewerReady(true);
            void fetch(`${API_BASE}/api/camera/phone-webrtc/viewer-live/${sessionId}`, { method: 'POST' });
          } else if (pc.connectionState === 'failed') {
            setPhoneViewerReady(false);
            setPhoneViewerError('Phone WebRTC peer connection failed.');
          } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
            setPhoneViewerReady(false);
          }
        };

        await pc.setRemoteDescription(remoteOffer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGatheringComplete(pc);

        const localDescription = pc.localDescription;
        if (!localDescription) {
          throw new Error('Viewer local description missing.');
        }

        const answerResponse = await fetch(`${API_BASE}/api/camera/phone-webrtc/viewer-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            sdp: localDescription.sdp,
            type: localDescription.type,
          }),
        });
        if (!answerResponse.ok) {
          throw new Error('Failed to deliver dashboard viewer answer.');
        }
      } catch (error) {
        if (!cancelled) {
          setPhoneViewerReady(false);
          setPhoneViewerError(error instanceof Error ? error.message : 'Unable to start the phone WebRTC viewer.');
        }
      }
    };

    void startPhoneViewer();

    return () => {
      cancelled = true;
      const pc = phonePcRef.current;
      if (pc) {
        pc.close();
        phonePcRef.current = null;
      }
      setPhoneViewerReady(false);
      void fetch(`${API_BASE}/api/camera/phone-webrtc/viewer-stop/${sessionId}`, { method: 'POST' }).catch(() => {});
    };
  }, [shouldUsePiWebrtc, state.camera?.media_session?.ice_servers, state.camera?.media_session?.session_id, state.camera?.source, webrtcIceServers]);

  useEffect(() => {
    const sessionId = state.camera?.media_session?.session_id;
    if (state.camera?.source !== 'phone-webrtc' || !phoneViewerReady || !sessionId) {
      return;
    }

    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || analysisUploadBusyRef.current || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      analysisUploadBusyRef.current = true;
      try {
        const canvas = analysisCanvasRef.current ?? document.createElement('canvas');
        analysisCanvasRef.current = canvas;

        const targetWidth = 640;
        const aspectRatio = video.videoHeight / Math.max(video.videoWidth, 1);
        canvas.width = targetWidth;
        canvas.height = Math.max(1, Math.round(targetWidth * aspectRatio));

        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Analysis canvas context unavailable.');
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.65));
        if (!blob) {
          throw new Error('Unable to encode analysis frame.');
        }

        await fetch(`${API_BASE}/api/camera/phone-webrtc/analysis-frame`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob,
        });
      } catch {
        // Keep the live viewer running even if analysis sampling briefly fails.
      } finally {
        analysisUploadBusyRef.current = false;
      }
    }, 300);

    return () => {
      window.clearInterval(timer);
    };
  }, [phoneViewerReady, state.camera?.media_session?.session_id, state.camera?.source]);

  const applyCameraSource = async (source: CameraSource, externalUrl?: string) => {
    setCameraSource(source);
    setSourceSaving(true);
    try {
      await fetch(`${API_BASE}/api/camera/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          external_url: source === 'external-camera' ? (externalUrl ?? externalCameraUrl).trim() : null,
        }),
      });
      await refreshState();
    } finally {
      setSourceSaving(false);
    }
  };

  const provisionPhoneSession = async (forceNew = false) => {
    setPhoneSessionLoading(true);
    try {
      await fetch(`${API_BASE}/api/camera/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'phone-webrtc' }),
      });

      const response = await fetch(`${API_BASE}/api/camera/phone-webrtc/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_label: 'Dashboard operator', force_new: forceNew }),
      });
      if (!response.ok) {
        throw new Error('Failed to provision phone WebRTC session');
      }
      await response.json() as PhoneWebRTCSessionResponse;
      await refreshState();
    } finally {
      setPhoneSessionLoading(false);
    }
  };

  const connectPhoneCamera = async () => {
    setCameraSource('phone-webrtc');
    await provisionPhoneSession(false);
  };

  const copyPhoneCameraLink = async () => {
    if (!phoneCameraUrl || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(phoneCameraUrl);
      setPhoneLinkCopied(true);
      window.setTimeout(() => setPhoneLinkCopied(false), 1800);
    } catch {
      setPhoneLinkCopied(false);
    }
  };

  const submitPrompt = async (event: FormEvent) => {
    event.preventDefault();
    setComposing(true);
    try {
      await fetch(`${API_BASE}/api/compose/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      await Promise.all([refreshTasks(), refreshState()]);
      setPrompt('');
      setActiveTab('dashboard');
    } finally {
      setComposing(false);
    }
  };

  const uploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      await Promise.all([refreshTasks(), refreshState()]);
      setActiveTab('dashboard');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const loadTask = async (task: TaskRecord) => {
    if (task.source_type !== 'prompt' || !task.prompt) {
      return;
    }

    await fetch(`${API_BASE}/api/compose/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: task.prompt }),
    });
    await Promise.all([refreshTasks(), refreshState()]);
    setActiveTab('dashboard');
  };

  const activeJob = state.active_job ?? { id: null, name: null, status: 'idle', source_type: null, path_count: 0, prompt: null };
  const camera = state.camera ?? {
    online: false,
    source: 'unavailable',
    source_status: 'offline',
    latest_frame_label: 'No camera frame',
    latest_frame_url: null,
    external_url: null,
    supports_webrtc: false,
    media_session: {
      publisher_status: 'idle',
      viewer_status: 'idle',
      analysis_mode: 'direct-frame',
      ice_servers: [],
    },
    april_tag_detections: [],
    canvas_border: { corners: [], source_tag_ids: [], detected: false },
  };
  const mediaSession: MediaSessionSummary = camera.media_session ?? {
    publisher_status: 'idle',
    viewer_status: 'idle',
    analysis_mode: 'direct-frame',
    ice_servers: [],
  };
  const canvas = state.canvas ?? { detected: false, width_mm: 297, height_mm: 210, tag_ids: [0, 1, 2, 3], confidence: 0 };
  const overlay = state.overlay ?? {
    enabled: true,
    show_tags: true,
    show_path: true,
    show_robot: true,
    path_label: 'No task loaded',
    svg_path: null,
    image_data_url: null,
    source_name: null,
    source_kind: null,
  };
  const robotPose = state.robot_pose ?? { x_mm: 0, y_mm: 0, heading_deg: 0, pen_down: false };
  const operator = state.operator ?? { status_text: 'Connecting to backend', last_action: 'Waiting for operator', mock_mode: false, connection_mode: 'live' };
  const recentEvents = state.recent_events ?? [];
  const taskReady = activeJob.status === 'draft' || activeJob.status === 'planned' || activeJob.status === 'ready';
  const shouldShowFallbackCameraStream =
    camera.online &&
    camera.source !== 'phone-webrtc' &&
    camera.source !== 'external-camera' &&
    !camera.latest_frame_url;
  const cameraFrameUrl = resolveMediaUrl(camera.latest_frame_url) ?? (shouldShowFallbackCameraStream ? `${API_BASE}/api/camera/stream` : null);
  const remoteCameraUrl = '/camera/remote';
  const robotLeft = `${Math.max(10, Math.min(90, (robotPose.x_mm / Math.max(canvas.width_mm || 1, 1)) * 100))}%`;
  const robotTop = `${Math.max(10, Math.min(90, (robotPose.y_mm / Math.max(canvas.height_mm || 1, 1)) * 100))}%`;
  const aprilTagDetections = camera.april_tag_detections ?? [];
  const canvasBorder = camera.canvas_border ?? { corners: [], source_tag_ids: [], detected: false };
  const robotTag = aprilTagDetections.find((tag) => tag.tag_id === 4) ?? null;
  const activeTaskRecord = tasks.find((task) => task.id === activeJob.id) ?? null;
  const activePreviewUrl = overlay.image_data_url ?? svgToDataUrl(activeTaskRecord?.svg_content ?? null);

  const topStatus = useMemo(() => {
    return [
      { label: 'Backend', value: backendReachable ? 'Online' : 'Offline' },
      { label: 'Camera', value: camera.online ? 'Live' : camera.source_status },
      { label: 'Robot', value: state.robot_connected ? state.robot_status : 'Disconnected' },
    ];
  }, [backendReachable, camera.online, camera.source_status, state.robot_connected, state.robot_status]);

  const phoneConnectionStatus = phoneViewerReady
    ? 'Live on dashboard'
    : phoneViewerError
      ? phoneViewerError
      : camera.latest_frame_label ?? 'Waiting for phone connection';

  return (
    <main className="app-shell">
      <div className="top-bar compact-top-bar">
        <div>
          <p className="eyebrow">SketchBot operator UI</p>
          <h1>Operator Dashboard</h1>
          <p className="subdued-text">Choose a camera source, bring a phone online with one guided flow, and keep the fallback/debug tools tucked away until you actually need them.</p>
        </div>
        <div className="status-pills">
          {topStatus.map((item) => (
            <span key={item.label} className="status-pill">
              {item.label}: {item.value}
            </span>
          ))}
          <ThemeToggle />
          <span className="mode-pill">{operator.mock_mode ? 'Mock' : 'Live'}</span>
        </div>
      </div>

      <div className="tab-row">
        <button className={activeTab === 'dashboard' ? 'tab active' : 'tab'} type="button" onClick={() => setActiveTab('dashboard')}>
          Dashboard
        </button>
        <button className={activeTab === 'create' ? 'tab active' : 'tab'} type="button" onClick={() => setActiveTab('create')}>
          Create Task
        </button>
      </div>

      {activeTab === 'dashboard' ? (
        <section className="grid-main dashboard-layout">
          <div className="side-stack">
            <div className="panel" style={{ display: 'grid', gap: 10 }}>
              <div className="section-header-row" style={{ flexWrap: 'wrap' }}>
                <div>
                  <p className="panel-eyebrow">Live camera</p>
                  <div className="panel-title" style={{ fontSize: '1.2rem' }}>Robot workspace</div>
                </div>
                <div className="status-pills">
                  <span className="section-badge">Source: {camera.source}</span>
                  <span className="section-badge">Status: {camera.source_status}</span>
                  <span className="section-badge">{camera.latest_frame_label}</span>
                  {robotTag ? <span className="section-badge">Heading: {robotPose.heading_deg.toFixed(1)} deg</span> : null}
                </div>
              </div>

              <div className="workspace-card" style={{ minHeight: 460 }}>
                <div className="workspace-stage">
                  <div className="canvas-frame">
                    {shouldUsePiWebrtc && piWebrtcReady ? (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#050b16' }}
                      />
                    ) : camera.source === 'phone-webrtc' && phoneViewerReady ? (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#050b16' }}
                      />
                    ) : camera.source === 'phone-webrtc' ? (
                      <div style={{ position: 'absolute', inset: 0, background: 'var(--stage-backdrop)', display: 'grid', placeItems: 'center', color: 'var(--text)', fontSize: 14, padding: 24, textAlign: 'center', lineHeight: 1.6 }}>
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: 8 }}>Phone WebRTC viewer waiting</div>
                          <div>Session: {mediaSession.session_id ?? 'not provisioned'}</div>
                          <div>Publisher: {mediaSession.publisher_status}</div>
                          <div>Viewer: {mediaSession.viewer_status}</div>
                          <div>{phoneViewerError ?? 'Waiting for phone publisher offer or viewer negotiation.'}</div>
                        </div>
                      </div>
                    ) : cameraFrameUrl && (!shouldUsePiWebrtc || !piWebrtcFailed) ? (
                      <img
                        src={cameraFrameUrl}
                        alt={camera.latest_frame_label ?? 'Camera stream'}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: 'var(--stage-backdrop)' }}
                      />
                    ) : (
                      <div style={{ position: 'absolute', inset: 0, background: 'var(--stage-backdrop)', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        No camera frame available
                      </div>
                    )}

                    {canvasBorder.detected && (overlay.svg_path || overlay.image_data_url) ? (
                      <img
                        src={`${API_BASE}/api/camera/overlay-preview`}
                        alt={overlay.source_name ?? 'Overlay asset'}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          opacity: 0.6,
                          pointerEvents: 'none',
                        }}
                      />
                    ) : null}

                    {aprilTagDetections.map((tag) => {
                      const left = `${tag.center.x * 100}%`;
                      const top = `${tag.center.y * 100}%`;
                      const polygonPoints = tag.corners.map((corner) => `${corner.x * 100},${corner.y * 100}`).join(' ');
                      const isRobotTag = tag.tag_id === 4;
                      return (
                        <div key={tag.tag_id}>
                          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                            <polygon points={polygonPoints} fill={isRobotTag ? 'rgba(255,64,64,0.10)' : 'rgba(93,228,255,0.10)'} stroke={isRobotTag ? 'rgba(255,64,64,0.95)' : 'rgba(93,228,255,0.95)'} strokeWidth="0.45" />
                          </svg>
                          <div className="tag-pill" style={{ left, top, transform: 'translate(-50%, -50%)', position: 'absolute' }}>
                            Tag {tag.tag_id}
                          </div>
                          {isRobotTag ? (
                            <>
                              <div style={{ position: 'absolute', left, top, width: 12, height: 12, borderRadius: '999px', background: '#ff3b30', boxShadow: '0 0 18px rgba(255,59,48,0.85)', transform: 'translate(-50%, -50%)' }} />
                              <div style={{ position: 'absolute', left: `calc(${left} + 12px)`, top: `calc(${top} - 22px)`, color: '#ffd2d0', fontSize: 12, fontWeight: 700, textShadow: '0 0 12px rgba(0,0,0,0.75)' }}>
                                {robotPose.heading_deg.toFixed(1)} deg
                              </div>
                            </>
                          ) : null}
                        </div>
                      );
                    })}

                    {canvasBorder.detected || taskReady ? (
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                        {canvasBorder.detected ? (
                          <polygon
                            points={canvasBorder.corners.map((corner) => `${corner.x * 100},${corner.y * 100}`).join(' ')}
                            fill="rgba(77,226,255,0.06)"
                            stroke="rgba(77,226,255,0.95)"
                            strokeWidth="0.7"
                          />
                        ) : null}
                        {taskReady && !overlay.svg_path && !overlay.image_data_url ? (
                          <>
                            <polyline fill="none" stroke="rgba(255,79,216,0.65)" strokeWidth="0.55" strokeDasharray="2 2" points="14,30 20,30 20,18 31,18 31,44 44,44 44,22 56,22" />
                            <polyline fill="none" stroke="rgba(93,228,255,0.95)" strokeWidth="0.9" points="18,25 28,25 28,40 40,40 40,28 52,28 52,45 64,45 64,32 78,32" />
                          </>
                        ) : null}
                      </svg>
                    ) : null}

                    {taskReady ? (
                      <div className="robot-dot" style={{ left: robotLeft, top: robotTop }}>
                        <div className="robot-heading" style={{ transform: `translate(-50%, -92%) rotate(${robotPose.heading_deg}deg)` }} />
                        <div className="pen-dot" />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid-2">
              <div className="panel">
                <h3>Active Task</h3>
                <ul className="compact-list">
                  <li>Name: {activeJob.name ?? 'No active task'}</li>
                  <li>State: {activeJob.status}</li>
                  <li>Source: {activeJob.source_type ?? '--'}</li>
                  <li>Paths: {activeJob.path_count}</li>
                  <li>Overlay: {overlay.source_name ?? 'None'}</li>
                </ul>
              </div>
              <div className="panel">
                <h3>Robot Status</h3>
                <ul className="compact-list">
                  <li>Heading: {robotPose.heading_deg.toFixed(1)} deg</li>
                  <li>Position: {robotPose.x_mm.toFixed(1)}, {robotPose.y_mm.toFixed(1)} mm</li>
                  <li>Pen: {robotPose.pen_down ? 'down' : 'up'}</li>
                  <li>Robot: {state.robot_connected ? state.robot_status : 'disconnected'}</li>
                </ul>
              </div>
            </div>
          </div>

          <aside className="side-stack">
            <div className="panel">
              <h3>Camera Source</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="source-row">
                  <button className={camera.source === 'pi-camera' ? 'tab active' : 'tab'} type="button" disabled={sourceSaving} onClick={() => void applyCameraSource('pi-camera')}>
                    Raspberry Pi
                  </button>
                  <button className={camera.source === 'phone-webrtc' || cameraSource === 'phone-webrtc' ? 'tab active' : 'tab'} type="button" disabled={sourceSaving || phoneSessionLoading} onClick={() => setCameraSource('phone-webrtc')}>
                    Phone Camera
                  </button>
                  <button className={cameraSource === 'external-camera' ? 'tab active' : 'tab'} type="button" disabled={sourceSaving} onClick={() => setCameraSource('external-camera')}>
                    More Sources
                  </button>
                </div>

                {camera.source === 'phone-webrtc' || cameraSource === 'phone-webrtc' ? (
                  <div className="guide-card">
                    <div className="panel-header" style={{ marginBottom: 0 }}>
                      <p className="panel-eyebrow">Guided Phone Flow</p>
                      <div className="panel-title" style={{ fontSize: '1.05rem' }}>Connect phone camera</div>
                      <p className="panel-subtitle">Start the phone flow here, then open the remote camera page from the QR code. The phone page will handle preview and publishing automatically.</p>
                    </div>

                    <div className="inline-actions">
                      <button className="btn btn-primary" type="button" disabled={phoneSessionLoading} onClick={() => void connectPhoneCamera()}>
                        {phoneSessionLoading ? 'Preparing phone session...' : 'Connect Phone Camera'}
                      </button>
                      <button className="btn" type="button" disabled={!phoneCameraUrl} onClick={() => void copyPhoneCameraLink()}>
                        {phoneLinkCopied ? 'Link copied' : 'Copy phone link'}
                      </button>
                    </div>

                    <div className="phone-guidance">
                      <div className="qr-shell">
                        {phoneQrDataUrl ? (
                          <img src={phoneQrDataUrl} alt="QR code to open the phone camera page" width={180} height={180} />
                        ) : (
                          <div className="qr-placeholder">QR loading</div>
                        )}
                      </div>
                      <div style={{ display: 'grid', gap: 10 }}>
                        <div className="status-card">
                          <strong>Status</strong>
                          <span>{phoneConnectionStatus}</span>
                        </div>
                        <div className="status-card">
                          <strong>Open on phone</strong>
                          <span>{phoneCameraUrl || remoteCameraUrl}</span>
                        </div>
                        <div className="badge-line">
                          <span className="mini-pill">Session: {mediaSession.session_id ?? 'pending'}</span>
                          <span className="mini-pill">Publisher: {mediaSession.publisher_status}</span>
                          <span className="mini-pill">Viewer: {mediaSession.viewer_status}</span>
                        </div>
                      </div>
                    </div>

                    <details className="details-card">
                      <summary>Advanced phone controls</summary>
                      <div className="details-body">
                        <ul className="compact-list">
                          <li>Phone page: <Link href="/camera/remote">{remoteCameraUrl}</Link></li>
                          <li>Analysis mode: {mediaSession.analysis_mode}</li>
                          <li>ICE servers: {mediaSession.ice_servers?.length ?? webrtcIceServers.length}</li>
                        </ul>
                        <div className="inline-actions">
                          <button className="tab active" type="button" disabled={phoneSessionLoading} onClick={() => void provisionPhoneSession(false)}>
                            {phoneSessionLoading ? 'Provisioning...' : 'Provision session'}
                          </button>
                          <button className="tab" type="button" disabled={phoneSessionLoading} onClick={() => void provisionPhoneSession(true)}>
                            Refresh session
                          </button>
                        </div>
                      </div>
                    </details>
                  </div>
                ) : null}

                {camera.source === 'external-camera' || cameraSource === 'external-camera' ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <p className="muted-note">Preview a public MJPEG or image URL without changing the rest of the workflow.</p>
                    <input
                      value={externalCameraUrl}
                      onChange={(event) => setExternalCameraUrl(event.target.value)}
                      placeholder="https://camera-host/stream.mjpg"
                    />
                    <button className="tab active" type="button" disabled={sourceSaving || !externalCameraUrl.trim()} onClick={() => void applyCameraSource('external-camera', externalCameraUrl)}>
                      Save external camera
                    </button>
                  </div>
                ) : null}

                <details className="details-card">
                  <summary>More sources and debugging</summary>
                  <div className="details-body" style={{ display: 'grid', gap: 12 }}>
                    <div className="source-row">
                      <button className={camera.source === 'browser-camera' ? 'tab active' : 'tab'} type="button" disabled={sourceSaving} onClick={() => void applyCameraSource('browser-camera')}>
                        Legacy Upload
                      </button>
                      <button className={camera.source === 'external-camera' ? 'tab active' : 'tab'} type="button" disabled={sourceSaving} onClick={() => setCameraSource('external-camera')}>
                        External URL
                      </button>
                    </div>
                    <ul className="compact-list">
                      <li>Legacy upload keeps the older JPEG path available while WebRTC stabilizes.</li>
                      <li>External URL is best for preview-only camera feeds that already expose an image or MJPEG stream.</li>
                    </ul>
                  </div>
                </details>
              </div>
            </div>

            <div className="panel">
              <h3>Live View</h3>
              <ul className="compact-list">
                <li>Backend: {backendReachable ? 'reachable' : 'unreachable'}</li>
                <li>Camera: {camera.source} / {camera.latest_frame_label}</li>
                <li>Canvas detected: {canvas.detected ? 'yes' : 'no'}</li>
                <li>Localization: {Math.round(state.localization_confidence * 100)}%</li>
                <li>Mode: {operator.mock_mode ? 'mock' : 'live'}</li>
              </ul>
            </div>

            <div className="panel">
              <h3>Current Overlay Preview</h3>
              {activePreviewUrl ? (
                <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(120,140,255,0.16)', background: 'white' }}>
                  <Image
                    src={activePreviewUrl}
                    alt={overlay.source_name ?? activeJob.name ?? 'Overlay preview'}
                    width={512}
                    height={512}
                    unoptimized
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>
              ) : (
                <ul className="compact-list">
                  <li>No generated or uploaded overlay asset loaded yet.</li>
                </ul>
              )}
              <ul className="compact-list" style={{ marginTop: 12 }}>
                <li>Source: {overlay.source_name ?? 'none'}</li>
                <li>Kind: {overlay.source_kind ?? 'none'}</li>
                <li>Status: {activeJob.status}</li>
              </ul>
            </div>

            <div className="panel">
              <h3>Recent Activity</h3>
              <ul className="compact-list">
                {recentEvents.slice(0, 5).map((event, index) => (
                  <li key={`${index}-${event}`}>{event}</li>
                ))}
              </ul>
            </div>
          </aside>
        </section>
      ) : (
        <section className="grid-main dashboard-layout">
          <div className="side-stack">
            <div className="panel">
              <h2>Create Task</h2>
              <p className="subdued-text" style={{ marginBottom: 16 }}>Type a prompt or upload a black-and-white SVG/image. Finished tasks should immediately feel like overlays, not a separate workflow.</p>

              <form onSubmit={submitPrompt} style={{ display: 'grid', gap: 12 }}>
                <label className="block text-sm">
                  <span className="mb-2 block text-[var(--muted)]">Prompt</span>
                  <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} placeholder="simple house outline" className="w-full rounded-2xl border border-[rgba(120,140,255,0.16)] bg-[rgba(5,8,22,0.8)] px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300/40 focus:shadow-[0_0_0_4px_rgba(77,226,255,0.08)]" />
                </label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button className="tab active" type="submit" disabled={composing || !prompt.trim()}>
                    {composing ? 'Generating...' : 'Generate overlay'}
                  </button>
                  <label className="tab" style={{ cursor: uploading ? 'progress' : 'pointer' }}>
                    {uploading ? 'Uploading...' : 'Upload SVG / image'}
                    <input type="file" accept=".svg,image/*" onChange={uploadFile} style={{ display: 'none' }} />
                  </label>
                </div>
              </form>
            </div>
          </div>

          <aside className="side-stack">
            <div className="panel">
              <h3>Saved items</h3>
              <ul className="compact-list">
                {tasks.length === 0 ? <li>No saved items yet.</li> : tasks.slice(0, 8).map((task) => {
                  const previewUrl = task.image_data_url ?? svgToDataUrl(task.svg_content ?? null);
                  return (
                    <li key={task.id} style={{ display: 'grid', gap: 8 }}>
                      {previewUrl ? (
                        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(120,140,255,0.16)', background: 'white', maxWidth: 180 }}>
                          <Image
                            src={previewUrl}
                            alt={task.name}
                            width={256}
                            height={256}
                            unoptimized
                            style={{ width: '100%', height: 'auto', display: 'block' }}
                          />
                        </div>
                      ) : null}
                      <strong>{task.name}</strong>
                      <span>{task.source_type}</span>
                      {task.prompt ? <span>{task.prompt}</span> : null}
                      <button className="tab" type="button" onClick={() => void loadTask(task)}>
                        Load into dashboard
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </section>
      )}
    </main>
  );
}

