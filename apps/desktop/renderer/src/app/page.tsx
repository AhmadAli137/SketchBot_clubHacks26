'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { StudentDashboard } from '@/components/student-dashboard';
import { useRuntimeConfig } from '@/lib/config';
import { useDesktopShell } from '@/lib/desktop-shell';
import { mockState } from '@/lib/mock-state';
import type {
  AppState,
  MediaSessionSummary,
  RTCIceServerConfig,
  TaskRecord,
  WebRTCConfigResponse,
} from '@/lib/types';

type CameraSource = 'companion-camera' | 'browser-camera' | 'phone-webrtc' | 'external-camera' | 'kit-webrtc' | 'demo';

function svgToDataUrl(svg: string | null | undefined) {
  if (!svg) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function resolveMediaUrl(url: string | null | undefined, apiBase: string) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return `${apiBase}${url}`;
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
  const { apiBase, wsBase } = useRuntimeConfig();
  const { pairingTargets } = useDesktopShell();

  const [state, setState] = useState<AppState>(mockState);
  const [backendReachable, setBackendReachable] = useState(false);
  const [phoneViewerReady, setPhoneViewerReady] = useState(false);
  const [phoneViewerError, setPhoneViewerError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [prompt, setPrompt] = useState('simple smiley face');
  const [uploading, setUploading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [sourceSaving, setSourceSaving] = useState(false);
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

  const refreshTasks = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/compose/tasks`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      const payload = (await response.json()) as { tasks: TaskRecord[] };
      setTasks(payload.tasks ?? []);
    } catch {
      setTasks([]);
    }
  }, [apiBase]);

  const refreshState = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/state`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch state');
      }
      const nextState = (await response.json()) as AppState;
      setState(nextState);
      setBackendReachable(true);
    } catch {
      setBackendReachable(false);
    }
  }, [apiBase]);

  const refreshWebRTCConfig = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/webrtc/config`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch WebRTC config');
      }
      const payload = (await response.json()) as WebRTCConfigResponse;
      setWebrtcIceServers(payload.ice_servers ?? []);
    } catch {
      setWebrtcIceServers([]);
    }
  }, [apiBase]);

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

    const ws = new WebSocket(wsBase);
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

    return () => {
      cancelled = true;
      window.clearInterval(statePoll);
      ws.close();
    };
  }, [refreshState, refreshTasks, refreshWebRTCConfig, wsBase]);

  useEffect(() => {
    if (sourceTransitionTarget && state.camera?.source === sourceTransitionTarget) {
      setSourceTransitionTarget(null);
    }
  }, [sourceTransitionTarget, state.camera?.source]);

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
          const response = await fetch(`${apiBase}/api/camera/phone-webrtc/publisher-offer/${sessionId}`, {
            cache: 'no-store',
          });
          if (response.ok) {
            remoteOffer = (await response.json()) as { sdp: string; type: RTCSdpType };
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
            void fetch(`${apiBase}/api/camera/phone-webrtc/viewer-live/${sessionId}`, { method: 'POST' });
          } else if (pc.connectionState === 'failed') {
            setPhoneViewerReady(false);
            setPhoneViewerError('Phone WebRTC connection failed.');
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

        const answerResponse = await fetch(`${apiBase}/api/camera/phone-webrtc/viewer-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            sdp: localDescription.sdp,
            type: localDescription.type,
          }),
        });

        if (!answerResponse.ok) {
          throw new Error('Failed to deliver the dashboard answer.');
        }
      } catch (error) {
        if (!cancelled) {
          setPhoneViewerReady(false);
          setPhoneViewerError(error instanceof Error ? error.message : 'Unable to start the phone viewer.');
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
        void fetch(`${apiBase}/api/camera/phone-webrtc/viewer-stop/${sessionId}`, { method: 'POST' }).catch(() => {});
      }
    };
  }, [apiBase, state.camera?.media_session?.session_id, state.camera?.source, viewerIceKey, viewerRtcConfig]);

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

        const response = await fetch(`${apiBase}/api/camera/browser-frame`, {
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
  }, [apiBase, browserCameraReady, state.camera?.source]);

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

        await fetch(`${apiBase}/api/camera/phone-webrtc/analysis-frame`, {
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
  }, [apiBase, phoneViewerReady, state.camera?.media_session?.session_id, state.camera?.source]);

  const applyCameraSource = async (source: CameraSource) => {
    setSourceTransitionTarget(source);
    setSourceSaving(true);
    try {
      await fetch(`${apiBase}/api/camera/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          external_url: null,
        }),
      });
      await refreshState();
    } finally {
      setSourceTransitionTarget(null);
      setSourceSaving(false);
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
      await navigator.clipboard.writeText(apiBase);
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
      await fetch(`${apiBase}/api/compose/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      await Promise.all([refreshTasks(), refreshState()]);
      setPrompt('');
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
      await fetch(`${apiBase}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      await Promise.all([refreshTasks(), refreshState()]);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const loadTask = async (task: TaskRecord) => {
    if (task.source_type !== 'prompt' || !task.prompt) {
      return;
    }

    await fetch(`${apiBase}/api/compose/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: task.prompt }),
    });
    await Promise.all([refreshTasks(), refreshState()]);
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
  const operator = state.operator ?? {
    status_text: 'Connecting to the desktop runtime',
    last_action: 'Waiting for operator',
    mock_mode: false,
    connection_mode: 'live',
  };

  const taskReady = activeJob.status === 'draft' || activeJob.status === 'planned' || activeJob.status === 'ready';
  const shouldShowFallbackCameraStream =
    camera.online &&
    (camera.source === 'browser-camera' || camera.source === 'companion-camera') &&
    !camera.latest_frame_url;
  const cameraFrameUrl = resolveMediaUrl(camera.latest_frame_url, apiBase) ?? (shouldShowFallbackCameraStream ? `${apiBase}/api/camera/stream` : null);
  const activeTaskRecord = tasks.find((task) => task.id === activeJob.id) ?? null;
  const activePreviewUrl = overlay.image_data_url ?? svgToDataUrl(activeTaskRecord?.svg_content ?? null);
  const companionBackendUrl = pairingTargets[0] ?? apiBase;

  const topStatus = useMemo(
    () => [
      { label: 'App', value: backendReachable ? 'Ready' : 'Starting' },
      { label: 'Camera', value: camera.online ? 'Live' : camera.source_status },
      { label: 'Robot', value: state.robot_connected ? 'Connected' : 'Not connected' },
    ],
    [backendReachable, camera.online, camera.source_status, state.robot_connected],
  );

  const companionConnectionStatus =
    camera.source === 'companion-camera'
      ? (camera.online
        ? `${camera.latest_frame_label}${mediaSession.device_label ? ` (${mediaSession.device_label})` : ''}`
        : 'Waiting for Camera Buddy on the same Wi-Fi.')
      : 'Choose Camera Buddy to use a phone or tablet.';
  const browserCameraStatus =
    camera.source === 'browser-camera'
      ? (browserCameraReady ? 'This computer camera is live.' : browserCameraError ?? 'Waiting for camera permission on this computer.')
      : 'Choose This Device if the camera is plugged into the computer.';

  const nextActionTitle = camera.online
    ? canvas.detected
      ? taskReady
        ? 'You are ready to draw'
        : 'Make or load a drawing'
      : 'Point the camera at the paper'
    : camera.source === 'browser-camera'
      ? 'Allow the computer camera'
      : 'Open Camera Buddy and tap Go Live';
  const nextActionCopy = camera.online
    ? canvas.detected
      ? taskReady
        ? 'Check the overlay, then start the robot when everyone is ready.'
        : 'The paper is found. Now make a drawing or load one from the recent list.'
      : 'Keep the full sheet and every AprilTag in view so SketchBot can find the page.'
    : camera.source === 'browser-camera'
      ? 'This path is best for a webcam, document camera, or USB camera plugged into the laptop.'
      : 'Camera Buddy is the easiest classroom setup. Keep the phone or tablet on the same Wi-Fi as this computer.';
  const cameraModeLabel =
    camera.source === 'browser-camera'
      ? 'This Device camera'
      : camera.source === 'companion-camera'
        ? 'Camera Buddy'
        : camera.source === 'phone-webrtc'
          ? 'Kit WebRTC'
          : 'Camera Buddy';
  const featuredTasks = tasks.slice(0, 3);

  return (
    <StudentDashboard
      topStatus={topStatus}
      operatorMode={operator.mock_mode ? 'Practice mode' : 'Live mode'}
      nextActionTitle={nextActionTitle}
      nextActionCopy={nextActionCopy}
      cameraModeLabel={cameraModeLabel}
      cameraStatus={camera.latest_frame_label}
      cameraSourceStatus={camera.source_status}
      companionConnectionStatus={companionConnectionStatus}
      browserCameraStatus={browserCameraStatus}
      companionBackendUrl={companionBackendUrl}
      backendReachable={backendReachable}
      cameraReady={camera.online}
      canvasReady={canvas.detected}
      drawingReady={taskReady}
      robotReady={state.robot_connected}
      activeJobName={activeJob.name}
      prompt={prompt}
      composing={composing}
      uploading={uploading}
      featuredTasks={featuredTasks}
      overlayPreviewUrl={activePreviewUrl}
      overlayPreviewLabel={overlay.source_name ?? activeJob.name ?? 'Overlay preview'}
      cameraFrameUrl={cameraFrameUrl}
      browserCameraReady={browserCameraReady}
      phoneViewerReady={phoneViewerReady}
      cameraSource={camera.source}
      videoRef={videoRef}
      sourceSaving={sourceSaving}
      backendLinkCopied={backendLinkCopied}
      onActivateCompanionCamera={() => void activateCompanionCamera()}
      onActivateBrowserCamera={() => void activateBrowserCamera()}
      onCopyBackendUrl={() => void copyBackendUrl()}
      onPromptChange={setPrompt}
      onSubmitPrompt={(event) => void submitPrompt(event)}
      onUploadFile={(event) => void uploadFile(event)}
      onLoadTask={(task) => void loadTask(task)}
    />
  );
}
