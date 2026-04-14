'use client';

import { SignInButton, UserButton, useUser } from '@clerk/nextjs';
import Image from 'next/image';
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

type CameraSource = 'companion-camera' | 'browser-camera' | 'phone-webrtc' | 'external-camera' | 'kit-webrtc' | 'demo';

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
  const { user, isLoaded: userLoaded, isSignedIn } = useUser();
  const [state, setState] = useState<AppState>(mockState);
  const [backendReachable, setBackendReachable] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'create'>('dashboard');
  const [phoneViewerReady, setPhoneViewerReady] = useState(false);
  const [phoneViewerError, setPhoneViewerError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [prompt, setPrompt] = useState('simple smiley face');
  const [uploading, setUploading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [cameraSource, setCameraSource] = useState<CameraSource>('companion-camera');
  const [externalCameraUrl, setExternalCameraUrl] = useState('');
  const [sourceSaving, setSourceSaving] = useState(false);
  const [phoneSessionLoading, setPhoneSessionLoading] = useState(false);
  const [sourceTransitionTarget, setSourceTransitionTarget] = useState<CameraSource | null>(null);
  const [backendLinkCopied, setBackendLinkCopied] = useState(false);
  const [webrtcIceServers, setWebrtcIceServers] = useState<RTCIceServerConfig[]>([]);
  const [browserCameraReady, setBrowserCameraReady] = useState(false);
  const [browserCameraError, setBrowserCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const browserUploadCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisUploadBusyRef = useRef(false);
  const browserUploadBusyRef = useRef(false);
  const browserStreamRef = useRef<MediaStream | null>(null);
  const phonePcRef = useRef<RTCPeerConnection | null>(null);
  const viewerIceServers = useMemo(
    () => state.camera?.media_session?.ice_servers ?? webrtcIceServers,
    [state.camera?.media_session?.ice_servers, webrtcIceServers],
  );
  const viewerIceKey = useMemo(() => JSON.stringify(viewerIceServers), [viewerIceServers]);
  const viewerRtcConfig = useMemo(() => rtcConfiguration(viewerIceServers), [viewerIceServers]);

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
    if (sourceTransitionTarget && state.camera?.source === sourceTransitionTarget) {
      setSourceTransitionTarget(null);
    }
  }, [sourceTransitionTarget, state.camera?.source]);

  useEffect(() => {
    const source = state.camera?.source;
    if (!source) {
      return;
    }

    if (sourceTransitionTarget && source !== sourceTransitionTarget) {
      return;
    }

    if (source === 'external-camera') {
      setCameraSource('external-camera');
      setExternalCameraUrl(state.camera?.external_url ?? '');
      return;
    }

    if (source === 'companion-camera') {
      setCameraSource('companion-camera');
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

    if (source === 'kit-webrtc') {
      setCameraSource('kit-webrtc');
      return;
    }

    if (source === 'demo') {
      setCameraSource(source);
    }
  }, [sourceTransitionTarget, state.camera]);

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
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      return;
    }

    let cancelled = false;
    let viewerStarted = false;

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

        viewerStarted = true;
        const pc = new RTCPeerConnection(viewerRtcConfig);
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
      if (viewerStarted) {
        void fetch(`${API_BASE}/api/camera/phone-webrtc/viewer-stop/${sessionId}`, { method: 'POST' }).catch(() => {});
      }
    };
  }, [state.camera?.media_session?.session_id, state.camera?.source, viewerIceKey, viewerRtcConfig]);

  useEffect(() => {
    const shouldUseBrowserCamera = state.camera?.source === 'browser-camera';

    if (!shouldUseBrowserCamera) {
      setBrowserCameraReady(false);
      setBrowserCameraError(null);
      browserStreamRef.current?.getTracks().forEach((track) => track.stop());
      browserStreamRef.current = null;
      if (videoRef.current && state.camera?.source !== 'phone-webrtc') {
        videoRef.current.srcObject = null;
      }
      return;
    }

    let cancelled = false;

    const startBrowserCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 960 },
            height: { ideal: 540 },
            frameRate: { ideal: 20, max: 24 },
          },
          audio: false,
        });

        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        browserStreamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          void videoRef.current.play().catch(() => {});
        }
        setBrowserCameraReady(true);
        setBrowserCameraError(null);
      } catch (error) {
        if (!cancelled) {
          setBrowserCameraReady(false);
          setBrowserCameraError(error instanceof Error ? error.message : 'Unable to access this device camera.');
        }
      }
    };

    void startBrowserCamera();

    return () => {
      cancelled = true;
      browserStreamRef.current?.getTracks().forEach((track) => track.stop());
      browserStreamRef.current = null;
      setBrowserCameraReady(false);
    };
  }, [state.camera?.source]);

  useEffect(() => {
    if (state.camera?.source !== 'browser-camera' || !browserCameraReady) {
      return;
    }

    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || browserUploadBusyRef.current || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      browserUploadBusyRef.current = true;
      try {
        const canvas = browserUploadCanvasRef.current ?? document.createElement('canvas');
        browserUploadCanvasRef.current = canvas;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Camera canvas unavailable.');
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
          throw new Error('USB camera upload failed.');
        }
      } catch (error) {
        setBrowserCameraError(error instanceof Error ? error.message : 'USB camera upload failed.');
      } finally {
        browserUploadBusyRef.current = false;
      }
    }, 350);

    return () => {
      window.clearInterval(timer);
    };
  }, [browserCameraReady, state.camera?.source]);

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
    setSourceTransitionTarget(source);
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
      setSourceTransitionTarget(null);
      setSourceSaving(false);
    }
  };

  const provisionPhoneSession = async (forceNew = false) => {
    setPhoneSessionLoading(true);
    try {
      setSourceTransitionTarget('phone-webrtc');
      await fetch(`${API_BASE}/api/camera/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'phone-webrtc' }),
      });

      const response = await fetch(`${API_BASE}/api/camera/phone-webrtc/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_label: 'Companion camera', force_new: forceNew }),
      });
      if (!response.ok) {
        throw new Error('Failed to provision phone WebRTC session');
      }
      await response.json() as PhoneWebRTCSessionResponse;
      await refreshState();
    } finally {
      setSourceTransitionTarget(null);
      setPhoneSessionLoading(false);
    }
  };

  const activateCompanionCamera = async () => {
    await applyCameraSource('companion-camera');
  };

  const activateBrowserCamera = async () => {
    await applyCameraSource('browser-camera');
  };

  const copyBackendUrl = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(API_BASE);
      setBackendLinkCopied(true);
      window.setTimeout(() => setBackendLinkCopied(false), 1800);
    } catch {
      setBackendLinkCopied(false);
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
    (camera.source === 'browser-camera' || camera.source === 'companion-camera') &&
    !camera.latest_frame_url;
  const cameraFrameUrl = resolveMediaUrl(camera.latest_frame_url) ?? (shouldShowFallbackCameraStream ? `${API_BASE}/api/camera/stream` : null);
  const robotLeft = `${Math.max(10, Math.min(90, (robotPose.x_mm / Math.max(canvas.width_mm || 1, 1)) * 100))}%`;
  const robotTop = `${Math.max(10, Math.min(90, (robotPose.y_mm / Math.max(canvas.height_mm || 1, 1)) * 100))}%`;
  const aprilTagDetections = camera.april_tag_detections ?? [];
  const canvasBorder = camera.canvas_border ?? { corners: [], source_tag_ids: [], detected: false };
  const robotTag = aprilTagDetections.find((tag) => tag.tag_id === 4) ?? null;
  const activeTaskRecord = tasks.find((task) => task.id === activeJob.id) ?? null;
  const activePreviewUrl = overlay.image_data_url ?? svgToDataUrl(activeTaskRecord?.svg_content ?? null);
  const isHostedBackend = API_BASE.includes('onrender.com');

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
  const companionConnectionStatus =
    camera.source === 'companion-camera'
      ? (camera.online
        ? `${camera.latest_frame_label}${mediaSession.device_label ? ` (${mediaSession.device_label})` : ''}`
        : isHostedBackend
          ? 'Waiting for the Camera Buddy app. Hosted mode works, but Local Wi-Fi will feel much faster.'
          : 'Waiting for the Camera Buddy app to connect on the same Wi-Fi.')
      : 'Select Companion App on the dashboard to begin.';
  const browserCameraStatus =
    camera.source === 'browser-camera'
      ? (browserCameraReady ? 'This device camera is live and uploading.' : browserCameraError ?? 'Waiting for camera permission on this device.')
      : 'Select This Device / USB Camera to use a webcam or capture card attached to this computer.';
  const nextActionTitle = camera.online
    ? canvas.detected
      ? taskReady
        ? 'Review the overlay and run the task'
        : 'Create or load a drawing task'
      : 'Hold the camera steady on the canvas'
    : camera.source === 'companion-camera'
      ? 'Open Camera Buddy and tap Go Live'
      : camera.source === 'browser-camera'
        ? 'Grant camera access on this machine'
        : camera.source === 'external-camera'
          ? 'Paste an external feed URL'
          : 'Choose the camera path for this room';
  const nextActionCopy = camera.online
    ? canvas.detected
      ? taskReady
        ? 'The camera is live, the canvas is localized, and the task overlay is ready for operator approval.'
        : 'Localization is working. The next best move is loading a prompt or uploaded artwork into the workspace.'
      : 'Keep all AprilTags visible and centered so localization can lock in before you start drawing.'
    : camera.source === 'companion-camera'
      ? 'Open the Expo companion app, choose Local Wi-Fi for best speed, paste the backend URL once, then tap Go Live.'
      : camera.source === 'browser-camera'
        ? 'This device or USB path is best for desks with webcams, document cameras, or HDMI capture cards.'
        : camera.source === 'external-camera'
          ? 'Use this when another camera system already publishes an image or MJPEG URL that the dashboard can preview.'
          : 'Companion App is the easiest classroom path, while This Device / USB is best for fixed stations.';
  const cameraModeLabel =
    camera.source === 'companion-camera'
      ? 'Camera Buddy app'
      : camera.source === 'browser-camera'
        ? 'This device / USB'
        : camera.source === 'external-camera'
          ? 'External feed'
          : camera.source === 'phone-webrtc'
            ? 'Legacy WebRTC'
            : camera.source === 'kit-webrtc'
              ? 'Certified kit WebRTC'
              : camera.source;

  return (
    <main className="app-shell">
      <div className="top-bar compact-top-bar">
        <div>
          <p className="eyebrow">SketchBot operator UI</p>
          <h1>Operator Dashboard</h1>
          <p className="subdued-text">A calmer operator experience for classrooms and studios: sign in, pick the camera path that fits the room, and keep the robot workspace visible without digging through debug controls.</p>
        </div>
        <div className="status-pills">
          {topStatus.map((item) => (
            <span key={item.label} className="status-pill">
              {item.label}: {item.value}
            </span>
          ))}
          <ThemeToggle />
          <span className="mode-pill">{operator.mock_mode ? 'Mock' : 'Live'}</span>
          {isSignedIn ? (
            <span className="status-pill auth-pill">
              {userLoaded ? `Operator: ${user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? 'Signed in'}` : 'Loading operator'}
            </span>
          ) : null}
          {isSignedIn ? <UserButton /> : null}
          {!isSignedIn ? (
            <SignInButton mode="redirect">
              <button className="tab active" type="button">Sign in</button>
            </SignInButton>
          ) : null}
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

      <section className="panel quickstart-panel">
        <div className="panel-header" style={{ marginBottom: 0 }}>
          <p className="panel-eyebrow">Quick Start</p>
          <div className="panel-title" style={{ fontSize: '1.05rem' }}>Recommended setup flow</div>
          <p className="panel-subtitle">For most teams, the simplest path is Expo Companion on the same Wi-Fi. USB cameras stay best for fixed desks, and external feeds are best when the camera already exposes a URL.</p>
        </div>
        <div className="focus-strip">
          <div className="focus-card focus-card-primary">
            <p className="panel-eyebrow">Next Action</p>
            <div className="focus-title">{nextActionTitle}</div>
            <p className="focus-copy">{nextActionCopy}</p>
          </div>
          <div className="focus-card">
            <p className="panel-eyebrow">Camera Path</p>
            <div className="focus-title">{cameraModeLabel}</div>
            <p className="focus-copy">{camera.latest_frame_label}</p>
          </div>
          <div className="focus-card">
            <p className="panel-eyebrow">Workspace State</p>
            <div className="focus-title">{canvas.detected ? 'Canvas locked' : 'Waiting for localization'}</div>
            <p className="focus-copy">{taskReady ? `${activeJob.name ?? 'Task'} is ready to review.` : 'No active drawing task is loaded yet.'}</p>
          </div>
        </div>
        <div className="source-choice-grid">
          <div className="source-choice-card recommended">
            <div className="choice-badge">Recommended</div>
            <div className="source-choice-title">Camera Buddy App</div>
            <div className="source-choice-copy">Best for phones and tablets walking around the robot. Local Wi-Fi is the fastest classroom setup.</div>
            <button className="btn btn-primary source-choice-action" type="button" onClick={() => void activateCompanionCamera()}>
              Use Camera Buddy
            </button>
          </div>
          <div className="source-choice-card">
            <div className="source-choice-title">This Device / USB</div>
            <div className="source-choice-copy">Best for webcams, document cameras, HDMI capture cards, and fixed operator stations.</div>
            <button className="btn source-choice-action" type="button" onClick={() => void activateBrowserCamera()}>
              Use This Device
            </button>
          </div>
          <div className="source-choice-card playful-choice">
            <div className="source-choice-title">Already have a camera?</div>
            <div className="source-choice-copy">USB and external feeds are still here, but most students should start with Camera Buddy.</div>
            <button className="btn source-choice-action" type="button" onClick={() => setCameraSource('external-camera')}>
              More camera choices
            </button>
          </div>
        </div>
      </section>

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
                  <span className="section-badge">Source: {cameraModeLabel}</span>
                  <span className="section-badge">Status: {camera.source_status}</span>
                  <span className="section-badge">{camera.latest_frame_label}</span>
                  {robotTag ? <span className="section-badge">Heading: {robotPose.heading_deg.toFixed(1)} deg</span> : null}
                  </div>
                </div>

              <div className="workspace-card" style={{ minHeight: 460 }}>
                <div className="workspace-stage">
                  <div className="canvas-frame">
                    {camera.source === 'phone-webrtc' && phoneViewerReady ? (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#050b16' }}
                      />
                    ) : camera.source === 'browser-camera' && browserCameraReady ? (
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
                    ) : camera.source === 'companion-camera' && !cameraFrameUrl ? (
                      <div style={{ position: 'absolute', inset: 0, background: 'var(--stage-backdrop)', display: 'grid', placeItems: 'center', color: 'var(--text)', fontSize: 14, padding: 24, textAlign: 'center', lineHeight: 1.6 }}>
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: 8 }}>Camera Buddy waiting</div>
                          <div>{isHostedBackend ? 'Hosted mode selected' : 'Local Wi-Fi mode selected'}</div>
                          <div>{companionConnectionStatus}</div>
                          <div style={{ marginTop: 10, color: 'var(--muted)' }}>Open the Expo app, paste the backend URL once, then tap Go Live.</div>
                        </div>
                      </div>
                    ) : camera.source === 'browser-camera' && !browserCameraReady ? (
                      <div style={{ position: 'absolute', inset: 0, background: 'var(--stage-backdrop)', display: 'grid', placeItems: 'center', color: 'var(--text)', fontSize: 14, padding: 24, textAlign: 'center', lineHeight: 1.6 }}>
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: 8 }}>This device / USB camera waiting</div>
                          <div>{browserCameraStatus}</div>
                        </div>
                      </div>
                    ) : cameraFrameUrl ? (
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
              <h3>Choose Camera</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {camera.source === 'companion-camera' || cameraSource === 'companion-camera' ? (
                  <div className="guide-card">
                    <div className="panel-header" style={{ marginBottom: 0 }}>
                      <p className="panel-eyebrow">Camera Buddy</p>
                      <div className="panel-title" style={{ fontSize: '1.05rem' }}>Connect a phone or tablet</div>
                      <p className="panel-subtitle">This is the easiest setup for students. Open the Expo app, choose Local Wi-Fi if you are in the same room, paste the backend URL once, and tap Go Live.</p>
                    </div>

                    <div className="inline-actions">
                      <button className="btn btn-primary" type="button" disabled={sourceSaving} onClick={() => void activateCompanionCamera()}>
                        {sourceSaving ? 'Selecting source...' : 'Use Camera Buddy'}
                      </button>
                      <button className="btn" type="button" onClick={() => void copyBackendUrl()}>
                        {backendLinkCopied ? 'Backend copied' : 'Copy backend URL'}
                      </button>
                    </div>

                    <div className="friendly-steps">
                      <div className="friendly-step">
                        <span className="friendly-step-number">1</span>
                        <div>
                          <strong>Open the Expo app</strong>
                          <p>Use the `companion-app` project on a phone or tablet.</p>
                        </div>
                      </div>
                      <div className="friendly-step">
                        <span className="friendly-step-number">2</span>
                        <div>
                          <strong>Paste this backend URL</strong>
                          <p>{API_BASE}</p>
                        </div>
                      </div>
                      <div className="friendly-step">
                        <span className="friendly-step-number">3</span>
                        <div>
                          <strong>Tap Go Live and aim at the paper</strong>
                          <p>Local Wi-Fi is fastest. Hosted mode works, but will feel slower.</p>
                        </div>
                      </div>
                    </div>

                    <div className="phone-guidance simple-guidance">
                      <div style={{ display: 'grid', gap: 10 }}>
                        <div className="status-card guide-highlight">
                          <strong>Buddy status</strong>
                          <span>{companionConnectionStatus}</span>
                        </div>
                        <div className="status-card">
                          <strong>Current connection style</strong>
                          <span>{isHostedBackend ? 'Hosted backend' : 'Local classroom backend'}</span>
                        </div>
                        <div className="badge-line">
                          <span className="mini-pill">Frames: {camera.online ? 'live' : 'waiting'}</span>
                          <span className="mini-pill">Device: {mediaSession.device_label ?? 'not connected yet'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {camera.source === 'browser-camera' || cameraSource === 'browser-camera' ? (
                  <div className="guide-card">
                    <div className="panel-header" style={{ marginBottom: 0 }}>
                      <p className="panel-eyebrow">Desk Camera</p>
                      <div className="panel-title" style={{ fontSize: '1.05rem' }}>Use this device or a USB camera</div>
                      <p className="panel-subtitle">Best for fixed setups with webcams, document cameras, or HDMI capture cards plugged into the operator machine.</p>
                    </div>

                    <div className="inline-actions">
                      <button className="btn btn-primary" type="button" disabled={sourceSaving} onClick={() => void activateBrowserCamera()}>
                        {sourceSaving ? 'Selecting source...' : 'Use This Device Camera'}
                      </button>
                    </div>

                    <div className="status-card">
                      <strong>Status</strong>
                      <span>{browserCameraStatus}</span>
                    </div>
                  </div>
                ) : null}

                <details className="details-card">
                  <summary>Other camera choices</summary>
                  <div className="details-body" style={{ display: 'grid', gap: 12 }}>
                    <div className="source-row">
                      <button className={camera.source === 'browser-camera' || cameraSource === 'browser-camera' ? 'tab active' : 'tab'} type="button" disabled={sourceSaving} onClick={() => void activateBrowserCamera()}>
                        This Device / USB
                      </button>
                      <button className={camera.source === 'external-camera' || cameraSource === 'external-camera' ? 'tab active' : 'tab'} type="button" disabled={sourceSaving} onClick={() => setCameraSource('external-camera')}>
                        External URL
                      </button>
                      <button className={camera.source === 'phone-webrtc' ? 'tab active' : 'tab'} type="button" disabled={sourceSaving || phoneSessionLoading} onClick={() => void provisionPhoneSession(false)}>
                        Legacy WebRTC
                      </button>
                    </div>
                    {camera.source === 'external-camera' || cameraSource === 'external-camera' ? (
                      <div style={{ display: 'grid', gap: 10 }}>
                        <p className="muted-note">Use a public MJPEG or image URL when another camera system already publishes a feed.</p>
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
                    <ul className="compact-list">
                      <li>Camera Buddy is the student-friendly default for phones and tablets.</li>
                      <li>This Device / USB is best for fixed desks, webcams, and capture cards.</li>
                      <li>External URL works for preview-only feeds that already expose an image or MJPEG stream.</li>
                      <li>Certified kit WebRTC support is still reserved in the backend for future hardware bundles.</li>
                    </ul>
                    {camera.source === 'phone-webrtc' ? (
                      <div className="status-card">
                        <strong>Legacy WebRTC status</strong>
                        <span>{phoneConnectionStatus}</span>
                      </div>
                    ) : null}
                  </div>
                </details>
              </div>
            </div>

            <div className="panel">
              <h3>Live View</h3>
              <ul className="compact-list">
                <li>Backend: {backendReachable ? 'reachable' : 'unreachable'}</li>
                <li>Camera: {cameraModeLabel} / {camera.latest_frame_label}</li>
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

