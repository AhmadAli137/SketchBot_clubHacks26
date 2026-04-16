import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { BarcodeScanningResult, CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  type DimensionValue,
  type GestureResponderEvent,
  Image,
  type LayoutChangeEvent,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  requireNativeComponent,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  type MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
  mediaDevices,
  registerGlobals,
} from 'react-native-webrtc';

import { colors } from './src/theme';
import type { CameraBuddyPage } from './src/screens/types';
import { SplashScreen } from './src/screens/SplashScreen';
import { TutorPanel } from './src/screens/TutorPanel';

const STORAGE_KEY = 'sketchbot-camera-buddy-room';
const DEFAULT_PORT = '8787';

type SavedConfig = {
  backendUrl: string;
  classroomName?: string;
  teacherName?: string;
  students?: string[];
  bots?: string[];
};

type RTCIceServerConfig = {
  urls: string | string[];
  username?: string | null;
  credential?: string | null;
};

type PhoneWebRTCSessionResponse = {
  accepted: boolean;
  source: string;
  source_status: string;
  session_id: string;
  ingest_protocol: string;
  viewer_protocol: string;
  publisher_status: string;
  viewer_status: string;
  analysis_mode: string;
  whip_url: string | null;
  viewer_path: string | null;
  device_label?: string | null;
  ice_servers: RTCIceServerConfig[];
  message: string;
};

type BackendStateSnapshot = {
  canvas?: {
    detected?: boolean;
    tag_ids?: number[];
  };
  camera?: {
    frame_width?: number;
    frame_height?: number;
    april_tag_detections?: AprilTagDetection[];
    canvas_border?: CanvasBorder;
  };
  overlay?: {
    image_data_url?: string | null;
    svg_path?: string | null;
  };
};

type Point2D = {
  x: number;
  y: number;
};

type AprilTagDetection = {
  tag_id: number;
  family?: string;
  center?: Point2D;
  corners: Point2D[];
  decision_margin?: number;
};

type CanvasBorder = {
  corners: Point2D[];
  source_tag_ids?: number[];
  detected: boolean;
};

type ScanFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type StageRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type NativeMarkerOverlayViewProps = {
  overlayPayload: string;
  style?: object;
};

type ClassroomJoinDetails = {
  backendUrl: string;
  classroomName?: string;
  teacherName?: string;
  students?: string[];
  bots?: string[];
};

try {
  registerGlobals();
} catch {
  // Ignore duplicate registration during Fast Refresh.
}

const NativeMarkerOverlayView =
  Platform.OS === 'android'
    ? requireNativeComponent<NativeMarkerOverlayViewProps>('SketchbotMarkerOverlayView')
    : null;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldIgnoreSavedRoomUrl(value: string) {
  if (!value) {
    return true;
  }

  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`);
    const hostname = url.hostname.toLowerCase();

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    if (
      hostname.startsWith('172.24.') ||
      hostname.startsWith('172.25.') ||
      hostname.startsWith('172.26.') ||
      hostname.startsWith('172.27.') ||
      hostname.startsWith('172.28.') ||
      hostname.startsWith('172.29.') ||
      hostname.startsWith('172.30.') ||
      hostname.startsWith('172.31.')
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function normalizeLocalRuntimeUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  try {
    const url = new URL(candidate);
    url.pathname = '';
    url.search = '';
    url.hash = '';

    if (!url.port || url.port === '3000' || url.port === '3001') {
      url.port = DEFAULT_PORT;
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    return trimmed;
  }
}

function parseDelimitedList(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseClassroomJoinValue(value: string): ClassroomJoinDetails | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        roomUrl?: string;
        classroomName?: string;
        teacherName?: string;
        students?: string[];
        bots?: string[];
      };

      if (!parsed.roomUrl) {
        return null;
      }

      return {
        backendUrl: normalizeLocalRuntimeUrl(parsed.roomUrl),
        classroomName: parsed.classroomName?.trim() || undefined,
        teacherName: parsed.teacherName?.trim() || undefined,
        students: parsed.students?.filter(Boolean) ?? [],
        bots: parsed.bots?.filter(Boolean) ?? [],
      };
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'sketchbot:' && url.hostname === 'classroom') {
      const roomUrl = url.searchParams.get('room');
      if (!roomUrl) {
        return null;
      }

      return {
        backendUrl: normalizeLocalRuntimeUrl(roomUrl),
        classroomName: url.searchParams.get('name')?.trim() || undefined,
        teacherName: url.searchParams.get('teacher')?.trim() || undefined,
        students: parseDelimitedList(url.searchParams.get('students')),
        bots: parseDelimitedList(url.searchParams.get('bots')),
      };
    }
  } catch {
    // Fall back to raw room URL parsing.
  }

  const normalized = normalizeLocalRuntimeUrl(trimmed);
  if (!normalized) {
    return null;
  }

  return { backendUrl: normalized };
}

function waitForIceGatheringComplete(pc: RTCPeerConnection, timeoutMs = 2500) {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (pc.iceGatheringState === 'complete') {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

function rtcConfiguration(iceServers: RTCIceServerConfig[]) {
  return {
    iceServers: iceServers.map((server) => ({
      urls: server.urls,
      username: server.username ?? undefined,
      credential: server.credential ?? undefined,
    })),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function extractScanFrame(
  result: BarcodeScanningResult,
  layout: { width: number; height: number },
): ScanFrame | null {
  const rawPoints = (
    result as BarcodeScanningResult & {
      cornerPoints?: Array<{ x: number; y: number }>;
    }
  ).cornerPoints;

  if (!layout.width || !layout.height || !rawPoints || rawPoints.length < 3) {
    return null;
  }

  const xs = rawPoints.map((point) => Number(point.x)).filter((value) => Number.isFinite(value));
  const ys = rawPoints.map((point) => Number(point.y)).filter((value) => Number.isFinite(value));

  if (!xs.length || !ys.length) {
    return null;
  }

  const left = clamp(Math.min(...xs), 0, layout.width);
  const top = clamp(Math.min(...ys), 0, layout.height);
  const right = clamp(Math.max(...xs), 0, layout.width);
  const bottom = clamp(Math.max(...ys), 0, layout.height);
  const width = right - left;
  const height = bottom - top;

  if (width < 32 || height < 32) {
    return null;
  }

  return { left, top, width, height };
}

function computeMediaStageRect(
  containerWidth: number,
  containerHeight: number,
  sourceAspectRatio: number,
  fitMode: 'cover' | 'contain',
): StageRect {
  if (!containerWidth || !containerHeight || !sourceAspectRatio || sourceAspectRatio <= 0) {
    return { left: 0, top: 0, width: containerWidth, height: containerHeight };
  }

  const containerAspectRatio = containerWidth / containerHeight;
  const useWidth =
    fitMode === 'cover'
      ? containerAspectRatio > sourceAspectRatio
      : containerAspectRatio < sourceAspectRatio;

  if (useWidth) {
    const width = containerWidth;
    const height = width / sourceAspectRatio;
    return {
      left: 0,
      top: (containerHeight - height) / 2,
      width,
      height,
    };
  }

  const height = containerHeight;
  const width = height * sourceAspectRatio;
  return {
    left: (containerWidth - width) / 2,
    top: 0,
    width,
    height,
  };
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const previewShellRef = useRef<View | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const connectionMonitorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanLineProgress = useRef(new Animated.Value(0)).current;
  const liveIndicatorAnim = useRef(new Animated.Value(1)).current;
  const splashFloatAnim = useRef(new Animated.Value(0)).current;
  const splashPulseAnim = useRef(new Animated.Value(0)).current;
  const sessionIdRef = useRef<string | null>(null);
  const lastScannedRoomRef = useRef<string | null>(null);
  const lastScannedAtRef = useRef(0);
  const lastPreviewTapAtRef = useRef(0);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [backendUrl, setBackendUrl] = useState('');
  const [classroomName, setClassroomName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [studentNames, setStudentNames] = useState<string[]>([]);
  const [botNames, setBotNames] = useState<string[]>([]);
  const [cameraFacing, setCameraFacing] = useState<CameraType>('back');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState('Point the phone at the classroom code on SketchBot Desktop, then tap Go Live.');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<PhoneWebRTCSessionResponse | null>(null);
  const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);
  const [cameraSurfaceMode, setCameraSurfaceMode] = useState<'scanner' | 'stream'>('scanner');
  const [currentPage, setCurrentPage] = useState<CameraBuddyPage>('splash');
  const [scanFrame, setScanFrame] = useState<ScanFrame | null>(null);
  const [scannerLayout, setScannerLayout] = useState({ width: 0, height: 0 });
  const [previewViewport, setPreviewViewport] = useState({ width: 0, height: 0 });
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [pendingRoomUrl, setPendingRoomUrl] = useState<string | null>(null);
  const [manualJoinInput, setManualJoinInput] = useState('');
  const [previewZoom, setPreviewZoom] = useState(0);
  const [showFullscreenPreview, setShowFullscreenPreview] = useState(false);
  const [launchCurtainVisible, setLaunchCurtainVisible] = useState(false);
  const [launchCurtainText, setLaunchCurtainText] = useState('Warming up Camera Buddy...');
  const [liveCanvasDetected, setLiveCanvasDetected] = useState(false);
  const [liveAprilTagCount, setLiveAprilTagCount] = useState(0);
  const [liveAprilTagDetections, setLiveAprilTagDetections] = useState<AprilTagDetection[]>([]);
  const [liveCanvasBorder, setLiveCanvasBorder] = useState<CanvasBorder>({ corners: [], detected: false });
  const [liveFrameAspectRatio, setLiveFrameAspectRatio] = useState<number | null>(null);
  const [showLiveOverlay, setShowLiveOverlay] = useState(false);
  const [overlayRefreshToken, setOverlayRefreshToken] = useState(0);
  const scanLockPlayer = useAudioPlayer(require('./assets/sounds/scan-lock.wav'), { keepAudioSessionActive: true });
  const startCameraPlayer = useAudioPlayer(require('./assets/sounds/start-camera.wav'), { keepAudioSessionActive: true });
  const liveReadyPlayer = useAudioPlayer(require('./assets/sounds/live-ready.wav'), { keepAudioSessionActive: true });

  const cleanedBackendUrl = useMemo(() => normalizeLocalRuntimeUrl(backendUrl), [backendUrl]);
  const classroomLabel = classroomName || 'SketchBot classroom';
  const primaryButtonLabel = busy ? 'Joining classroom...' : streaming ? 'Stop Camera' : 'Go Live';
  const shouldAutoScanRoomCode =
    Boolean(permission?.granted) && !streaming && !busy && currentPage === 'connect' && !pendingRoomUrl;
  const isLandscape = width > height;
  const previewAspectRatio = isLandscape ? 16 / 9 : 3 / 4;
  const livePreviewHeight = useMemo(() => {
    return isLandscape ? Math.min(height * 0.76, 560) : Math.min(height * 0.6, 680);
  }, [height, isLandscape]);
  const fullscreenPreviewHeight = useMemo(() => {
    return isLandscape ? Math.max(height - 110, 280) : Math.max(height - 180, 360);
  }, [height, isLandscape]);
  const previewScale = useMemo(() => 1 + previewZoom * 0.95, [previewZoom]);
  const liveOverlayUri = useMemo(() => {
    if (!cleanedBackendUrl || !showLiveOverlay || overlayRefreshToken <= 0) {
      return null;
    }
    return `${cleanedBackendUrl}/api/camera/overlay-preview?ts=${overlayRefreshToken}`;
  }, [cleanedBackendUrl, overlayRefreshToken, showLiveOverlay]);
  const liveMarkerOverlayUri = useMemo(() => {
    if (!cleanedBackendUrl || overlayRefreshToken <= 0 || (!liveAprilTagDetections.length && !liveCanvasBorder.detected)) {
      return null;
    }
    return `${cleanedBackendUrl}/api/camera/marker-overlay?ts=${overlayRefreshToken}`;
  }, [cleanedBackendUrl, overlayRefreshToken, liveAprilTagDetections.length, liveCanvasBorder.detected]);
  const shouldUseBackendOverlayImages = Platform.OS !== 'android';
  const nativeOverlayPayload = useMemo(
    () =>
      JSON.stringify({
        detections: liveAprilTagDetections.map((detection) => ({
          tagId: detection.tag_id,
          corners: detection.corners,
        })),
        canvasBorder: liveCanvasBorder,
      }),
    [liveAprilTagDetections, liveCanvasBorder],
  );
  const guideSize = useMemo(() => {
    if (!scannerLayout.width || !scannerLayout.height) {
      return 0;
    }

    return Math.min(scannerLayout.width * 0.72, scannerLayout.height * 0.72);
  }, [scannerLayout.height, scannerLayout.width]);
  const guideLeft = useMemo(() => (scannerLayout.width - guideSize) / 2, [guideSize, scannerLayout.width]);
  const guideTop = useMemo(() => (scannerLayout.height - guideSize) / 2 - 8, [guideSize, scannerLayout.height]);
  const scanLineOffset = scanLineProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(guideSize - 8, 0)],
  });

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    scanLockPlayer.volume = 0.42;
    startCameraPlayer.volume = 0.46;
    liveReadyPlayer.volume = 0.48;
  }, [liveReadyPlayer, scanLockPlayer, startCameraPlayer]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return;
        }
        const saved = JSON.parse(raw) as Partial<SavedConfig>;
        if (saved.backendUrl) {
          const normalized = normalizeLocalRuntimeUrl(saved.backendUrl);
          if (!shouldIgnoreSavedRoomUrl(normalized)) {
            setBackendUrl(normalized);
          }
        }
        const savedClassroomName = saved.classroomName?.trim() || '';
        const savedTeacherName = saved.teacherName?.trim() || '';
        setClassroomName(savedClassroomName);
        setTeacherName(savedTeacherName);
        setStudentNames(saved.students?.filter(Boolean) ?? []);
        setBotNames(saved.bots?.filter(Boolean) ?? []);
        setManualJoinInput(savedClassroomName || saved.backendUrl || '');
      } catch {
        // Ignore storage failures and allow a fresh room scan.
      }
    };

    void loadConfig();
  }, []);

  useEffect(() => {
    const motion = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(splashFloatAnim, {
            toValue: 1,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(splashFloatAnim, {
            toValue: 0,
            duration: 1800,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(splashPulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(splashPulseAnim, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    motion.start();

    const timer = setTimeout(() => {
      setCurrentPage((current) => (current === 'splash' ? 'menu' : current));
    }, 2600);

    return () => {
      motion.stop();
      clearTimeout(timer);
    };
  }, [splashFloatAnim, splashPulseAnim]);

  useEffect(() => {
    void AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        backendUrl: cleanedBackendUrl || backendUrl,
        classroomName,
        teacherName,
        students: studentNames,
        bots: botNames,
      } satisfies SavedConfig),
    ).catch(() => {});
  }, [backendUrl, botNames, cleanedBackendUrl, classroomName, studentNames, teacherName]);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (streaming) {
      return;
    }

    if (!permission?.granted) {
      setStatus('Allow camera access so Camera Buddy can scan the classroom code automatically.');
      return;
    }

    if (!cleanedBackendUrl) {
      setStatus('Point the phone at the classroom code on SketchBot Desktop.');
      return;
    }

    setStatus(`${classroomLabel} is ready. Tap Go Live to start the live camera stream.`);
  }, [classroomLabel, cleanedBackendUrl, permission?.granted, streaming]);

  const applyJoinDetails = (details: ClassroomJoinDetails) => {
    setBackendUrl(details.backendUrl);
    setClassroomName(details.classroomName ?? '');
    setTeacherName(details.teacherName ?? '');
    setStudentNames(details.students ?? []);
    setBotNames(details.bots ?? []);
    setManualJoinInput(details.classroomName ?? details.backendUrl);
  };

  useEffect(() => {
    if (currentPage !== 'connect' || !shouldAutoScanRoomCode || scanFrame || !guideSize) {
      scanLineProgress.stopAnimation();
      scanLineProgress.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineProgress, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineProgress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();

    return () => {
      animation.stop();
      scanLineProgress.stopAnimation();
    };
  }, [currentPage, guideSize, scanFrame, scanLineProgress, shouldAutoScanRoomCode]);

  // ─── LIVE indicator pulse ──────────────────────────────────────────────
  useEffect(() => {
    if (!streaming) {
      liveIndicatorAnim.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(liveIndicatorAnim, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(liveIndicatorAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => { pulse.stop(); };
  }, [streaming, liveIndicatorAnim]);

  const playUiSound = useCallback((player: { seekTo: (value: number) => void; play: () => void }) => {
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // Ignore sound effect failures on devices that haven't finished loading the asset yet.
    }
  }, []);

  const updatePreviewZoom = useCallback((nextZoom: number) => {
    setPreviewZoom(clamp(Number(nextZoom.toFixed(2)), 0, 1));
  }, []);

  const handlePreviewTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      if (event.nativeEvent.touches.length < 2) {
        return;
      }

      const [firstTouch, secondTouch] = event.nativeEvent.touches;
      const distance = Math.hypot(secondTouch.pageX - firstTouch.pageX, secondTouch.pageY - firstTouch.pageY);
      pinchStartDistanceRef.current = distance;
      pinchStartZoomRef.current = previewZoom;
    },
    [previewZoom],
  );

  const handlePreviewTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      if (event.nativeEvent.touches.length < 2 || pinchStartDistanceRef.current === null) {
        return;
      }

      const [firstTouch, secondTouch] = event.nativeEvent.touches;
      const distance = Math.hypot(secondTouch.pageX - firstTouch.pageX, secondTouch.pageY - firstTouch.pageY);
      const distanceDelta = distance - pinchStartDistanceRef.current;
      updatePreviewZoom(pinchStartZoomRef.current + distanceDelta / 280);
    },
    [updatePreviewZoom],
  );

  const handlePreviewTouchEnd = useCallback(() => {
    pinchStartDistanceRef.current = null;
    pinchStartZoomRef.current = previewZoom;
  }, [previewZoom]);

  const handlePreviewPress = useCallback(() => {
    if (!streaming) {
      return;
    }

    const now = Date.now();
    if (now - lastPreviewTapAtRef.current < 260) {
      setShowFullscreenPreview(true);
    }
    lastPreviewTapAtRef.current = now;
  }, [streaming]);

  const ensurePermission = async () => {
    if (permission?.granted) {
      return true;
    }
    const next = await requestPermission();
    return next.granted;
  };

  const pingBackend = async (targetBackendUrl: string) => {
    const response = await fetch(`${targetBackendUrl}/api/state`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Classroom check failed (${response.status}).`);
    }
  };

  const provisionSession = async (targetBackendUrl: string) => {
    const response = await fetch(`${targetBackendUrl}/api/camera/phone-webrtc/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_label: 'Camera Buddy',
        force_new: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Could not start the live classroom (${response.status}).`);
    }

    const payload = (await response.json()) as PhoneWebRTCSessionResponse;
    setSession(payload);
    sessionIdRef.current = payload.session_id;
    return payload;
  };

  const stopStreaming = useCallback(
    async (options?: { preserveStatus?: boolean }) => {
      const sessionId = sessionIdRef.current;
      const pc = peerConnectionRef.current;
      if (pc) {
        pc.close();
        peerConnectionRef.current = null;
      }
      if (connectionMonitorRef.current) {
        clearInterval(connectionMonitorRef.current);
        connectionMonitorRef.current = null;
      }

      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStreamUrl(null);
      setStreaming(false);
      setShowFullscreenPreview(false);
      setCameraSurfaceMode('scanner');
      setScanFrame(null);
      setBusy(false);
      setLaunchCurtainVisible(false);

      if (sessionId && cleanedBackendUrl) {
        try {
          await fetch(`${cleanedBackendUrl}/api/camera/phone-webrtc/publisher-stop/${sessionId}`, { method: 'POST' });
        } catch {
          // Ignore cleanup failures; the next room join will reset the session.
        }
      }

      if (!options?.preserveStatus) {
        setStatus('Camera Buddy stopped. Head back into the classroom when you are ready again.');
      }
    },
    [cleanedBackendUrl],
  );

  const ensureLocalStream = async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    const facingMode = cameraFacing === 'back' ? 'environment' : 'user';
    const stream = await mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 },
        facingMode,
      },
    });

    localStreamRef.current = stream;
    setLocalStreamUrl(stream.toURL());
    return stream;
  };

  const startStreaming = async () => {
    if (busy || streaming) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const granted = await ensurePermission();
      if (!granted) {
        throw new Error('Camera permission is required.');
      }

      if (!cleanedBackendUrl) {
        throw new Error('Point Camera Buddy at the classroom code first.');
      }

      setLaunchCurtainVisible(true);
      setLaunchCurtainText(`Checking ${classroomLabel}...`);
      setStatus(`Checking ${classroomLabel}...`);
      await pingBackend(cleanedBackendUrl);

      setLaunchCurtainText(`Opening ${classroomLabel}...`);
      setStatus(`Opening ${classroomLabel}...`);
      const activeSession = await provisionSession(cleanedBackendUrl);
      setCameraSurfaceMode('stream');
      await wait(300);
      const stream = await ensureLocalStream();

      const pc = new RTCPeerConnection(rtcConfiguration(activeSession.ice_servers));
      peerConnectionRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);

      const localDescription = pc.localDescription;
      if (!localDescription?.sdp) {
        throw new Error('The live stream offer was not created.');
      }

      const offerResponse = await fetch(`${cleanedBackendUrl}/api/camera/phone-webrtc/publisher-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSession.session_id,
          sdp: localDescription.sdp,
          type: localDescription.type,
        }),
      });

      if (!offerResponse.ok) {
        throw new Error(`SketchBot Desktop did not accept the live stream offer (${offerResponse.status}).`);
      }

      setLaunchCurtainText(`Connecting to ${classroomLabel}...`);
      setStatus(`Connecting the live stream to ${classroomLabel}...`);

      let remoteAnswer: { sdp: string; type: 'answer' } | null = null;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const answerResponse = await fetch(
          `${cleanedBackendUrl}/api/camera/phone-webrtc/viewer-answer/${activeSession.session_id}`,
          { cache: 'no-store' },
        );

        if (answerResponse.ok) {
          remoteAnswer = (await answerResponse.json()) as { sdp: string; type: 'answer' };
          break;
        }

        await wait(400);
      }

      if (!remoteAnswer?.sdp) {
        throw new Error('SketchBot Desktop took too long to answer the live stream.');
      }

      await pc.setRemoteDescription(new RTCSessionDescription(remoteAnswer));
      setLaunchCurtainText(`Syncing the live camera with ${classroomLabel}...`);
      setStatus(`${classroomLabel} is connecting to SketchBot Desktop now...`);

      let lastConnectionState = pc.connectionState;
      const connectionDeadline = Date.now() + 20000;
      connectionMonitorRef.current = setInterval(() => {
        const nextState = pc.connectionState;
        if (nextState === lastConnectionState && Date.now() < connectionDeadline) {
          return;
        }

        lastConnectionState = nextState;

        if (nextState === 'connected') {
          if (connectionMonitorRef.current) {
            clearInterval(connectionMonitorRef.current);
            connectionMonitorRef.current = null;
          }
          setStreaming(true);
          setBusy(false);
          setLaunchCurtainVisible(false);
          setError(null);
          setStatus(`${classroomLabel} is live on the same Wi-Fi.`);
          playUiSound(liveReadyPlayer);
          void fetch(`${cleanedBackendUrl}/api/camera/phone-webrtc/publisher-live/${activeSession.session_id}`, {
            method: 'POST',
          });
          return;
        }

        if (nextState === 'failed' || nextState === 'closed' || Date.now() >= connectionDeadline) {
          if (connectionMonitorRef.current) {
            clearInterval(connectionMonitorRef.current);
            connectionMonitorRef.current = null;
          }
          setError('The live stream could not connect to SketchBot Desktop.');
          setStatus('Camera Buddy could not finish the live connection.');
          setLaunchCurtainVisible(false);
          void stopStreaming({ preserveStatus: true });
        }
      }, 250);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Camera Buddy could not start the live stream.';
      setError(message);
      setStatus('Camera Buddy could not start the classroom stream.');
      setLaunchCurtainVisible(false);
      await stopStreaming({ preserveStatus: true });
    }
  };

  const handlePrimaryAction = async () => {
    if (streaming) {
      await stopStreaming();
      return;
    }

    await startStreaming();
  };

  const flipCamera = async () => {
    const nextFacing = cameraFacing === 'back' ? 'front' : 'back';
    if (streaming || localStreamRef.current) {
      await stopStreaming({ preserveStatus: true });
      setStatus('Camera flipped. Start the classroom camera again when you are ready.');
    }
    setCameraFacing(nextFacing);
    setCameraSurfaceMode('scanner');
  };

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    const { data } = result;
    if (!shouldAutoScanRoomCode || !data) {
      return;
    }

    const joinDetails = parseClassroomJoinValue(data);
    if (!joinDetails?.backendUrl) {
      return;
    }

    const now = Date.now();
    if (lastScannedRoomRef.current === joinDetails.backendUrl && now - lastScannedAtRef.current < 2500) {
      return;
    }

    const nextScanFrame = extractScanFrame(result, scannerLayout);
    lastScannedRoomRef.current = joinDetails.backendUrl;
    lastScannedAtRef.current = now;
    applyJoinDetails(joinDetails);
    setScanFrame(nextScanFrame);
    setPendingRoomUrl(joinDetails.backendUrl);
    setShowManualEntry(false);
    setError(null);
    setStatus(`${joinDetails.classroomName || 'Classroom'} found. Start the camera when you are ready.`);
    playUiSound(scanLockPlayer);
  };

  const handleScannerLayout = (event: LayoutChangeEvent) => {
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    setScannerLayout({ width: nextWidth, height: nextHeight });
  };

  const handlePreviewLayout = (event: LayoutChangeEvent) => {
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    setPreviewViewport({ width: nextWidth, height: nextHeight });
  };

  const renderMarkerOverlayContent = () => {
    return (
      <>
        {shouldUseBackendOverlayImages && liveMarkerOverlayUri ? (
          <Image
            source={{ uri: liveMarkerOverlayUri }}
            resizeMode="stretch"
            style={[
              styles.liveOverlayImage,
              {
                width: '100%' as DimensionValue,
                height: '100%' as DimensionValue,
              },
            ]}
          />
        ) : null}
        {renderVisionOverlay()}
      </>
    );
  };

  const openConnectPage = () => {
    setScanFrame(null);
    setPendingRoomUrl(null);
    setError(null);
    setCurrentPage('connect');
    setStatus(
      cleanedBackendUrl
        ? 'Point at the classroom code again, or paste a new classroom link.'
        : 'Point the phone at the classroom code on SketchBot Desktop.',
    );
  };

  const openLivePage = () => {
    if (!cleanedBackendUrl) {
      setError('Paste the classroom link or scan the classroom code first.');
      setShowManualEntry(true);
      setCurrentPage('connect');
      return;
    }

    setScanFrame(null);
    setPendingRoomUrl(null);
    setError(null);
    setStatus(`${classroomLabel} is ready. Tap Go Live whenever you want to stream.`);
    setCurrentPage('live');
  };

  const startFromLockedRoom = async () => {
    setPendingRoomUrl(null);
    setError(null);
    setCurrentPage('live');
    playUiSound(startCameraPlayer);
    setStatus(`Starting ${classroomLabel}...`);
    await wait(120);
    await startStreaming();
  };

  const rescanRoomCode = () => {
    setPendingRoomUrl(null);
    setScanFrame(null);
    setError(null);
    setStatus('Point the phone at the classroom code on SketchBot Desktop.');
  };

  const returnToConnectPage = async () => {
    if (streaming) {
      await stopStreaming({ preserveStatus: true });
    }

    setCurrentPage('menu');
    setScanFrame(null);
    setPendingRoomUrl(null);
    setError(null);
    setShowManualEntry(false);
    setPreviewZoom(0);
    setShowFullscreenPreview(false);
    setStatus(cleanedBackendUrl ? 'Saved classroom ready.' : 'Choose what you want Camera Buddy to do.');
  };

  useEffect(() => {
    return () => {
      void stopStreaming({ preserveStatus: true });
    };
  }, [stopStreaming]);

  useEffect(() => {
      if (!cleanedBackendUrl || currentPage !== 'live') {
      setLiveCanvasDetected(false);
      setLiveAprilTagCount(0);
      setLiveAprilTagDetections([]);
        setLiveCanvasBorder({ corners: [], detected: false });
        setLiveFrameAspectRatio(null);
        setShowLiveOverlay(false);
        setOverlayRefreshToken(0);
        return;
    }

    let cancelled = false;

    const refreshLiveState = async () => {
      try {
        const response = await fetch(`${cleanedBackendUrl}/api/state`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });

        if (!response.ok || cancelled) {
          return;
        }

        const payload = (await response.json()) as BackendStateSnapshot;
        const canvasDetected = Boolean(payload.canvas?.detected);
        const detections = payload.camera?.april_tag_detections ?? [];
        const aprilTagCount = detections.length;
        const canvasBorder = payload.camera?.canvas_border ?? { corners: [], detected: false };
        const frameWidth = payload.camera?.frame_width ?? 0;
        const frameHeight = payload.camera?.frame_height ?? 0;
        const nextAspectRatio =
          frameWidth > 0 && frameHeight > 0 ? frameWidth / frameHeight : null;
        const overlayAvailable = Boolean(payload.overlay?.image_data_url || payload.overlay?.svg_path);
        const markerOverlayAvailable = detections.length > 0 || Boolean(canvasBorder.detected);

        if (cancelled) {
          return;
        }

        setLiveCanvasDetected(canvasDetected);
        setLiveAprilTagCount(aprilTagCount);
        setLiveAprilTagDetections(detections);
        setLiveCanvasBorder(canvasBorder);
        setLiveFrameAspectRatio(nextAspectRatio);
        setShowLiveOverlay(canvasDetected && overlayAvailable);

        if ((canvasDetected && overlayAvailable) || markerOverlayAvailable) {
          setOverlayRefreshToken(Date.now());
        }
      } catch {
        // Keep the preview running even if the classroom state endpoint blips.
      }
    };

    void refreshLiveState();
    const timer = setInterval(() => {
      void refreshLiveState();
    }, 1100);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cleanedBackendUrl, currentPage]);

  const renderVisionOverlay = () => {
    if (!liveAprilTagDetections.length && !liveCanvasBorder.detected) {
      return null;
    }

    if (Platform.OS === 'android' && NativeMarkerOverlayView) {
      return (
        <NativeMarkerOverlayView
          overlayPayload={nativeOverlayPayload}
          style={StyleSheet.absoluteFill}
        />
      );
    }

    return (
      <View
        pointerEvents="none"
        style={[
          styles.visionOverlay,
        ]}
      >
        {liveAprilTagDetections.map((detection) => {
          const xs = detection.corners.map((corner) => corner.x);
          const ys = detection.corners.map((corner) => corner.y);
          const left = `${Math.min(...xs) * 100}%` as DimensionValue;
          const top = `${Math.min(...ys) * 100}%` as DimensionValue;
          const width = `${(Math.max(...xs) - Math.min(...xs)) * 100}%` as DimensionValue;
          const height = `${(Math.max(...ys) - Math.min(...ys)) * 100}%` as DimensionValue;

          return (
            <View key={`tag-${detection.tag_id}`} style={styles.tagOverlayGroup}>
              <View style={[styles.tagBox, { left, top, width, height }]} />
              <View style={[styles.tagLabel, { left, top }]}>
                <Text style={styles.tagLabelText}>Tag {detection.tag_id}</Text>
              </View>
            </View>
          );
        })}

        {liveCanvasBorder.detected
          ? liveCanvasBorder.corners.map((corner, index) => (
              <View
                key={`border-${index}`}
                style={[
                  styles.borderDot,
                  {
                    left: `${corner.x * 100}%` as DimensionValue,
                    top: `${corner.y * 100}%` as DimensionValue,
                  },
                ]}
              />
            ))
          : null}
      </View>
    );
  };

  const renderCameraSurface = (surfaceHeight: number, options?: { fullscreen?: boolean }) => {
    const fullscreen = options?.fullscreen ?? false;
    const sourceAspectRatio = liveFrameAspectRatio ?? previewAspectRatio;
    const stageRect = computeMediaStageRect(
      previewViewport.width || width,
      previewViewport.height || surfaceHeight,
      sourceAspectRatio,
      'cover',
    );
    const shellStyle = fullscreen
      ? [styles.cameraViewport, styles.fullscreenCameraViewport, { height: surfaceHeight }]
      : [styles.cameraViewport, { height: surfaceHeight }];
    const mediaTransform = [{ scale: previewScale }];
    const mediaStageStyle = [
      styles.mediaStage,
      {
        left: stageRect.left,
        top: stageRect.top,
        width: stageRect.width,
        height: stageRect.height,
        transform: mediaTransform,
      },
    ];
    const overlayStageStyle = [
      styles.mediaStageOverlay,
      {
        left: stageRect.left,
        top: stageRect.top,
        width: stageRect.width,
        height: stageRect.height,
        transform: mediaTransform,
      },
    ];
    const mediaStyle = fullscreen
      ? [
          styles.camera,
          styles.liveCamera,
          styles.fullscreenMedia,
          {
            width: '100%' as DimensionValue,
            height: '100%' as DimensionValue,
            aspectRatio: undefined,
          },
        ]
      : [
          styles.camera,
          styles.liveCamera,
          {
            width: '100%' as DimensionValue,
            height: '100%' as DimensionValue,
            aspectRatio: undefined,
          },
        ];

    return (
      <Pressable onPress={handlePreviewPress}>
        <View
          ref={!fullscreen ? previewShellRef : undefined}
          collapsable={false}
          style={shellStyle}
          onLayout={handlePreviewLayout}
          onTouchStart={handlePreviewTouchStart}
          onTouchMove={handlePreviewTouchMove}
          onTouchEnd={handlePreviewTouchEnd}
          onTouchCancel={handlePreviewTouchEnd}
        >
          {(cameraSurfaceMode === 'stream' && localStreamUrl) || permission?.granted ? (
            <>
              <View style={mediaStageStyle}>
                {cameraSurfaceMode === 'stream' && localStreamUrl ? (
                  <RTCView
                    streamURL={localStreamUrl}
                    objectFit="cover"
                    mirror={cameraFacing === 'front'}
                    zOrder={0}
                    style={mediaStyle}
                  />
                ) : (
                  <CameraView
                    style={mediaStyle}
                    facing={cameraFacing}
                    zoom={previewZoom}
                  />
                  )}
                </View>
                <View pointerEvents="none" style={overlayStageStyle}>
                  {shouldUseBackendOverlayImages && streaming && liveOverlayUri ? (
                    <Image
                      source={{ uri: liveOverlayUri }}
                      resizeMode="cover"
                      style={[
                        styles.liveOverlayImage,
                        {
                          width: '100%' as DimensionValue,
                          height: '100%' as DimensionValue,
                        },
                      ]}
                    />
                  ) : null}
                  {renderMarkerOverlayContent()}
                </View>
            </>
          ) : cameraSurfaceMode === 'stream' ? (
            <View style={[styles.camera, styles.cameraPlaceholder, styles.liveCamera, { height: surfaceHeight }]}>
              <ActivityIndicator color="#4ac7f0" size="large" />
              <Text style={styles.cameraPlaceholderText}>Starting the live camera...</Text>
            </View>
          ) : (
            <View style={[styles.camera, styles.cameraPlaceholder, styles.liveCamera, { height: surfaceHeight }]}>
              <Text style={styles.cameraPlaceholderText}>Camera access is required before Camera Buddy can go live.</Text>
            </View>
          )}
          {streaming ? (
            <View style={styles.liveOverlay} pointerEvents="none">
              <Animated.View style={[styles.liveIndicator, { opacity: liveIndicatorAnim }]}>
                <View style={styles.liveIndicatorDot} />
                <Text style={styles.liveIndicatorText}>LIVE</Text>
              </Animated.View>
            </View>
          ) : null}
          {fullscreen ? (
            <View pointerEvents="none" style={styles.fullscreenHintBadge}>
              <Text style={styles.fullscreenHintBadgeText}>Pinch to zoom</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.container, isLandscape ? styles.containerLandscape : null]}>
          {currentPage === 'splash' ? (
            <SplashScreen splashFloatAnim={splashFloatAnim} splashPulseAnim={splashPulseAnim} />
          ) : currentPage === 'menu' ? (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroGlowA} />
                <View style={styles.heroGlowB} />
                <Text style={styles.eyebrow}>SketchBot Camera Buddy</Text>
                <Text style={styles.title}>Choose a mission</Text>
                <Text style={styles.subtitle}>
                  Camera Buddy can help you join a classroom, run the live camera, and grow into more companion tools over time.
                </Text>
                <View style={styles.heroPillRow}>
                  <View style={styles.heroStatPill}>
                    <Text style={styles.heroStatLabel}>Best start</Text>
                    <Text style={styles.heroStatValue}>Scan classroom code</Text>
                  </View>
                  <View style={styles.heroStatPill}>
                    <Text style={styles.heroStatLabel}>Wi-Fi</Text>
                    <Text style={styles.heroStatValue}>Same room</Text>
                  </View>
                </View>
              </View>

              <View style={styles.menuGrid}>
                <Pressable style={[styles.menuCard, styles.menuCardPrimary]} onPress={openConnectPage}>
                  <View style={styles.menuCardOrbitA} />
                  <View style={styles.menuCardOrbitB} />
                  <Text style={[styles.menuEyebrow, styles.menuEyebrowPrimary]}>Best for kids</Text>
                  <Text style={[styles.menuTitle, styles.menuTitlePrimary]}>Scan classroom code</Text>
                  <Text style={[styles.menuCopy, styles.menuCopyPrimary]}>Open the scanner and lock onto the classroom QR from SketchBot Desktop.</Text>
                  <View style={styles.menuCardFooter}>
                    <View style={styles.menuCardActionPill}>
                      <Text style={styles.menuCardActionText}>Open scanner</Text>
                    </View>
                    <Text style={styles.menuCardMeta}>Fastest path</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={[styles.menuCard, !cleanedBackendUrl ? styles.menuCardDisabled : null]}
                  onPress={openLivePage}
                  disabled={!cleanedBackendUrl}
                >
                  <Text style={styles.menuEyebrow}>Quick return</Text>
                  <Text style={styles.menuTitle}>Open saved classroom</Text>
                  <Text style={styles.menuCopy}>
                    {classroomName || (cleanedBackendUrl ? 'Saved classroom' : 'Save a classroom first by scanning or pasting a link.')}
                  </Text>
                  <View style={styles.menuCardFooter}>
                    <View style={[styles.menuCardActionPill, styles.menuCardActionPillSoft]}>
                      <Text style={styles.menuCardActionText}>Resume</Text>
                    </View>
                  </View>
                </Pressable>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>More companion tools</Text>
                <View style={styles.toolList}>
                  <View style={styles.toolItem}>
                    <Text style={styles.toolTitle}>Camera setup</Text>
                    <Text style={styles.toolCopy}>Live now</Text>
                  </View>
                  <View style={styles.toolItem}>
                    <Text style={styles.toolTitle}>Classroom join</Text>
                    <Text style={styles.toolCopy}>Live now</Text>
                  </View>
                  <View style={styles.toolItem}>
                    <Text style={styles.toolTitle}>Paper check</Text>
                    <Text style={styles.toolCopy}>Coming soon</Text>
                  </View>
                </View>
                <Pressable style={styles.secondaryMenuButton} onPress={() => setShowManualEntry((current) => !current)}>
                  <Text style={styles.secondaryMenuButtonText}>{showManualEntry ? 'Hide classroom link box' : 'Paste classroom link instead'}</Text>
                </Pressable>
              </View>

              {showManualEntry ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Paste the classroom link</Text>
                  <Text style={styles.label}>Classroom link from SketchBot Desktop</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder="Paste the classroom link from the desktop app"
                    placeholderTextColor="#89a0c2"
                    style={styles.input}
                    value={manualJoinInput}
                    onChangeText={setManualJoinInput}
                    onBlur={() => {
                      if (manualJoinInput.trim()) {
                        const parsed = parseClassroomJoinValue(manualJoinInput);
                        if (parsed) {
                          applyJoinDetails(parsed);
                        }
                      }
                    }}
                  />
                  <Text style={styles.helperText}>
                    This link carries the classroom name and the hidden local room connection details together.
                  </Text>
                  <Pressable
                    style={[styles.primaryButton, !cleanedBackendUrl ? styles.buttonDisabled : null]}
                    disabled={!cleanedBackendUrl}
                    onPress={openLivePage}
                  >
                    <Text style={styles.primaryButtonText}>Open classroom</Text>
                  </Pressable>
                </View>
              ) : null}

              {error ? (
                <View style={styles.card}>
                  <View style={styles.statusCard}>
                    <Text style={styles.statusText}>{status}</Text>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                </View>
              ) : null}
            </>
          ) : currentPage === 'connect' ? (
            <>
              <View style={styles.connectHeader}>
                <Text style={styles.eyebrow}>SketchBot Camera Buddy</Text>
                <Text style={styles.title}>Scan the classroom code</Text>
                <Text style={styles.subtitle}>
                  Point the phone at the QR code on SketchBot Desktop. Camera Buddy will lock onto the classroom, then you can start the live camera in one tap.
                </Text>
              </View>

              <View style={styles.scannerCard}>
                <View
                  style={[styles.scannerShell, isLandscape ? styles.cameraShellLandscape : null]}
                  onLayout={handleScannerLayout}
                >
                  {permission?.granted && cameraSurfaceMode === 'scanner' ? (
                    <View>
                      <CameraView
                        style={[styles.scannerCamera, { aspectRatio: previewAspectRatio }]}
                        facing={cameraFacing}
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={shouldAutoScanRoomCode ? handleBarcodeScanned : undefined}
                      />
                      <View style={styles.scanOverlay}>
                        <View style={styles.scanStatusPill}>
                          <View style={[styles.scanStatusDot, scanFrame ? styles.scanStatusDotLocked : null]} />
                          <Text style={styles.scanStatusText}>{scanFrame ? 'Classroom locked' : 'Looking for classroom code'}</Text>
                        </View>
                        {scanFrame ? (
                          <View
                            style={[
                              styles.lockedScanFrame,
                              {
                                left: scanFrame.left,
                                top: scanFrame.top,
                                width: scanFrame.width,
                                height: scanFrame.height,
                              },
                            ]}
                          >
                            <View style={[styles.scanCorner, styles.scanCornerTopLeft]} />
                            <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
                            <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
                            <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.scanGuideFrame,
                              {
                                width: guideSize,
                                height: guideSize,
                                left: guideLeft,
                                top: guideTop,
                              },
                            ]}
                          >
                            <Animated.View
                              style={[
                                styles.scanLine,
                                {
                                  transform: [{ translateY: scanLineOffset }],
                                },
                              ]}
                            />
                            <View style={[styles.scanCorner, styles.scanCornerTopLeft]} />
                            <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
                            <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
                            <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />
                          </View>
                        )}
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.scannerCamera, styles.cameraPlaceholder, { aspectRatio: previewAspectRatio }]}>
                      <Text style={styles.cameraPlaceholderText}>We&apos;ll ask for camera permission so Camera Buddy can scan the classroom code.</Text>
                    </View>
                  )}
                </View>
                <View style={styles.scannerFooter}>
                  <Text style={styles.scannerFooterCopy}>
                    The scanner stays here until the classroom locks, so kids can line it up without feeling rushed.
                  </Text>
                  <View style={styles.scannerActions}>
                    <Pressable style={styles.scannerSecondaryButton} onPress={() => void flipCamera()}>
                      <Text style={styles.scannerSecondaryButtonText}>
                        {cameraFacing === 'back' ? 'Switch camera' : 'Use back camera'}
                      </Text>
                    </Pressable>
                    <Pressable style={styles.scannerSecondaryButton} onPress={() => setShowManualEntry((current) => !current)}>
                      <Text style={styles.scannerSecondaryButtonText}>{showManualEntry ? 'Hide link box' : 'Paste classroom link'}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {showManualEntry ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Paste the classroom link</Text>
                  <Text style={styles.label}>Classroom link from SketchBot Desktop</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder="Paste the classroom link from the desktop app"
                    placeholderTextColor="#89a0c2"
                    style={styles.input}
                    value={manualJoinInput}
                    onChangeText={setManualJoinInput}
                    onBlur={() => {
                      if (manualJoinInput.trim()) {
                        const parsed = parseClassroomJoinValue(manualJoinInput);
                        if (parsed) {
                          applyJoinDetails(parsed);
                        }
                      }
                    }}
                  />
                  <Text style={styles.helperText}>
                    This link carries the classroom name and the hidden local room connection details together.
                  </Text>
                  <Pressable
                    style={[styles.primaryButton, !cleanedBackendUrl ? styles.buttonDisabled : null]}
                    disabled={!cleanedBackendUrl}
                    onPress={openLivePage}
                  >
                    <Text style={styles.primaryButtonText}>Open classroom</Text>
                  </Pressable>
                </View>
              ) : null}

              {error ? (
                <View style={styles.card}>
                  <View style={styles.statusCard}>
                    <Text style={styles.statusText}>{status}</Text>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <View style={[styles.liveExperience, isLandscape ? styles.liveExperienceLandscape : null]}>
                <View style={[styles.liveViewerColumn, isLandscape ? styles.liveViewerColumnLandscape : null]}>
                  <View style={styles.liveTopBar}>
                    <Pressable style={styles.liveBackButton} onPress={() => void returnToConnectPage()}>
                      <Text style={styles.liveBackButtonText}>Back</Text>
                    </Pressable>
                    <View style={styles.liveTopBarMeta}>
                      <Text style={styles.liveTopBarEyebrow}>Classroom camera</Text>
                      <Text style={styles.liveTopBarTitle} numberOfLines={1}>{classroomLabel}</Text>
                    </View>
                    {streaming ? (
                      <View style={styles.liveStatusBadge}>
                        <View style={styles.liveStatusBadgeDot} />
                        <Text style={styles.liveStatusBadgeText}>Live</Text>
                      </View>
                    ) : null}
                  </View>

                  <View
                    style={[
                      styles.cameraShell,
                      styles.liveCameraShell,
                      styles.livePreviewShell,
                      isLandscape ? styles.livePreviewShellLandscape : null,
                    ]}
                  >
                    {renderCameraSurface(livePreviewHeight)}
                  </View>

                  <View style={[styles.liveHintRow, isLandscape ? styles.liveHintRowLandscape : null]}>
                    <Text style={styles.liveHintText}>Pinch anywhere on the camera to zoom.</Text>
                    <Text style={styles.liveHintText}>Turn the phone sideways for a wider view.</Text>
                    <Text style={styles.liveHintText}>Double tap the picture for fullscreen.</Text>
                    <Text style={styles.liveHintText}>
                      {liveCanvasDetected
                        ? `Page found${liveAprilTagCount ? ` · ${liveAprilTagCount} tags locked` : ''}.`
                        : 'Looking for AprilTags and the page border.'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.liveInfoColumn, isLandscape ? styles.liveInfoColumnLandscape : null]}>
                  <View style={styles.liveInfoCard}>
                    <Text style={styles.liveInfoEyebrow}>Ready check</Text>
                    <Text style={styles.liveInfoTitle}>{streaming ? 'Camera is live' : 'Camera is ready'}</Text>
                    <Text style={styles.liveInfoCopy}>
                      {streaming
                        ? 'Keep the whole page and all AprilTags visible while the classroom watches the stream.'
                        : 'Aim at the paper now, then start the camera when you are happy with the framing.'}
                    </Text>
                    <View style={styles.liveRosterPillRow}>
                      {teacherName ? (
                        <View style={styles.liveRosterPill}>
                          <Text style={styles.liveRosterPillLabel}>Teacher</Text>
                          <Text style={styles.liveRosterPillValue}>{teacherName}</Text>
                        </View>
                      ) : null}
                      {studentNames.length ? (
                        <View style={styles.liveRosterPill}>
                          <Text style={styles.liveRosterPillLabel}>Students</Text>
                          <Text style={styles.liveRosterPillValue}>{studentNames.length}</Text>
                        </View>
                      ) : null}
                      {botNames.length ? (
                        <View style={styles.liveRosterPill}>
                          <Text style={styles.liveRosterPillLabel}>Robots</Text>
                          <Text style={styles.liveRosterPillValue}>{botNames.length}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.liveActionCard}>
                    <View style={styles.statusCard}>
                      <Text style={styles.statusText}>{streaming ? `${classroomLabel} is live on the same Wi-Fi.` : status}</Text>
                      {!busy && teacherName ? <Text style={styles.helperText}>Teacher: {teacherName}</Text> : null}
                      {!busy && studentNames.length ? <Text style={styles.helperText}>Students: {studentNames.join(', ')}</Text> : null}
                      {!busy && botNames.length ? <Text style={styles.helperText}>Robots: {botNames.join(', ')}</Text> : null}
                      {!busy && session?.session_id ? <Text style={styles.helperText}>Live session: {session.session_id}</Text> : null}
                      {error ? <Text style={styles.errorText}>{error}</Text> : null}
                    </View>

                    <Pressable
                      style={[styles.primaryButton, busy ? styles.buttonDisabled : null, streaming ? styles.primaryButtonStop : null]}
                      onPress={() => void handlePrimaryAction()}
                      disabled={busy}
                    >
                      {busy ? <ActivityIndicator color="#14233c" /> : <Text style={styles.primaryButtonText}>{primaryButtonLabel}</Text>}
                    </Pressable>
                    <Text style={styles.helperText}>
                      The live camera fills more of the screen automatically in landscape, and fullscreen opens right from the preview.
                    </Text>
                  </View>

                  {cleanedBackendUrl ? (
                    <TutorPanel
                      backendUrl={cleanedBackendUrl}
                      studentName={studentNames[0] || 'Student'}
                      ageGroup="builder"
                    />
                  ) : null}
                </View>
              </View>
            </>
          )}
        </ScrollView>
        <Modal
          animationType="fade"
          transparent={false}
          visible={showFullscreenPreview}
          onRequestClose={() => setShowFullscreenPreview(false)}
        >
          <View style={styles.fullscreenBackdrop}>
            <StatusBar style="light" />
            <View style={styles.fullscreenTopBar}>
              <Pressable style={styles.fullscreenBackButton} onPress={() => setShowFullscreenPreview(false)}>
                <Text style={styles.fullscreenBackButtonText}>Back</Text>
              </Pressable>
              <View style={styles.fullscreenTitleWrap}>
                <Text style={styles.fullscreenEyebrow}>Fullscreen live view</Text>
                <Text style={styles.fullscreenTitle} numberOfLines={1}>{classroomLabel}</Text>
              </View>
              {streaming ? (
                <View style={styles.fullscreenLiveBadge}>
                  <View style={styles.fullscreenLiveDot} />
                  <Text style={styles.fullscreenLiveText}>Live</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.fullscreenPreviewShell}>{renderCameraSurface(fullscreenPreviewHeight, { fullscreen: true })}</View>
          </View>
        </Modal>
        <Modal
          animationType="fade"
          transparent
          visible={launchCurtainVisible}
          onRequestClose={() => {}}
        >
          <View style={styles.launchCurtainBackdrop}>
            <View style={styles.launchCurtainCard}>
              <Animated.View
                style={[
                  styles.launchCurtainGlow,
                  {
                    transform: [
                      {
                        scale: splashPulseAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.92, 1.08],
                        }),
                      },
                    ],
                    opacity: splashPulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.18, 0.34],
                    }),
                  },
                ]}
              />
              <View style={styles.launchCurtainBadge}>
                <Text style={styles.launchCurtainBadgeText}>Camera Buddy</Text>
              </View>
              <Text style={styles.launchCurtainTitle}>Starting the live camera</Text>
              <Text style={styles.launchCurtainCopy}>
                Get ready. We&apos;re slipping into the classroom quietly so you only see the smooth part.
              </Text>
              <View style={styles.launchCurtainLoaderRow}>
                <ActivityIndicator color="#7be0ff" size="small" />
                <Text style={styles.launchCurtainLoaderText}>{launchCurtainText}</Text>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          animationType="fade"
          transparent
          visible={currentPage === 'connect' && Boolean(pendingRoomUrl)}
          onRequestClose={rescanRoomCode}
        >
          <View style={styles.lockModalBackdrop}>
            <View style={styles.lockModalCard}>
              <View style={styles.lockModalBadge}>
                <Text style={styles.lockModalBadgeText}>Classroom locked</Text>
              </View>
              <Text style={styles.lockModalTitle}>Ready to start the camera?</Text>
              <Text style={styles.lockModalCopy}>
                Camera Buddy found the classroom and is holding the lock so the scan doesn&apos;t drift away.
              </Text>
              <Text style={styles.lockModalRoom}>{classroomLabel}</Text>
              {teacherName ? <Text style={styles.helperText}>Teacher: {teacherName}</Text> : null}
              {studentNames.length ? <Text style={styles.helperText}>Students: {studentNames.join(', ')}</Text> : null}
              {botNames.length ? <Text style={styles.helperText}>Robots: {botNames.join(', ')}</Text> : null}
              <View style={styles.lockModalActions}>
                <Pressable style={styles.lockModalSecondaryButton} onPress={rescanRoomCode}>
                  <Text style={styles.lockModalSecondaryText}>Scan again</Text>
                </Pressable>
                <Pressable style={styles.lockModalPrimaryButton} onPress={() => void startFromLockedRoom()}>
                  <Text style={styles.lockModalPrimaryText}>Start camera</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  container: {
    padding: 18,
    gap: 16,
  },
  containerLandscape: {
    paddingHorizontal: 24,
  },
  splashScreen: {
    minHeight: 620,
    borderRadius: 34,
    overflow: 'hidden',
    padding: 28,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    backgroundColor: '#121934',
    shadowColor: '#1f3760',
    shadowOpacity: 0.26,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
  splashTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  splashOrbA: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 999,
    top: -30,
    right: -40,
    backgroundColor: '#79d5ff',
    opacity: 0.34,
  },
  splashOrbB: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    bottom: -90,
    left: -40,
    backgroundColor: '#ffb6df',
    opacity: 0.42,
  },
  splashBadge: {
    marginBottom: 18,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  splashBadgeText: {
    color: '#f3f8ff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  splashMiniPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(123, 224, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.18)',
  },
  splashMiniPillText: {
    color: '#cdefff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  splashDevice: {
    alignSelf: 'stretch',
    height: 220,
    marginBottom: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashDeviceGlow: {
    position: 'absolute',
    width: 240,
    height: 140,
    borderRadius: 999,
    backgroundColor: 'rgba(121, 213, 255, 0.18)',
  },
  splashDeviceScreen: {
    width: '88%',
    maxWidth: 320,
    aspectRatio: 3 / 4,
    borderRadius: 28,
    padding: 18,
    backgroundColor: '#0a1122',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashDeviceChip: {
    position: 'absolute',
    top: 16,
    width: 72,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  splashDeviceFrame: {
    width: '72%',
    aspectRatio: 1,
    position: 'relative',
  },
  splashDeviceCorner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#7be0ff',
  },
  splashDeviceCornerTopLeft: {
    top: 0,
    left: 0,
    borderLeftWidth: 4,
    borderTopWidth: 4,
    borderTopLeftRadius: 16,
  },
  splashDeviceCornerTopRight: {
    top: 0,
    right: 0,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderTopRightRadius: 16,
  },
  splashDeviceCornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderBottomLeftRadius: 16,
  },
  splashDeviceCornerBottomRight: {
    bottom: 0,
    right: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: 16,
  },
  splashTitle: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 12,
  },
  splashCopy: {
    fontSize: 17,
    lineHeight: 25,
    color: '#d6e8ff',
    maxWidth: '90%',
  },
  splashFeatureRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    flexWrap: 'wrap',
  },
  splashFeaturePill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  splashFeaturePillText: {
    color: '#f6fbff',
    fontSize: 13,
    fontWeight: '800',
  },
  splashLoadingRow: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  splashLoadingText: {
    color: '#dcecff',
    fontSize: 14,
    fontWeight: '700',
  },
  menuGrid: {
    gap: 12,
  },
  menuCard: {
    borderRadius: 28,
    padding: 20,
    backgroundColor: '#0d1525',
    borderWidth: 1,
    borderColor: '#1c2a46',
    shadowColor: '#97a6cf',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
    overflow: 'hidden',
  },
  menuCardPrimary: {
    backgroundColor: '#10192f',
    borderColor: '#1e3658',
  },
  menuCardDisabled: {
    opacity: 0.58,
  },
  menuEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#5a6d96',
    marginBottom: 10,
  },
  menuEyebrowPrimary: {
    color: '#8ccfff',
  },
  menuCardOrbitA: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 999,
    top: -30,
    right: -20,
    backgroundColor: 'rgba(121, 213, 255, 0.14)',
  },
  menuCardOrbitB: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 999,
    bottom: -30,
    left: -10,
    backgroundColor: 'rgba(255, 182, 223, 0.14)',
  },
  menuTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    color: '#e8f0ff',
    marginBottom: 8,
  },
  menuTitlePrimary: {
    color: '#ffffff',
  },
  menuCopy: {
    fontSize: 14,
    lineHeight: 21,
    color: '#8096bf',
  },
  menuCopyPrimary: {
    color: '#d6e8ff',
  },
  menuCardFooter: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  menuCardActionPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#7be0ff',
  },
  menuCardActionPillSoft: {
    backgroundColor: '#eef8ff',
  },
  menuCardActionText: {
    color: '#16324a',
    fontWeight: '900',
    fontSize: 13,
  },
  menuCardMeta: {
    color: '#b7cae8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  toolList: {
    gap: 10,
  },
  toolItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#0f1a2e',
  },
  toolTitle: {
    color: '#d0dcf8',
    fontWeight: '800',
    fontSize: 14,
  },
  toolCopy: {
    color: '#6b7fa8',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryMenuButton: {
    marginTop: 12,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f1a2e',
  },
  secondaryMenuButtonText: {
    color: '#7be0ff',
    fontWeight: '800',
    fontSize: 14,
  },
  connectHeader: {
    paddingHorizontal: 6,
    gap: 10,
  },
  heroCard: {
    overflow: 'hidden',
    borderRadius: 30,
    padding: 22,
    gap: 14,
    backgroundColor: '#0d1525',
    borderWidth: 1,
    borderColor: '#1c2a46',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  scannerCard: {
    backgroundColor: '#0d1424',
    borderRadius: 30,
    padding: 14,
    gap: 14,
    shadowColor: '#223a68',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4,
  },
  heroGlowA: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    right: -50,
    top: -40,
    backgroundColor: 'rgba(93, 228, 255, 0.12)',
  },
  heroGlowB: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    left: -30,
    bottom: -45,
    backgroundColor: 'rgba(255, 79, 216, 0.1)',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#7be0ff',
  },
  title: {
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '900',
    color: '#f0f6ff',
    maxWidth: '90%',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: '#8096bf',
    maxWidth: '94%',
  },
  heroSteps: {
    gap: 10,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  heroPillRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  heroStatPill: {
    minWidth: 120,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(123, 149, 214, 0.14)',
  },
  heroStatLabel: {
    color: '#6d88b0',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  heroStatValue: {
    color: '#c8dcf8',
    fontSize: 14,
    fontWeight: '800',
  },
  heroStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  secondaryPillButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(123, 224, 255, 0.1)',
  },
  secondaryPillButtonText: {
    color: '#7be0ff',
    fontWeight: '800',
    fontSize: 13,
  },
  heroStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 999,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
    backgroundColor: '#7be0ff',
    color: '#17304a',
    fontWeight: '900',
    lineHeight: 28,
  },
  heroStepCopy: {
    flex: 1,
    fontSize: 14,
    color: '#a8c0e8',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#0d1525',
    borderRadius: 26,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1c2a46',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#e8f0ff',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7a8fb5',
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1e2f50',
    backgroundColor: '#091428',
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#e8f0ff',
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#5a6d96',
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cameraHeaderCopy: {
    flex: 1,
  },
  cameraHint: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#74819e',
  },
  cameraShell: {
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#dbe1fb',
    backgroundColor: '#0c1220',
  },
  liveCameraShell: {
    borderRadius: 30,
    borderColor: '#b8ddff',
    backgroundColor: '#040915',
  },
  livePreviewShell: {
    alignSelf: 'stretch',
    borderColor: '#9ad9ff',
    shadowColor: '#6bcfff',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  livePreviewShellLandscape: {
    width: '100%',
    maxWidth: 980,
  },
  cameraShellExpanded: {
    shadowColor: '#5fcfff',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  scannerShell: {
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#060b15',
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.18)',
  },
  cameraShellLandscape: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 820,
  },
  cameraViewport: {
      width: '100%',
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#040915',
    },
    mediaStage: {
      position: 'absolute',
      overflow: 'hidden',
    },
    mediaStageOverlay: {
      position: 'absolute',
      overflow: 'hidden',
      zIndex: 12,
      elevation: 12,
    },
  camera: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#0c1220',
  },
  liveCamera: {
    width: '100%',
    backgroundColor: '#040915',
  },
  scannerCamera: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#060b15',
  },
  scanOverlay: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    backgroundColor: 'rgba(5, 10, 20, 0.34)',
  },
  scanGuideFrame: {
    position: 'relative',
  },
  lockedScanFrame: {
    position: 'absolute',
    borderRadius: 18,
    backgroundColor: 'rgba(123, 224, 255, 0.06)',
  },
  scanStatusPill: {
    position: 'absolute',
    top: 18,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(7, 15, 30, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.22)',
  },
  scanStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: '#7be0ff',
  },
  scanStatusDotLocked: {
    backgroundColor: '#7dffb5',
  },
  scanStatusText: {
    color: '#eff8ff',
    fontWeight: '800',
    fontSize: 13,
  },
  scanLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 4,
    height: 3,
    borderRadius: 999,
    backgroundColor: '#7be0ff',
    shadowColor: '#7be0ff',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  scanCorner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#7be0ff',
  },
  scanCornerTopLeft: {
    top: 0,
    left: 0,
    borderLeftWidth: 4,
    borderTopWidth: 4,
    borderTopLeftRadius: 18,
  },
  scanCornerTopRight: {
    top: 0,
    right: 0,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderTopRightRadius: 18,
  },
  scanCornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderBottomLeftRadius: 18,
  },
  scanCornerBottomRight: {
    bottom: 0,
    right: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: 18,
  },
  scannerFooter: {
    gap: 12,
    paddingHorizontal: 6,
  },
  scannerFooterCopy: {
    color: '#d6e8ff',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  liveExperience: {
    gap: 16,
  },
  liveExperienceLandscape: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  liveViewerColumn: {
    gap: 14,
  },
  liveViewerColumnLandscape: {
    flex: 1.35,
  },
  liveInfoColumn: {
    gap: 14,
  },
  liveInfoColumnLandscape: {
    flex: 0.82,
  },
  liveTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  liveBackButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f1a2e',
  },
  liveBackButtonText: {
    color: '#d8ebff',
    fontSize: 14,
    fontWeight: '900',
  },
  liveTopBarMeta: {
    flex: 1,
    gap: 4,
  },
  liveTopBarEyebrow: {
    color: '#74b8ec',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  liveTopBarTitle: {
    color: '#f1f7ff',
    fontSize: 24,
    fontWeight: '900',
  },
  liveStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(123, 224, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.22)',
  },
  liveStatusBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#7dffb5',
  },
  liveStatusBadgeText: {
    color: '#dcf6ff',
    fontSize: 13,
    fontWeight: '900',
  },
  liveHintRow: {
    gap: 6,
    paddingHorizontal: 4,
  },
  liveHintRowLandscape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  liveHintText: {
    color: '#7286ab',
    fontSize: 13,
    fontWeight: '700',
  },
  liveInfoCard: {
    borderRadius: 28,
    padding: 20,
    backgroundColor: '#0d1525',
    borderWidth: 1,
    borderColor: '#1c2a46',
    gap: 10,
  },
  liveInfoEyebrow: {
    color: '#7be0ff',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  liveInfoTitle: {
    color: '#f0f6ff',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
  },
  liveInfoCopy: {
    color: '#91a7ce',
    fontSize: 15,
    lineHeight: 22,
  },
  liveRosterPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  liveRosterPill: {
    minWidth: 110,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#091428',
  },
  liveRosterPillLabel: {
    color: '#7084aa',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.05,
    marginBottom: 4,
  },
  liveRosterPillValue: {
    color: '#e5efff',
    fontSize: 15,
    fontWeight: '800',
  },
  liveActionCard: {
    borderRadius: 28,
    padding: 20,
    backgroundColor: '#0d1525',
    borderWidth: 1,
    borderColor: '#1c2a46',
    gap: 14,
  },
  cameraControlRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cameraControlButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cameraControlButtonText: {
    color: '#c8dcf8',
    fontSize: 13,
    fontWeight: '800',
  },
  cameraFooterHint: {
    fontSize: 13,
    lineHeight: 19,
    color: '#7581a0',
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: '#020611',
    paddingTop: Platform.OS === 'android' ? 24 : 0,
  },
  fullscreenTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
  },
  fullscreenBackButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  fullscreenBackButtonText: {
    color: '#f5fbff',
    fontSize: 15,
    fontWeight: '900',
  },
  fullscreenTitleWrap: {
    flex: 1,
    gap: 4,
  },
  fullscreenEyebrow: {
    color: '#7be0ff',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  fullscreenTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
  },
  fullscreenLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  fullscreenLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#ff4f8c',
  },
  fullscreenLiveText: {
    color: '#fff5fb',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  fullscreenPreviewShell: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  fullscreenCameraViewport: {
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: '#00060f',
  },
  fullscreenMedia: {
    width: '100%',
  },
  fullscreenHintBadge: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: 'rgba(4, 10, 20, 0.72)',
  },
  fullscreenHintBadgeText: {
    color: '#eff9ff',
    fontSize: 12,
    fontWeight: '800',
  },
  scannerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  scannerSecondaryButton: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(241, 245, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  scannerSecondaryButtonText: {
    color: '#f3f8ff',
    fontWeight: '800',
    fontSize: 13,
  },
  cameraPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cameraPlaceholderText: {
    color: '#d8e7ff',
    textAlign: 'center',
    lineHeight: 20,
  },
  statusCard: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: '#091428',
    borderWidth: 1,
    borderColor: '#1a2a48',
    gap: 6,
  },
  statusText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#c8dcf8',
    fontWeight: '700',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#ff6b8a',
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#7be0ff',
    borderRadius: 22,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7be0ff',
    shadowOpacity: 0.4,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  primaryButtonStop: {
    backgroundColor: '#ff4f8c',
    shadowColor: '#ff4f8c',
    shadowOpacity: 0.4,
  },
  primaryButtonText: {
    color: '#0a1a2e',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  launchCurtainBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 8, 18, 0.86)',
    justifyContent: 'center',
    padding: 24,
  },
  launchCurtainCard: {
    overflow: 'hidden',
    borderRadius: 34,
    padding: 28,
    backgroundColor: '#0f1730',
    borderWidth: 1,
    borderColor: 'rgba(123, 224, 255, 0.18)',
    gap: 16,
  },
  launchCurtainGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    top: -30,
    right: -50,
    backgroundColor: '#7be0ff',
  },
  launchCurtainBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  launchCurtainBadgeText: {
    color: '#f2f8ff',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  launchCurtainTitle: {
    color: '#ffffff',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '900',
  },
  launchCurtainCopy: {
    color: '#cfdef8',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: '90%',
  },
  launchCurtainLoaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  launchCurtainLoaderText: {
    color: '#f3f8ff',
    fontSize: 14,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  lockModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 10, 20, 0.56)',
    justifyContent: 'center',
    padding: 22,
  },
  lockModalCard: {
    borderRadius: 30,
    padding: 22,
    backgroundColor: '#0d1525',
    borderWidth: 1,
    borderColor: '#1c2a46',
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 5,
  },
  lockModalBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(123, 224, 255, 0.1)',
  },
  lockModalBadgeText: {
    color: '#7be0ff',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  lockModalTitle: {
    color: '#f0f6ff',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
  },
  lockModalCopy: {
    color: '#7a8fb5',
    fontSize: 15,
    lineHeight: 22,
  },
  lockModalRoom: {
    color: '#a8c0e8',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#091428',
  },
  lockModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  lockModalSecondaryButton: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f1a2e',
  },
  lockModalSecondaryText: {
    color: '#7a8fb5',
    fontSize: 15,
    fontWeight: '800',
  },
  lockModalPrimaryButton: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7be0ff',
  },
  lockModalPrimaryText: {
    color: '#0a1a2e',
    fontSize: 15,
    fontWeight: '900',
  },

  // ─── LIVE indicator overlay ─────────────────────────────────────────
  liveOverlayImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    opacity: 1,
    zIndex: 12,
    elevation: 12,
  },
  visionOverlay: {
      position: 'absolute',
      inset: 0,
      zIndex: 14,
      elevation: 14,
    },
  tagOverlayGroup: {
      position: 'absolute',
      inset: 0,
    },
  tagBox: {
      position: 'absolute',
      borderWidth: 2,
      borderRadius: 12,
      borderColor: '#7be0ff',
      backgroundColor: 'rgba(123, 224, 255, 0.06)',
    },
  tagLabel: {
      position: 'absolute',
      transform: [{ translateY: -18 }],
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: 'rgba(4, 10, 20, 0.82)',
      zIndex: 15,
      elevation: 15,
    },
  tagLabelText: {
    color: '#ecfbff',
    fontSize: 11,
    fontWeight: '900',
  },
  borderDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    marginLeft: -7,
    marginTop: -7,
    borderRadius: 999,
    backgroundColor: '#ff4f8c',
    borderWidth: 2,
    borderColor: '#fff6fb',
    shadowColor: '#ff4f8c',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  liveOverlay: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(6, 10, 20, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 60, 60, 0.4)',
  },
  liveIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#ff3c3c',
    shadowColor: '#ff3c3c',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  liveIndicatorText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
  },

});
