import AsyncStorage from '@react-native-async-storage/async-storage';
import { BarcodeScanningResult, CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  type LayoutChangeEvent,
  KeyboardAvoidingView,
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
  const scanNavigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanLineProgress = useRef(new Animated.Value(0)).current;
  const sessionIdRef = useRef<string | null>(null);
  const lastScannedRoomRef = useRef<string | null>(null);
  const lastScannedAtRef = useRef(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [backendUrl, setBackendUrl] = useState('');
  const [cameraFacing, setCameraFacing] = useState<CameraType>('back');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState('Point the phone at the room QR code on SketchBot Desktop, then tap Go Live.');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<PhoneWebRTCSessionResponse | null>(null);
  const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);
  const [cameraSurfaceMode, setCameraSurfaceMode] = useState<'scanner' | 'stream'>('scanner');
  const [currentPage, setCurrentPage] = useState<'connect' | 'live'>('connect');
  const [scanFrame, setScanFrame] = useState<ScanFrame | null>(null);
  const [scannerLayout, setScannerLayout] = useState({ width: 0, height: 0 });
  const [showManualEntry, setShowManualEntry] = useState(false);

  const cleanedBackendUrl = useMemo(() => normalizeLocalRuntimeUrl(backendUrl), [backendUrl]);
  const primaryButtonLabel = busy ? 'Joining room...' : streaming ? 'Stop Camera' : 'Go Live';
  const shouldAutoScanRoomCode = Boolean(permission?.granted) && !streaming && !busy && currentPage === 'connect';
  const isLandscape = width > height;
  const previewAspectRatio = isLandscape ? 16 / 9 : 3 / 4;
  const guideSize = useMemo(() => {
    if (!scannerLayout.width || !scannerLayout.height) {
      return 0;
    }

    return Math.min(scannerLayout.width * 0.68, scannerLayout.height * 0.68);
  }, [scannerLayout.height, scannerLayout.width]);
  const guideLeft = useMemo(() => (scannerLayout.width - guideSize) / 2, [guideSize, scannerLayout.width]);
  const guideTop = useMemo(() => (scannerLayout.height - guideSize) / 2, [guideSize, scannerLayout.height]);
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
            setCurrentPage('live');
          }
        }
      } catch {
        // Ignore storage failures and allow a fresh room scan.
      }
    };

    void loadConfig();
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        backendUrl: cleanedBackendUrl || backendUrl,
      } satisfies SavedConfig),
    ).catch(() => {});
  }, [backendUrl, cleanedBackendUrl]);

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
      setStatus('Allow camera access so Camera Buddy can scan the room code automatically.');
      return;
    }

    if (!cleanedBackendUrl) {
      setStatus('Point the phone at the room QR code on SketchBot Desktop.');
      return;
    }

    setStatus('Room found. Tap Go Live to start the live camera stream.');
  }, [cleanedBackendUrl, permission?.granted, streaming]);

  useEffect(() => {
    return () => {
      if (scanNavigationTimeoutRef.current) {
        clearTimeout(scanNavigationTimeoutRef.current);
      }
    };
  }, []);

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
      throw new Error(`Room check failed (${response.status}).`);
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
      throw new Error(`Could not start the live room (${response.status}).`);
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
        setStatus('Camera Buddy stopped. Tap Go Live when your robot room is ready again.');
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
        width: 960,
        height: 540,
        frameRate: 24,
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
        throw new Error('Point Camera Buddy at the room QR code first.');
      }

      setStatus('Checking the SketchBot room...');
      await pingBackend(cleanedBackendUrl);

      setStatus('Opening the live room...');
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

      setStatus('Connecting the live stream to SketchBot Desktop...');

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
      setStatus('Live stream ready. SketchBot Desktop is connecting now...');

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
          setStatus('Camera Buddy is live on the same Wi-Fi.');
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
      setStatus('Camera Buddy could not start.');
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
      setStatus('Camera flipped. Tap Go Live to restart the live stream.');
    }
    setCameraFacing(nextFacing);
    setCameraSurfaceMode('scanner');
  };

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    const { data } = result;
    if (!shouldAutoScanRoomCode || !data) {
      return;
    }

    const normalized = normalizeLocalRuntimeUrl(data);
    if (!normalized) {
      return;
    }

    const now = Date.now();
    if (lastScannedRoomRef.current === normalized && now - lastScannedAtRef.current < 2500) {
      return;
    }

    const nextScanFrame = extractScanFrame(result, scannerLayout);
    lastScannedRoomRef.current = normalized;
    lastScannedAtRef.current = now;
    setBackendUrl(normalized);
    setScanFrame(nextScanFrame);
    setShowManualEntry(false);
    setError(null);
    setStatus('Room code locked in. Opening the live camera screen...');

    if (scanNavigationTimeoutRef.current) {
      clearTimeout(scanNavigationTimeoutRef.current);
    }
    scanNavigationTimeoutRef.current = setTimeout(() => {
      setCurrentPage('live');
      setStatus('Room found. Tap Go Live to start the live camera stream.');
      setScanFrame(null);
    }, 500);
  };

  const handleScannerLayout = (event: LayoutChangeEvent) => {
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    setScannerLayout({ width: nextWidth, height: nextHeight });
  };

  const openLivePage = () => {
    if (!cleanedBackendUrl) {
      setError('Paste the room address or scan the QR code first.');
      setShowManualEntry(true);
      return;
    }

    setScanFrame(null);
    setError(null);
    setStatus('Room found. Tap Go Live to start the live camera stream.');
    setCurrentPage('live');
  };

  const returnToConnectPage = async () => {
    if (streaming) {
      await stopStreaming({ preserveStatus: true });
    }

    setCurrentPage('connect');
    setScanFrame(null);
    setError(null);
    setStatus(
      cleanedBackendUrl
        ? 'Room saved. Point at the room QR code again or continue when you are ready.'
        : 'Point the phone at the room QR code on SketchBot Desktop.',
    );
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
          {currentPage === 'connect' ? (
            <>
              <View style={styles.connectHeader}>
                <Text style={styles.eyebrow}>SketchBot Camera Buddy</Text>
                <Text style={styles.title}>Scan the room code</Text>
                <Text style={styles.subtitle}>
                  Point the phone at the QR code on SketchBot Desktop. When Camera Buddy locks onto it, the room page will open automatically.
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
                          <Text style={styles.scanStatusText}>{scanFrame ? 'QR locked' : 'Looking for room code'}</Text>
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
                        <Text style={styles.scanOverlayText}>
                          {scanFrame ? 'Locked on. Opening the live camera screen...' : 'Point at the room QR code on the laptop screen'}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.scannerCamera, styles.cameraPlaceholder, { aspectRatio: previewAspectRatio }]}>
                      <Text style={styles.cameraPlaceholderText}>We&apos;ll ask for camera permission so Camera Buddy can scan the room code.</Text>
                    </View>
                  )}
                </View>
                <View style={styles.scannerFooter}>
                  <Text style={styles.scannerFooterCopy}>
                    Hold still for a moment and Camera Buddy will jump into the room for you.
                  </Text>
                  <View style={styles.scannerActions}>
                    <Pressable style={styles.scannerSecondaryButton} onPress={() => void flipCamera()}>
                      <Text style={styles.scannerSecondaryButtonText}>
                        {cameraFacing === 'back' ? 'Switch camera' : 'Use back camera'}
                      </Text>
                    </Pressable>
                    <Pressable style={styles.scannerSecondaryButton} onPress={() => setShowManualEntry((current) => !current)}>
                      <Text style={styles.scannerSecondaryButtonText}>{showManualEntry ? 'Hide link box' : 'Paste room link'}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {showManualEntry ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Paste the room address</Text>
                  <Text style={styles.label}>Room address from SketchBot Desktop</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder="192.168.2.16 or http://192.168.2.16:8787"
                    placeholderTextColor="#89a0c2"
                    style={styles.input}
                    value={backendUrl}
                    onChangeText={setBackendUrl}
                    onBlur={() => {
                      if (backendUrl.trim()) {
                        setBackendUrl(normalizeLocalRuntimeUrl(backendUrl));
                      }
                    }}
                  />
                  <Text style={styles.helperText}>
                    This is the local room address shown in the desktop app, like `http://192.168.x.x:8787`.
                  </Text>
                  <Pressable
                    style={[styles.primaryButton, !cleanedBackendUrl ? styles.buttonDisabled : null]}
                    disabled={!cleanedBackendUrl}
                    onPress={openLivePage}
                  >
                    <Text style={styles.primaryButtonText}>Open room</Text>
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
                  Keep the full page and all AprilTags inside the frame, then tap Go Live. If you need a different room, go back to
                  the join screen.
                </Text>
                <View style={styles.heroActions}>
                  <Pressable style={styles.secondaryPillButton} onPress={() => void returnToConnectPage()}>
                    <Text style={styles.secondaryPillButtonText}>Change room</Text>
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
                        : 'Aim at the paper now. The live stream starts when you tap Go Live.'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.cameraShell, isLandscape ? styles.cameraShellLandscape : null]}>
                  {cameraSurfaceMode === 'stream' && localStreamUrl ? (
                    <RTCView
                      streamURL={localStreamUrl}
                      objectFit="cover"
                      mirror={cameraFacing === 'front'}
                      style={[styles.camera, { aspectRatio: previewAspectRatio }]}
                    />
                  ) : permission?.granted ? (
                    <CameraView style={[styles.camera, { aspectRatio: previewAspectRatio }]} facing={cameraFacing} />
                  ) : cameraSurfaceMode === 'stream' ? (
                    <View style={[styles.camera, styles.cameraPlaceholder, { aspectRatio: previewAspectRatio }]}>
                      <ActivityIndicator color="#4ac7f0" size="large" />
                      <Text style={styles.cameraPlaceholderText}>Starting the live camera...</Text>
                    </View>
                  ) : (
                    <View style={[styles.camera, styles.cameraPlaceholder, { aspectRatio: previewAspectRatio }]}>
                      <Text style={styles.cameraPlaceholderText}>Camera access is required before Camera Buddy can go live.</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Go live</Text>
                <View style={styles.statusCard}>
                  <Text style={styles.statusText}>{status}</Text>
                  {cleanedBackendUrl ? <Text style={styles.helperText}>Room address: {cleanedBackendUrl}</Text> : null}
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
  connectHeader: {
    paddingHorizontal: 6,
    gap: 10,
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
  camera: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#0c1220',
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
  scanOverlayText: {
    color: '#eff8ff',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 24,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
});
