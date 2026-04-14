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

const STORAGE_KEY = 'sketchbot-companion-config';
const HOSTED_BACKEND_URL = 'https://sketchbot-backend.onrender.com';

type ConnectionMode = 'local' | 'hosted';

type SavedConfig = {
  backendUrl: string;
  deviceLabel: string;
  connectionMode: ConnectionMode;
};

function normalizeBackendUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function App() {
  const cameraRef = useRef<CameraView | null>(null);
  const streamingRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [backendUrl, setBackendUrl] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('Camera Buddy');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('local');
  const [cameraFacing, setCameraFacing] = useState<CameraType>('back');
  const [streaming, setStreaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState('Pick Local Wi-Fi for the fastest classroom setup, then tap Go Live.');
  const [error, setError] = useState<string | null>(null);
  const [lastUploadAt, setLastUploadAt] = useState<string | null>(null);
  const [uploadCount, setUploadCount] = useState(0);

  const cleanedBackendUrl = useMemo(() => normalizeBackendUrl(backendUrl), [backendUrl]);
  const isHostedMode = connectionMode === 'hosted';
  const backendHint = isHostedMode
    ? 'Hosted mode is easy to try, but it will feel slower because snapshots travel through the internet.'
    : 'Local Wi-Fi mode is fastest. Use your laptop address, like http://192.168.x.x:8000.';
  const backendLabel = isHostedMode ? 'Hosted SketchBot URL' : 'Laptop / classroom backend URL';
  const primaryButtonLabel = busy ? 'Getting ready...' : streaming ? 'Stop Camera' : 'Go Live';

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
        if (saved.connectionMode === 'hosted' || saved.connectionMode === 'local') {
          setConnectionMode(saved.connectionMode);
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
        backendUrl,
        deviceLabel,
        connectionMode,
      } satisfies SavedConfig),
    ).catch(() => {});
  }, [backendUrl, connectionMode, deviceLabel]);

  const ensurePermission = async () => {
    if (permission?.granted) {
      return true;
    }
    const next = await requestPermission();
    return next.granted;
  };

  const pingBackend = async () => {
    if (!cleanedBackendUrl) {
      throw new Error('Add a backend URL first.');
    }

    const response = await fetch(`${cleanedBackendUrl}/api/state`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Backend check failed (${response.status}).`);
    }
  };

  const runUploadLoop = async (targetBackendUrl: string, label: string, mode: ConnectionMode) => {
    const pauseMs = mode === 'local' ? 120 : 280;
    const quality = mode === 'local' ? 0.16 : 0.1;

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

        setLastUploadAt(new Date().toLocaleTimeString());
        setUploadCount((current) => current + 1);
        await wait(pauseMs);
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Camera buddy streaming failed.';
      setError(message);
      setStatus('Camera buddy paused.');
      streamingRef.current = false;
      setStreaming(false);
    }
  };

  const stopStreaming = async () => {
    streamingRef.current = false;
    setStreaming(false);
    setBusy(false);
    setStatus('Camera buddy stopped. Tap Go Live when you are ready again.');
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
        throw new Error('Please add the backend URL first.');
      }

      setStatus('Checking the SketchBot room...');
      await pingBackend();

      setStatus('Switching SketchBot to Camera Buddy mode...');
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
      setStatus(
        isHostedMode
          ? 'Camera buddy is live. Hosted mode can feel slower than Local Wi-Fi.'
          : 'Camera buddy is live on the same Wi-Fi.',
      );
      setBusy(false);
      void runUploadLoop(cleanedBackendUrl, deviceLabel.trim() || 'Camera Buddy', connectionMode);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Camera buddy streaming failed.';
      setError(message);
      setStatus('Camera buddy could not start.');
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

  const handleModeChange = (mode: ConnectionMode) => {
    setConnectionMode(mode);
    setError(null);
    setStatus(mode === 'local' ? 'Local Wi-Fi is fastest for classrooms.' : 'Hosted mode is easier to reach, but slower.');
    if (mode === 'hosted') {
      setBackendUrl(HOSTED_BACKEND_URL);
    } else if (normalizeBackendUrl(backendUrl) === HOSTED_BACKEND_URL) {
      setBackendUrl('');
    }
  };

  const showSetupTip = () => {
    Alert.alert(
      connectionMode === 'local' ? 'Local Wi-Fi mode' : 'Hosted mode',
      connectionMode === 'local'
        ? 'Keep your phone or tablet on the same Wi-Fi as the dashboard laptop. Copy the laptop backend URL from the dashboard and paste it here.'
        : 'Hosted mode uses the public SketchBot backend URL. It is easier to reach, but much slower than Local Wi-Fi snapshots.',
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
            <Text style={styles.title}>Turn your phone into the robot camera</Text>
            <Text style={styles.subtitle}>
              The easiest setup is Local Wi-Fi: phone and laptop on the same network, then tap Go Live and aim at the whole canvas.
            </Text>
            <View style={styles.heroSteps}>
              <View style={styles.heroStep}>
                <Text style={styles.heroStepNumber}>1</Text>
                <Text style={styles.heroStepCopy}>Pick Local Wi-Fi or Hosted.</Text>
              </View>
              <View style={styles.heroStep}>
                <Text style={styles.heroStepNumber}>2</Text>
                <Text style={styles.heroStepCopy}>Aim at the paper and AprilTags.</Text>
              </View>
              <View style={styles.heroStep}>
                <Text style={styles.heroStepNumber}>3</Text>
                <Text style={styles.heroStepCopy}>Tap Go Live.</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Choose your connection</Text>
            <View style={styles.modeRow}>
              <Pressable
                style={[styles.modeButton, connectionMode === 'local' ? styles.modeButtonActive : null]}
                onPress={() => handleModeChange('local')}
              >
                <Text style={[styles.modeTitle, connectionMode === 'local' ? styles.modeTitleActive : null]}>Local Wi-Fi</Text>
                <Text style={[styles.modeCopy, connectionMode === 'local' ? styles.modeCopyActive : null]}>Fastest for the same room</Text>
              </Pressable>
              <Pressable
                style={[styles.modeButton, connectionMode === 'hosted' ? styles.modeButtonActive : null]}
                onPress={() => handleModeChange('hosted')}
              >
                <Text style={[styles.modeTitle, connectionMode === 'hosted' ? styles.modeTitleActive : null]}>Hosted</Text>
                <Text style={[styles.modeCopy, connectionMode === 'hosted' ? styles.modeCopyActive : null]}>Easier to reach, slower</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>{backendLabel}</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder={isHostedMode ? HOSTED_BACKEND_URL : 'http://192.168.2.16:8000'}
              placeholderTextColor="#89a0c2"
              style={styles.input}
              value={backendUrl}
              onChangeText={setBackendUrl}
            />
            <Text style={styles.helperText}>{backendHint}</Text>

            <Pressable style={styles.secondaryButton} onPress={showSetupTip}>
              <Text style={styles.secondaryButtonText}>Show setup tip</Text>
            </Pressable>

            <Pressable style={styles.linkButton} onPress={() => setShowSettings((current) => !current)}>
              <Text style={styles.linkButtonText}>{showSettings ? 'Hide extra settings' : 'Edit camera name'}</Text>
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
                <Text style={styles.cameraHint}>Keep the whole paper and all AprilTags visible.</Text>
              </View>
              <Pressable style={styles.ghostButton} onPress={flipCamera}>
                <Text style={styles.ghostButtonText}>{cameraFacing === 'back' ? 'Front camera' : 'Back camera'}</Text>
              </Pressable>
            </View>

            <View style={styles.cameraShell}>
              {permission?.granted ? (
                <CameraView ref={cameraRef} style={styles.camera} facing={cameraFacing} />
              ) : (
                <View style={[styles.camera, styles.cameraPlaceholder]}>
                  <Text style={styles.cameraPlaceholderText}>We’ll ask for camera permission when you tap Go Live.</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ready check</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillLabel}>Mode</Text>
                <Text style={styles.statusPillValue}>{connectionMode === 'local' ? 'Local Wi-Fi' : 'Hosted'}</Text>
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
    maxWidth: '85%',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: '#576182',
    maxWidth: '92%',
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
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeButton: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#f5f6ff',
    borderWidth: 1,
    borderColor: '#dde3ff',
    gap: 4,
  },
  modeButtonActive: {
    backgroundColor: '#edf9ff',
    borderColor: '#97ddff',
    shadowColor: '#79d5ff',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  modeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#26345d',
  },
  modeTitleActive: {
    color: '#0d5578',
  },
  modeCopy: {
    fontSize: 12,
    lineHeight: 16,
    color: '#6d7899',
  },
  modeCopyActive: {
    color: '#4a6d87',
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
