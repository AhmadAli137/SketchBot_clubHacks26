import AsyncStorage from '@react-native-async-storage/async-storage';
import { BarcodeScanningResult, CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const STORAGE_KEY = 'sketchbot-camera-buddy-room';
const DEFAULT_PORT = '8787';

type SavedConfig = {
  backendUrl: string;
};

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

    if (hostname.startsWith('172.24.') || hostname.startsWith('172.25.') || hostname.startsWith('172.26.') || hostname.startsWith('172.27.') || hostname.startsWith('172.28.') || hostname.startsWith('172.29.') || hostname.startsWith('172.30.') || hostname.startsWith('172.31.')) {
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

export default function App() {
  const cameraRef = useRef<CameraView | null>(null);
  const streamingRef = useRef(false);
  const lastScannedRoomRef = useRef<string | null>(null);
  const lastScannedAtRef = useRef(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [backendUrl, setBackendUrl] = useState('');
  const [cameraFacing, setCameraFacing] = useState<CameraType>('back');
  const [streaming, setStreaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Point the camera at the room QR code on SketchBot Desktop, then tap Go Live.');
  const [error, setError] = useState<string | null>(null);

  const cleanedBackendUrl = useMemo(() => normalizeLocalRuntimeUrl(backendUrl), [backendUrl]);
  const primaryButtonLabel = busy ? 'Joining room...' : streaming ? 'Stop Camera' : 'Go Live';
  const shouldAutoScanRoomCode = Boolean(permission?.granted) && !streaming && !busy;

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
      } catch {
        // Ignore storage failures and allow manual entry.
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
      setStatus('Point the camera at the room QR code on SketchBot Desktop.');
      return;
    }

    setStatus('Room found. Tap Go Live when the paper is in view.');
  }, [cleanedBackendUrl, permission?.granted, streaming]);

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
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Room check failed (${response.status}).`);
    }
  };

  const runUploadLoop = async (targetBackendUrl: string, label: string) => {
    const pauseMs = 85;
    const quality = 0.11;
    try {
      while (streamingRef.current) {
        const picture = await cameraRef.current?.takePictureAsync({
          base64: true,
          quality,
          skipProcessing: true,
        });

        if (!picture?.base64) {
          await wait(pauseMs);
          continue;
        }

        const uploadResponse = await fetch(`${targetBackendUrl}/api/camera/companion-frame`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_base64: picture.base64,
            device_label: label,
          }),
        });

        if (!uploadResponse.ok) {
          throw new Error(`Frame upload failed (${uploadResponse.status}).`);
        }

        await wait(pauseMs);
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Camera Buddy could not keep streaming.';
      setError(message);
      setStatus('Camera Buddy paused.');
      streamingRef.current = false;
      setStreaming(false);
    }
  };

  const stopStreaming = async () => {
    streamingRef.current = false;
    setStreaming(false);
    setBusy(false);
    setStatus('Camera Buddy stopped. Tap Go Live when your robot room is ready again.');
  };

  const startStreaming = async () => {
    if (busy || streamingRef.current) {
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
        throw new Error('Enter the room address from SketchBot Desktop first.');
      }

      setStatus('Checking the SketchBot room...');
      await pingBackend(cleanedBackendUrl);

      setStatus('Joining Camera Buddy mode...');
      const sourceResponse = await fetch(`${cleanedBackendUrl}/api/camera/source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'companion-camera',
        }),
      });

      if (!sourceResponse.ok) {
        throw new Error(`Could not switch camera mode (${sourceResponse.status}).`);
      }

      streamingRef.current = true;
      setStreaming(true);
      setStatus('Camera Buddy is live on the classroom Wi-Fi.');
      setBusy(false);
      void runUploadLoop(cleanedBackendUrl, 'Camera Buddy');
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Camera Buddy could not start.';
      setError(message);
      setStatus('Camera Buddy could not start.');
      streamingRef.current = false;
      setStreaming(false);
    } finally {
      if (!streamingRef.current) {
        setBusy(false);
      }
    }
  };

  const handlePrimaryAction = async () => {
    if (streaming) {
      await stopStreaming();
      return;
    }
    await startStreaming();
  };

  const flipCamera = () => {
    setCameraFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
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

    lastScannedRoomRef.current = normalized;
    lastScannedAtRef.current = now;
    setBackendUrl(normalized);
    setError(null);
    setStatus('Room code scanned. Tap Go Live when the paper is in view.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.heroCard}>
            <View style={styles.heroGlowA} />
            <View style={styles.heroGlowB} />
            <Text style={styles.eyebrow}>SketchBot Camera Buddy</Text>
            <Text style={styles.title}>Join the robot room and aim at the paper</Text>
            <Text style={styles.subtitle}>
              Camera Buddy is made for the same classroom Wi-Fi as SketchBot Desktop. It turns your phone or tablet into the
              robot's camera view.
            </Text>
            <View style={styles.heroSteps}>
              <View style={styles.heroStep}>
                <Text style={styles.heroStepNumber}>1</Text>
                <Text style={styles.heroStepCopy}>Open the app and point the camera at the room code on the laptop.</Text>
              </View>
              <View style={styles.heroStep}>
                <Text style={styles.heroStepNumber}>2</Text>
                <Text style={styles.heroStepCopy}>Keep the whole sheet and all AprilTags visible.</Text>
              </View>
              <View style={styles.heroStep}>
                <Text style={styles.heroStepNumber}>3</Text>
                <Text style={styles.heroStepCopy}>Tap Go Live and let SketchBot see the page.</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Join this classroom</Text>
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
              <View style={styles.joinTip}>
                <Text style={styles.joinTipTitle}>Kid shortcut</Text>
                <Text style={styles.joinTipCopy}>The app scans the room code automatically. Just point the camera at the QR on the laptop.</Text>
              </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cameraHeader}>
              <View style={styles.cameraHeaderCopy}>
                <Text style={styles.cardTitle}>Preview</Text>
                <Text style={styles.cameraHint}>Keep the page fully inside the frame. AprilTags should stay clear and sharp.</Text>
              </View>
              <Pressable style={styles.ghostButton} onPress={flipCamera}>
                <Text style={styles.ghostButtonText}>{cameraFacing === 'back' ? 'Front camera' : 'Back camera'}</Text>
              </Pressable>
            </View>

            <View style={styles.cameraShell}>
              {permission?.granted ? (
                <View>
                  <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing={cameraFacing}
                    pictureSize="640x480"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={shouldAutoScanRoomCode ? handleBarcodeScanned : undefined}
                  />
                  {shouldAutoScanRoomCode ? (
                    <View style={styles.scanOverlay}>
                      <View style={styles.scanFrame} />
                      <Text style={styles.scanOverlayText}>Point at the room QR code on the laptop screen</Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={[styles.camera, styles.cameraPlaceholder]}>
                  <Text style={styles.cameraPlaceholderText}>We&apos;ll ask for camera permission when you tap Go Live.</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Go live</Text>
            <View style={styles.statusCard}>
              <Text style={styles.statusText}>{status}</Text>
              {cleanedBackendUrl ? <Text style={styles.helperText}>Room address: {cleanedBackendUrl}</Text> : null}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            <Pressable
              style={[styles.primaryButton, busy ? styles.buttonDisabled : null, streaming ? styles.primaryButtonStop : null]}
              onPress={() => void handlePrimaryAction()}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#14233c" /> : <Text style={styles.primaryButtonText}>{primaryButtonLabel}</Text>}
            </Pressable>
          </View>
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
  heroStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
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
  joinTip: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7e7ff',
    backgroundColor: '#eef8ff',
    padding: 12,
    gap: 4,
  },
  joinTipTitle: {
    color: '#28506e',
    fontWeight: '900',
    fontSize: 13,
  },
  joinTipCopy: {
    color: '#49657f',
    fontSize: 13,
    lineHeight: 18,
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
  camera: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#0c1220',
  },
  scanOverlay: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    backgroundColor: 'rgba(8, 14, 28, 0.22)',
  },
  scanFrame: {
    width: '64%',
    aspectRatio: 1,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#7be0ff',
    backgroundColor: 'rgba(255,255,255,0.04)',
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
  ghostButton: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f1f5ff',
  },
  ghostButtonText: {
    color: '#42547e',
    fontWeight: '800',
    fontSize: 13,
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
