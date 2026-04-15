import AsyncStorage from '@react-native-async-storage/async-storage';
import { BarcodeScanningResult, CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  type LayoutChangeEvent,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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

type ScanFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
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

export default function App() {
  const { width, height } = useWindowDimensions();
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const connectionMonitorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanLineProgress = useRef(new Animated.Value(0)).current;
  const sessionIdRef = useRef<string | null>(null);
  const lastScannedRoomRef = useRef<string | null>(null);
  const lastScannedAtRef = useRef(0);
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
  const [currentPage, setCurrentPage] = useState<'splash' | 'menu' | 'connect' | 'live'>('splash');
  const [scanFrame, setScanFrame] = useState<ScanFrame | null>(null);
  const [scannerLayout, setScannerLayout] = useState({ width: 0, height: 0 });
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [pendingRoomUrl, setPendingRoomUrl] = useState<string | null>(null);
  const [manualJoinInput, setManualJoinInput] = useState('');
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(0);

  const cleanedBackendUrl = useMemo(() => normalizeLocalRuntimeUrl(backendUrl), [backendUrl]);
  const classroomLabel = classroomName || 'SketchBot classroom';
  const primaryButtonLabel = busy ? 'Joining classroom...' : streaming ? 'Stop Camera' : 'Go Live';
  const shouldAutoScanRoomCode =
    Boolean(permission?.granted) && !streaming && !busy && currentPage === 'connect' && !pendingRoomUrl;
  const isLandscape = width > height;
  const previewAspectRatio = isLandscape ? 16 / 9 : 3 / 4;
  const livePreviewHeight = useMemo(() => {
    if (previewExpanded) {
      return isLandscape ? Math.min(height * 0.78, 520) : Math.min(height * 0.68, 720);
    }

    return isLandscape ? Math.min(height * 0.58, 420) : Math.min(height * 0.46, 520);
  }, [height, isLandscape, previewExpanded]);
  const previewTransform = useMemo(
    () => [
      { rotate: `${previewRotation}deg` },
      { scale: 1 + previewZoom },
    ],
    [previewRotation, previewZoom],
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
    const timer = setTimeout(() => {
      setCurrentPage((current) => (current === 'splash' ? 'menu' : current));
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

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
      setCameraSurfaceMode('scanner');
      setScanFrame(null);
      setBusy(false);

      if (sessionId && cleanedBackendUrl) {
        try {
          await fetch(`${cleanedBackendUrl}/api/camera/phone-webrtc/publisher-stop/${sessionId}`, { method: 'POST' });
        } catch {
          // Ignore cleanup failures; the next room join will reset the session.
        }
      }

      if (!options?.preserveStatus) {
        setStatus('Camera Buddy stopped. Tap Go Live when your classroom is ready again.');
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
        width: { ideal: 1280 },
        height: { ideal: 720 },
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

      setStatus(`Checking ${classroomLabel}...`);
      await pingBackend(cleanedBackendUrl);

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
          setError(null);
          setStatus(`${classroomLabel} is live on the same Wi-Fi.`);
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
          void stopStreaming({ preserveStatus: true });
        }
      }, 250);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Camera Buddy could not start the live stream.';
      setError(message);
      setStatus('Camera Buddy could not start the classroom stream.');
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
      setStatus('Camera flipped. Tap Go Live to restart the classroom stream.');
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
  };

  const handleScannerLayout = (event: LayoutChangeEvent) => {
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    setScannerLayout({ width: nextWidth, height: nextHeight });
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
    setStatus(`${classroomLabel} is ready. Tap Go Live to start the live camera stream.`);
    setCurrentPage('live');
  };

  const startFromLockedRoom = async () => {
    setPendingRoomUrl(null);
    setError(null);
    setCurrentPage('live');
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
    setPreviewExpanded(false);
    setPreviewRotation(0);
    setPreviewZoom(0);
    setStatus(cleanedBackendUrl ? 'Saved classroom ready.' : 'Choose what you want Camera Buddy to do.');
  };

  useEffect(() => {
    return () => {
      void stopStreaming({ preserveStatus: true });
    };
  }, [stopStreaming]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.container, isLandscape ? styles.containerLandscape : null]}>
          {currentPage === 'splash' ? (
            <View style={styles.splashScreen}>
              <View style={styles.splashOrbA} />
              <View style={styles.splashOrbB} />
              <View style={styles.splashTopRow}>
                <View style={styles.splashBadge}>
                  <Text style={styles.splashBadgeText}>SketchBot</Text>
                </View>
                <View style={styles.splashMiniPill}>
                  <Text style={styles.splashMiniPillText}>Companion</Text>
                </View>
              </View>
              <View style={styles.splashDevice}>
                <View style={styles.splashDeviceGlow} />
                <View style={styles.splashDeviceScreen}>
                  <View style={styles.splashDeviceChip} />
                  <View style={styles.splashDeviceFrame}>
                    <View style={[styles.splashDeviceCorner, styles.splashDeviceCornerTopLeft]} />
                    <View style={[styles.splashDeviceCorner, styles.splashDeviceCornerTopRight]} />
                    <View style={[styles.splashDeviceCorner, styles.splashDeviceCornerBottomLeft]} />
                    <View style={[styles.splashDeviceCorner, styles.splashDeviceCornerBottomRight]} />
                  </View>
                </View>
              </View>
              <Text style={styles.splashTitle}>Camera Buddy</Text>
              <Text style={styles.splashCopy}>Join the classroom, help with setup, and stream live from the same Wi-Fi.</Text>
              <View style={styles.splashFeatureRow}>
                <View style={styles.splashFeaturePill}>
                  <Text style={styles.splashFeaturePillText}>Fast QR join</Text>
                </View>
                <View style={styles.splashFeaturePill}>
                  <Text style={styles.splashFeaturePillText}>Live camera</Text>
                </View>
              </View>
            </View>
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
                <View style={styles.connectHintPill}>
                  <Text style={styles.connectHintPillText}>Keep the whole classroom code inside the frame for a smooth lock.</Text>
                </View>
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
            <View style={styles.heroCard}>
                <View style={styles.heroGlowA} />
                <View style={styles.heroGlowB} />
                <Text style={styles.eyebrow}>SketchBot Camera Buddy</Text>
                <Text style={styles.title}>Stream the live camera</Text>
                <Text style={styles.subtitle}>
                  Keep the full page and all AprilTags inside the frame, then tap Go Live. If you need a different classroom, go back to
                  the join screen.
                </Text>
                <View style={styles.heroPillRow}>
                  <View style={styles.heroStatPill}>
                    <Text style={styles.heroStatLabel}>Classroom</Text>
                    <Text style={styles.heroStatValue} numberOfLines={1}>{classroomLabel}</Text>
                  </View>
                  {teacherName ? (
                    <View style={styles.heroStatPill}>
                      <Text style={styles.heroStatLabel}>Teacher</Text>
                      <Text style={styles.heroStatValue} numberOfLines={1}>{teacherName}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.heroActions}>
                  <Pressable style={styles.secondaryPillButton} onPress={() => void returnToConnectPage()}>
                    <Text style={styles.secondaryPillButtonText}>Main menu</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryPillButton} onPress={() => void flipCamera()}>
                    <Text style={styles.secondaryPillButtonText}>
                      {cameraFacing === 'back' ? 'Switch to front camera' : 'Switch to back camera'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.cameraHeader}>
                  <View style={styles.cameraHeaderCopy}>
                    <Text style={styles.cardTitle}>{streaming ? 'Live camera' : 'Camera preview'}</Text>
                    <Text style={styles.cameraHint}>
                      {streaming
                        ? 'This is your live SketchBot stream preview.'
                        : 'Aim at the paper now. Use the controls to frame the shot before you go live.'}
                    </Text>
                  </View>
                </View>

                <View style={styles.cameraControlRow}>
                  <Pressable style={styles.cameraControlButton} onPress={() => setPreviewZoom((value) => clamp(Number((value - 0.12).toFixed(2)), 0, 0.6))}>
                    <Text style={styles.cameraControlButtonText}>Zoom out</Text>
                  </Pressable>
                  <Pressable style={styles.cameraControlButton} onPress={() => setPreviewZoom((value) => clamp(Number((value + 0.12).toFixed(2)), 0, 0.6))}>
                    <Text style={styles.cameraControlButtonText}>Zoom in</Text>
                  </Pressable>
                  <Pressable style={styles.cameraControlButton} onPress={() => setPreviewRotation((value) => (value + 90) % 360)}>
                    <Text style={styles.cameraControlButtonText}>Rotate view</Text>
                  </Pressable>
                  <Pressable style={styles.cameraControlButton} onPress={() => setPreviewExpanded((value) => !value)}>
                    <Text style={styles.cameraControlButtonText}>{previewExpanded ? 'Shrink view' : 'Expand view'}</Text>
                  </Pressable>
                </View>

                <View
                  style={[
                    styles.cameraShell,
                    styles.liveCameraShell,
                    isLandscape ? styles.cameraShellLandscape : null,
                    previewExpanded ? styles.cameraShellExpanded : null,
                  ]}
                >
                  <View style={[styles.cameraViewport, { height: livePreviewHeight }]}>
                  {cameraSurfaceMode === 'stream' && localStreamUrl ? (
                    <RTCView
                      streamURL={localStreamUrl}
                      objectFit="cover"
                      mirror={cameraFacing === 'front'}
                      style={[styles.camera, styles.liveCamera, { height: livePreviewHeight, transform: previewTransform }]}
                    />
                  ) : permission?.granted ? (
                    <CameraView
                      style={[styles.camera, styles.liveCamera, { height: livePreviewHeight, transform: previewTransform }]}
                      facing={cameraFacing}
                      zoom={previewZoom}
                    />
                  ) : cameraSurfaceMode === 'stream' ? (
                    <View style={[styles.camera, styles.cameraPlaceholder, styles.liveCamera, { height: livePreviewHeight }]}>
                      <ActivityIndicator color="#4ac7f0" size="large" />
                      <Text style={styles.cameraPlaceholderText}>Starting the live camera...</Text>
                    </View>
                  ) : (
                    <View style={[styles.camera, styles.cameraPlaceholder, styles.liveCamera, { height: livePreviewHeight }]}>
                      <Text style={styles.cameraPlaceholderText}>Camera access is required before Camera Buddy can go live.</Text>
                    </View>
                  )}
                  </View>
                </View>
                <Text style={styles.cameraFooterHint}>Use Zoom, Rotate, and Expand to match the phone orientation and fill more of the screen.</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Go live</Text>
                <View style={styles.statusCard}>
                  <Text style={styles.statusText}>{status}</Text>
                  <Text style={styles.helperText}>Classroom: {classroomLabel}</Text>
                  {teacherName ? <Text style={styles.helperText}>Teacher: {teacherName}</Text> : null}
                  {studentNames.length ? <Text style={styles.helperText}>Students: {studentNames.join(', ')}</Text> : null}
                  {botNames.length ? <Text style={styles.helperText}>Robots: {botNames.join(', ')}</Text> : null}
                  {session?.session_id ? <Text style={styles.helperText}>Live session: {session.session_id}</Text> : null}
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
                  Camera Buddy now uses a real live stream. For the smoothest result, run it from an Expo development build instead of Expo Go.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
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
    backgroundColor: '#f8f4ff',
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
  menuGrid: {
    gap: 12,
  },
  menuCard: {
    borderRadius: 28,
    padding: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e1e7ff',
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
    color: '#7a86a8',
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
    color: '#1d2244',
    marginBottom: 8,
  },
  menuTitlePrimary: {
    color: '#ffffff',
  },
  menuCopy: {
    fontSize: 14,
    lineHeight: 21,
    color: '#61708f',
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
    backgroundColor: '#f7f9ff',
  },
  toolTitle: {
    color: '#243457',
    fontWeight: '800',
    fontSize: 14,
  },
  toolCopy: {
    color: '#6f7d9b',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryMenuButton: {
    marginTop: 12,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef8ff',
  },
  secondaryMenuButtonText: {
    color: '#244d72',
    fontWeight: '800',
    fontSize: 14,
  },
  connectHeader: {
    paddingHorizontal: 6,
    gap: 10,
  },
  connectHintPill: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#eef8ff',
  },
  connectHintPillText: {
    color: '#245278',
    fontSize: 13,
    fontWeight: '800',
  },
  heroCard: {
    overflow: 'hidden',
    borderRadius: 30,
    padding: 22,
    gap: 14,
    backgroundColor: '#fff8ff',
    borderWidth: 1,
    borderColor: '#e7d9ff',
    shadowColor: '#7b66c9',
    shadowOpacity: 0.14,
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
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -40,
    top: -30,
    backgroundColor: '#d8ecff',
  },
  heroGlowB: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    left: -20,
    bottom: -35,
    backgroundColor: '#ffe0f6',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#7a63d8',
  },
  title: {
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '900',
    color: '#1d2244',
    maxWidth: '90%',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: '#576182',
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
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1,
    borderColor: 'rgba(123, 149, 214, 0.14)',
  },
  heroStatLabel: {
    color: '#6d7b9a',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  heroStatValue: {
    color: '#243457',
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
    backgroundColor: '#eff4ff',
  },
  secondaryPillButtonText: {
    color: '#3f557c',
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
    color: '#2b3758',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e1e7ff',
    shadowColor: '#97a6cf',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1d2244',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5b6788',
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d9e1ff',
    backgroundColor: '#f8faff',
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#1d2244',
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#7581a0',
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
  cameraControlRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cameraControlButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#d3e4ff',
  },
  cameraControlButtonText: {
    color: '#2a4468',
    fontSize: 13,
    fontWeight: '800',
  },
  cameraFooterHint: {
    fontSize: 13,
    lineHeight: 19,
    color: '#7581a0',
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
    backgroundColor: '#fff6fb',
    borderWidth: 1,
    borderColor: '#f0d8eb',
    gap: 6,
  },
  statusText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#2b3657',
    fontWeight: '700',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#c44568',
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#7be0ff',
    borderRadius: 22,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#79d5ff',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryButtonStop: {
    backgroundColor: '#ffd6e9',
  },
  primaryButtonText: {
    color: '#14233c',
    fontSize: 17,
    fontWeight: '900',
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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dce7ff',
    gap: 14,
    shadowColor: '#1e3157',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 5,
  },
  lockModalBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#eef8ff',
  },
  lockModalBadgeText: {
    color: '#245278',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  lockModalTitle: {
    color: '#1d2244',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
  },
  lockModalCopy: {
    color: '#5e6c8d',
    fontSize: 15,
    lineHeight: 22,
  },
  lockModalRoom: {
    color: '#2a4468',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#f5f9ff',
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
    backgroundColor: '#f3f6ff',
  },
  lockModalSecondaryText: {
    color: '#425778',
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
    color: '#17304a',
    fontSize: 15,
    fontWeight: '900',
  },
});
