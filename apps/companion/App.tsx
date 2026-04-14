import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  deviceLabel: string;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTimeStamp(value: number) {
  return new Date(value).toLocaleTimeString();
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
  const [permission, requestPermission] = useCameraPermissions();
  const [backendUrl, setBackendUrl] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('Camera Buddy');
  const [cameraFacing, setCameraFacing] = useState<CameraType>('back');
  const [streaming, setStreaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState('Enter the room address from SketchBot Desktop, then tap Go Live.');
  const [error, setError] = useState<string | null>(null);
  const [lastUploadAt, setLastUploadAt] = useState<string | null>(null);
  const [uploadCount, setUploadCount] = useState(0);

  const cleanedBackendUrl = useMemo(() => normalizeLocalRuntimeUrl(backendUrl), [backendUrl]);
  const primaryButtonLabel = busy ? 'Getting camera ready...' : streaming ? 'Stop Camera' : 'Go Live';

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return;
        }
        const saved = JSON.parse(raw) as Partial<SavedConfig>;
        if (saved.backendUrl) {
          setBackendUrl(saved.backendUrl);
        }
        if (saved.deviceLabel) {
          setDeviceLabel(saved.deviceLabel);
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
        deviceLabel,
      } satisfies SavedConfig),
    ).catch(() => {});
  }, [backendUrl, cleanedBackendUrl, deviceLabel]);

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
    let lastUiUpdateAt = 0;

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

        const now = Date.now();
        if (now - lastUiUpdateAt >= 800) {
          lastUiUpdateAt = now;
          setLastUploadAt(formatTimeStamp(now));
          setUploadCount((current) => current + 1);
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
      void runUploadLoop(cleanedBackendUrl, deviceLabel.trim() || 'Camera Buddy');
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

  const showSetupTip = () => {
    Alert.alert(
      'How to join the room',
      'On the laptop, open SketchBot Desktop and choose Camera Buddy. Copy the room address shown there, paste it here, keep both devices on the same Wi-Fi, and tap Go Live.',
    );
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
                <Text style={styles.heroStepCopy}>Copy the room address from SketchBot Desktop.</Text>
              </View>
              <View style={styles.heroStep}>
                <Text style={styles.heroStepNumber}>2</Text>
                <Text style={styles.heroStepCopy}>Keep the whole sheet and all AprilTags visible.</Text>
              </View>
              <View style={styles.heroStep}>
                <Text style={styles.heroStepNumber}>3</Text>
                <Text style={styles.heroStepCopy}>Tap Go Live.</Text>
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
              This is usually the local room address shown in the desktop app, like `http://192.168.x.x:8787`.
            </Text>

            <Pressable style={styles.secondaryButton} onPress={showSetupTip}>
              <Text style={styles.secondaryButtonText}>Show setup tip</Text>
            </Pressable>

            <Pressable style={styles.linkButton} onPress={() => setShowSettings((current) => !current)}>
              <Text style={styles.linkButtonText}>{showSettings ? 'Hide extra settings' : 'Rename this camera'}</Text>
            </Pressable>

            {showSettings ? (
              <View style={styles.settingsCard}>
                <Text style={styles.label}>Camera name</Text>
                <TextInput
                  autoCapitalize="words"
                  placeholder="Camera Buddy"
                  placeholderTextColor="#89a0c2"
                  style={styles.input}
                  value={deviceLabel}
                  onChangeText={setDeviceLabel}
                />
              </View>
            ) : null}
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
                <CameraView ref={cameraRef} style={styles.camera} facing={cameraFacing} pictureSize="640x480" />
              ) : (
                <View style={[styles.camera, styles.cameraPlaceholder]}>
                  <Text style={styles.cameraPlaceholderText}>We&apos;ll ask for camera permission when you tap Go Live.</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ready check</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillLabel}>Connection</Text>
                <Text style={styles.statusPillValue}>Same Wi-Fi</Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillLabel}>Uploads</Text>
                <Text style={styles.statusPillValue}>{uploadCount}</Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillLabel}>Last frame</Text>
                <Text style={styles.statusPillValue}>{lastUploadAt ?? 'Waiting'}</Text>
              </View>
            </View>

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
  secondaryButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe2ff',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8faff',
  },
  secondaryButtonText: {
    color: '#314469',
    fontWeight: '800',
    fontSize: 14,
  },
  linkButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  linkButtonText: {
    color: '#7a63d8',
    fontWeight: '800',
    fontSize: 13,
  },
  settingsCard: {
    gap: 10,
    borderRadius: 18,
    backgroundColor: '#f7f5ff',
    borderWidth: 1,
    borderColor: '#e5defa',
    padding: 12,
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
  statusRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusPill: {
    flex: 1,
    minHeight: 72,
    borderRadius: 20,
    padding: 12,
    backgroundColor: '#f6fbff',
    borderWidth: 1,
    borderColor: '#d9efff',
    justifyContent: 'space-between',
  },
  statusPillLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#7b8aab',
    fontWeight: '800',
  },
  statusPillValue: {
    fontSize: 14,
    color: '#1d2244',
    fontWeight: '800',
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
