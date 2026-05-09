import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, space, type as fontType } from '../theme';

/**
 * Spark Companion — "Talk to your robot" mode (Phase 2c.4a, shell only).
 *
 * Internal state machine:
 *   setup       → user pastes cloud URL + Supabase access token
 *   picker      → fetch /api/devices, kid taps a row
 *   connecting  → WS hello in flight against /ws/control
 *   connected   → relay established; firmware online/offline shown live
 *   error       → terminal failure with a friendlier message
 *
 * Voice + avatar + canvas land in subsequent slices (2c.4b/c/d/f). This
 * file is just the connection plumbing so they have a stable target.
 *
 * Auth note: pasting an access token is a stop-gap. Real auth comes in
 * 2c.4g via QR pairing from the desktop, so kids never have to type a
 * password into a phone. The paste flow is what unblocks development
 * testing today.
 */

type Mode = 'setup' | 'picker' | 'connecting' | 'connected' | 'error';

type Device = {
  id: string;
  serial: string;
  name: string | null;
  registered_at: string;
  last_seen_at: string | null;
  has_token: boolean;
  token_issued_at: string | null;
};

type SparkConfig = {
  cloudUrl: string;     // e.g. https://api.sayspark.ca
  accessToken: string;  // Supabase access JWT
};

const STORAGE_KEY = 'sketchbot.spark-companion.v1';
const DEFAULT_CLOUD_URL = 'https://api.sayspark.ca';

type Props = {
  onBack: () => void;
};

export function SparkCompanion({ onBack }: Props) {
  // ── Persisted config ────────────────────────────────────────────────
  const [config, setConfig] = useState<SparkConfig | null>(null);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<SparkConfig>;
          if (parsed.cloudUrl && parsed.accessToken) {
            setConfig({ cloudUrl: parsed.cloudUrl, accessToken: parsed.accessToken });
          }
        }
      } catch {
        // corrupt storage — fall through to setup
      } finally {
        setHydrating(false);
      }
    })();
  }, []);

  const saveConfig = useCallback(async (cfg: SparkConfig) => {
    setConfig(cfg);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
  }, []);

  const clearConfig = useCallback(async () => {
    setConfig(null);
    try { await AsyncStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  // ── Mode + selected device ─────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('setup');
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [selected, setSelected] = useState<Device | null>(null);
  const [robotOnline, setRobotOnline] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const wsRef = useRef<WebSocket | null>(null);

  // Once config is loaded (and present), advance to picker.
  useEffect(() => {
    if (hydrating) return;
    if (config) setMode('picker');
    else setMode('setup');
  }, [config, hydrating]);

  // ── Device list fetch ───────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    if (!config) return;
    try {
      const res = await fetch(`${config.cloudUrl}/api/devices`, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { devices: Device[] };
      setDevices(body.devices);
    } catch {
      setMode('error');
      setErrorMessage("Couldn't load your robots. Check that your token hasn't expired.");
    }
  }, [config]);

  useEffect(() => {
    if (mode !== 'picker') return;
    void refreshDevices();
  }, [mode, refreshDevices]);

  // ── WS lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'connecting' || !selected || !config) return;

    let cancelled = false;
    let everConnected = false;  // flips to true after hello_ack — distinguishes
                                // "never connected" (auth/lookup failure) from
                                // "got disconnected" so we show the right copy.
    setRobotOnline(false);

    const wsUrl = (() => {
      const u = new URL(config.cloudUrl);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      u.pathname = '/ws/control';
      return u.toString();
    })();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'hello',
        auth_token: config.accessToken,
        device_id: selected.id,
      }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'hello_ack' && msg.ok) {
          everConnected = true;
          if (!cancelled) setMode('connected');
        } else if (msg.type === 'device_status') {
          if (!cancelled) setRobotOnline(!!msg.online);
        }
        // Telemetry / heartbeat / command_result also flow through here
        // — wired up for the canvas and voice loop in later slices.
      } catch {
        // ignore malformed
      }
    };

    ws.onerror = () => {
      if (!cancelled) {
        setMode('error');
        setErrorMessage('Connection error. Check the cloud URL and try again.');
      }
    };

    ws.onclose = (ev) => {
      if (cancelled) return;
      // Cloud relay's app-level close codes (see routers/control_ws.py).
      if (ev.code === 4401) {
        setMode('error');
        setErrorMessage('Sign-in expired. Paste a fresh token to reconnect.');
      } else if (ev.code === 4404) {
        setMode('error');
        setErrorMessage("That robot isn't registered to your account.");
      } else if (ev.code === 4409) {
        setMode('error');
        setErrorMessage('Another session connected. Try again to take over.');
      } else if (everConnected) {
        setMode('error');
        setErrorMessage('Lost connection. Try again.');
      }
    };

    return () => {
      cancelled = true;
      try { ws.close(1000, 'unmount'); } catch { /* ignore */ }
      wsRef.current = null;
    };
  }, [mode, selected, config]);

  // ── Render ──────────────────────────────────────────────────────────
  if (hydrating) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Menu</Text>
        </Pressable>
        <Text style={styles.eyebrow}>Spark Companion</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {mode === 'setup' && <SetupForm onSave={saveConfig} />}

        {mode === 'picker' && (
          <DevicePicker
            devices={devices}
            onPick={(d) => {
              if (!d.has_token) {
                setMode('error');
                setErrorMessage("This robot doesn't have a connection token yet. Issue one from the account page on sayspark.ca first.");
                return;
              }
              setSelected(d);
              setMode('connecting');
            }}
            onResetConfig={clearConfig}
          />
        )}

        {mode === 'connecting' && (
          <View style={styles.card}>
            <ActivityIndicator color={colors.cyan} />
            <Text style={styles.body}>Connecting to {selected?.name ?? selected?.serial}…</Text>
          </View>
        )}

        {mode === 'connected' && selected && (
          <ConnectedView
            device={selected}
            robotOnline={robotOnline}
            onDisconnect={() => {
              try { wsRef.current?.close(1000, 'user-disconnect'); } catch { /* ignore */ }
              setSelected(null);
              setMode('picker');
            }}
          />
        )}

        {mode === 'error' && (
          <View style={styles.card}>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.body}>{errorMessage}</Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => {
                setErrorMessage('');
                setMode(config ? 'picker' : 'setup');
              }}
            >
              <Text style={styles.primaryBtnText}>Try again</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Setup form ──────────────────────────────────────────────────────────────
function SetupForm({ onSave }: { onSave: (cfg: SparkConfig) => void }) {
  const [cloudUrl, setCloudUrl] = useState(DEFAULT_CLOUD_URL);
  const [token, setToken] = useState('');

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Set up Spark Companion</Text>
      <Text style={styles.body}>
        Paste your SaySpark sign-in token below to connect this phone to your robot.
        We&apos;ll replace this with QR scanning soon — for now, copy the access
        token from sayspark.ca after signing in.
      </Text>

      <Text style={styles.label}>Cloud URL</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={styles.input}
        value={cloudUrl}
        onChangeText={setCloudUrl}
        placeholder="https://api.sayspark.ca"
        placeholderTextColor={colors.muted2}
      />

      <Text style={styles.label}>Access token</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        style={[styles.input, styles.inputMultiline]}
        value={token}
        onChangeText={setToken}
        placeholder="eyJhbGciOi…"
        placeholderTextColor={colors.muted2}
      />

      <Pressable
        style={[styles.primaryBtn, (!cloudUrl.trim() || !token.trim()) && styles.btnDisabled]}
        disabled={!cloudUrl.trim() || !token.trim()}
        onPress={() => onSave({ cloudUrl: cloudUrl.trim().replace(/\/+$/, ''), accessToken: token.trim() })}
      >
        <Text style={styles.primaryBtnText}>Save & continue</Text>
      </Pressable>
    </View>
  );
}

// ─── Device picker ───────────────────────────────────────────────────────────
function DevicePicker(props: {
  devices: Device[] | null;
  onPick: (d: Device) => void;
  onResetConfig: () => void;
}) {
  const { devices, onPick, onResetConfig } = props;

  if (devices === null) {
    return (
      <View style={[styles.card, styles.center]}>
        <ActivityIndicator color={colors.cyan} />
        <Text style={styles.body}>Loading your robots…</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: space[3] }}>
      <View style={styles.card}>
        <Text style={styles.title}>Pick a robot</Text>
        {devices.length === 0 ? (
          <Text style={styles.body}>
            No robots registered to this account yet. Visit sayspark.ca/account to add one.
          </Text>
        ) : (
          <View style={{ gap: space[2] }}>
            {devices.map((d) => (
              <Pressable key={d.id} style={styles.deviceRow} onPress={() => onPick(d)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{d.name ?? 'Unnamed robot'}</Text>
                  <Text style={styles.deviceSerial}>{d.serial}</Text>
                </View>
                <Text style={d.has_token ? styles.deviceReady : styles.deviceNotReady}>
                  {d.has_token ? '●' : '!'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <Pressable onPress={onResetConfig} style={styles.tertiaryBtn}>
        <Text style={styles.tertiaryBtnText}>Sign out / change account</Text>
      </Pressable>
    </View>
  );
}

// ─── Connected view ──────────────────────────────────────────────────────────
function ConnectedView(props: {
  device: Device;
  robotOnline: boolean;
  onDisconnect: () => void;
}) {
  const { device, robotOnline, onDisconnect } = props;

  return (
    <View style={{ gap: space[3] }}>
      <View style={styles.card}>
        <Text style={styles.eyebrowSmall}>Connected to</Text>
        <Text style={styles.title}>{device.name ?? device.serial}</Text>
        <Text style={styles.deviceSerial}>{device.serial}</Text>

        <View
          style={[
            styles.statusPill,
            { backgroundColor: robotOnline ? 'rgba(125,255,181,0.15)' : 'rgba(128,150,191,0.18)' },
          ]}
        >
          <Text style={{ color: robotOnline ? colors.green : colors.muted, ...fontType.body }}>
            {robotOnline ? '● Robot online' : '○ Robot is sleeping'}
          </Text>
        </View>

        {!robotOnline && (
          <Text style={styles.body}>
            Power on your robot. As soon as it connects to the cloud you&apos;ll see it light up here.
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>🎙️ Voice coming soon</Text>
        <Text style={styles.body}>
          Push-to-talk, Spark&apos;s avatar, and the live canvas of your robot will land here
          once the relay is verified end-to-end with real hardware.
        </Text>
      </View>

      <Pressable onPress={onDisconnect} style={styles.tertiaryBtn}>
        <Text style={styles.tertiaryBtnText}>Disconnect</Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    paddingTop: space[6],
    paddingBottom: space[3],
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
  },
  backText: {
    color: colors.muted,
    ...fontType.body,
  },
  eyebrow: {
    color: colors.cyan,
    ...fontType.eyebrow,
  },
  eyebrowSmall: {
    color: colors.muted,
    ...fontType.eyebrow,
    marginBottom: 4,
  },
  scroll: {
    padding: space[4],
    gap: space[3],
  },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space[5],
    gap: space[3],
  },
  title: {
    color: colors.text,
    ...fontType.title,
    fontSize: 22,
    lineHeight: 28,
  },
  body: {
    color: colors.muted,
    ...fontType.body,
  },
  label: {
    color: colors.muted,
    ...fontType.eyebrow,
    marginTop: space[2],
    marginBottom: -2,
  },
  input: {
    backgroundColor: colors.panel2,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    ...fontType.body,
  },
  inputMultiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    backgroundColor: colors.cyan,
    borderRadius: radius.sm,
    paddingVertical: space[3],
    alignItems: 'center',
    marginTop: space[3],
  },
  primaryBtnText: {
    color: colors.bg,
    ...fontType.subtitle,
    fontSize: 16,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  tertiaryBtn: {
    paddingVertical: space[3],
    alignItems: 'center',
  },
  tertiaryBtnText: {
    color: colors.muted,
    ...fontType.body,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel2,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space[3],
    gap: space[2],
  },
  deviceName: {
    color: colors.text,
    ...fontType.subtitle,
  },
  deviceSerial: {
    color: colors.muted,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 12,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  deviceReady: {
    color: colors.green,
    fontSize: 18,
  },
  deviceNotReady: {
    color: colors.pink,
    fontSize: 18,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: space[3],
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: space[2],
  },
  errorTitle: {
    color: colors.danger,
    ...fontType.subtitle,
    fontSize: 16,
  },
});
