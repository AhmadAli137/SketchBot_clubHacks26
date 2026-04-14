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
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

const STORAGE_KEY = 'sketchbot-companion-config';

type SavedConfig = {
  backendUrl: string;
  deviceLabel: string;
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
  const [deviceLabel, setDeviceLabel] = useState('Studio companion');
  const [cameraFacing, setCameraFacing] = useState<CameraType>('back');
  const [streaming, setStreaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Add the local backend URL, allow camera access, and start streaming.');
  const [error, setError] = useState<string | null>(null);
  const [lastUploadAt, setLastUploadAt] = useState<string | null>(null);
  const [sameNetworkMode, setSameNetworkMode] = useState(true);

  const cleanedBackendUrl = useMemo(() => normalizeBackendUrl(backendUrl), [backendUrl]);

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
        backendUrl,
        deviceLabel,
      } satisfies SavedConfig),
    ).catch(() => {});
  }, [backendUrl, deviceLabel]);

  const ensurePermission = async () => {
    if (permission?.granted) {
      return true;
    }
    const next = await requestPermission();
    return next.granted;
  };

  const pingBackend = async () => {
    if (!cleanedBackendUrl) {
      throw new Error('Enter the backend URL first.');
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

  const runUploadLoop = async (targetBackendUrl: string, label: string) => {
    try {
      while (streamingRef.current) {
        const picture = await cameraRef.current?.takePictureAsync({
          base64: true,
          quality: 0.35,
          skipProcessing: true,
        });

        if (!picture?.base64) {
          await wait(250);
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
        await wait(250);
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Companion streaming failed.';
      setError(message);
      setStatus('Companion streaming failed.');
      streamingRef.current = false;
      setStreaming(false);
    }
  };

  const stopStreaming = async () => {
    streamingRef.current = false;
    setStreaming(false);
    setBusy(false);
    setStatus('Streaming stopped. You can start again at any time.');
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
        throw new Error('Camera permission is required for the companion app.');
      }

      if (!cleanedBackendUrl) {
        throw new Error('Please enter the backend URL from the dashboard.');
      }

      setStatus('Checking backend connection...');
      await pingBackend();

      setStatus('Selecting companion source on the backend...');
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
        throw new Error(`Could not select companion camera mode (${sourceResponse.status}).`);
      }

      streamingRef.current = true;
      setStreaming(true);
      setStatus('Companion camera live on the same network.');
      setBusy(false);
      void runUploadLoop(cleanedBackendUrl, deviceLabel.trim() || 'Studio companion');
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Companion streaming failed.';
      setError(message);
      setStatus('Companion streaming failed.');
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

  const maybeShowSameNetworkInfo = () => {
    if (!sameNetworkMode) {
      return;
    }

    Alert.alert(
      'Same-network mode',
      'Keep the companion device and dashboard laptop on the same Wi-Fi. Put the laptop backend URL into the app exactly as shown on the dashboard.',
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>SketchBot Companion</Text>
            <Text style={styles.title}>Same-network camera streaming</Text>
            <Text style={styles.subtitle}>
              Use a phone or tablet as the camera companion for SketchBot. This app is optimized for local Wi-Fi use with the laptop dashboard and backend on the same network.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Connection</Text>
            <Text style={styles.label}>Backend URL</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://192.168.2.16:8000"
              placeholderTextColor="#7e8aa4"
              style={styles.input}
              value={backendUrl}
              onChangeText={setBackendUrl}
            />

            <Text style={styles.label}>Device Label</Text>
            <TextInput
              autoCapitalize="words"
              placeholder="Studio tablet"
              placeholderTextColor="#7e8aa4"
              style={styles.input}
              value={deviceLabel}
              onChangeText={setDeviceLabel}
            />

            <View style={styles.inlineRow}>
              <View style={styles.inlineCopy}>
                <Text style={styles.inlineTitle}>Same-network mode</Text>
                <Text style={styles.inlineSubtitle}>No TURN, no relay, no cloud media required.</Text>
              </View>
              <Switch value={sameNetworkMode} onValueChange={setSameNetworkMode} />
            </View>

            <Pressable style={styles.secondaryButton} onPress={maybeShowSameNetworkInfo}>
              <Text style={styles.secondaryButtonText}>Show setup tip</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <View style={styles.cameraHeader}>
              <View>
                <Text style={styles.cardTitle}>Live Preview</Text>
                <Text style={styles.cameraHint}>Aim the camera so the full canvas and AprilTags stay visible.</Text>
              </View>
              <Pressable style={styles.ghostButton} onPress={flipCamera}>
                <Text style={styles.ghostButtonText}>{cameraFacing === 'back' ? 'Use front camera' : 'Use back camera'}</Text>
              </Pressable>
            </View>

            <View style={styles.cameraShell}>
              {permission?.granted ? (
                <CameraView ref={cameraRef} style={styles.camera} facing={cameraFacing} />
              ) : (
                <View style={[styles.camera, styles.cameraPlaceholder]}>
                  <Text style={styles.cameraPlaceholderText}>Camera permission will be requested when you start streaming.</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Status</Text>
            <View style={styles.statusBlock}>
              <Text style={styles.statusText}>{status}</Text>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <Text style={styles.metaText}>Last upload: {lastUploadAt ?? 'not yet'}</Text>
              <Text style={styles.metaText}>Streaming: {streaming ? 'yes' : 'no'}</Text>
            </View>

            <Pressable style={[styles.primaryButton, busy ? styles.buttonDisabled : null]} onPress={() => void handlePrimaryAction()} disabled={busy}>
              {busy ? <ActivityIndicator color="#08111f" /> : <Text style={styles.primaryButtonText}>{streaming ? 'Stop Streaming' : 'Start Streaming'}</Text>}
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
    backgroundColor: '#eef4ff',
  },
  flex: {
    flex: 1,
  },
  container: {
    padding: 20,
    gap: 16,
  },
  hero: {
    gap: 8,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#4878a8',
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    color: '#10213a',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#50617f',
  },
  card: {
    backgroundColor: '#fbfdff',
    borderRadius: 24,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#d5e3fb',
    shadowColor: '#4f75ad',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10213a',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4f6182',
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d2def5',
    backgroundColor: '#f5f8ff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#10213a',
  },
  inlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  inlineCopy: {
    flex: 1,
    gap: 4,
  },
  inlineTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10213a',
  },
  inlineSubtitle: {
    fontSize: 13,
    color: '#5f6f8d',
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cameraHint: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#5f6f8d',
  },
  cameraShell: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#c8d8f4',
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
  statusBlock: {
    gap: 6,
  },
  statusText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#10213a',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#c1383e',
    fontWeight: '600',
  },
  metaText: {
    fontSize: 13,
    color: '#5f6f8d',
  },
  primaryButton: {
    backgroundColor: '#7be0ff',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#08111f',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cad9f6',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7faff',
  },
  secondaryButtonText: {
    color: '#223452',
    fontWeight: '700',
    fontSize: 14,
  },
  ghostButton: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#edf4ff',
  },
  ghostButtonText: {
    color: '#27446d',
    fontWeight: '700',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
