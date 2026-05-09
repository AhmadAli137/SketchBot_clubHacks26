'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Cpu, Loader2, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { CLOUD_API_URL } from '@/lib/config';

// Mirror of cloud-backend/app/routers/devices.py::Device, kept local so
// the companion isn't coupled to a generated client.
type Device = {
  id: string;
  serial: string;
  name: string | null;
  registered_at: string;
  last_seen_at: string | null;
  has_token: boolean;
  token_issued_at: string | null;
};

// Three states the companion shell can be in. Voice + avatar + canvas
// land in 2c.4b/c/f — for now `connected` is the terminal state.
type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

// Derive the WS URL from the configured cloud API URL. The cloud
// runs HTTPS in prod, ws over plaintext only when devs override.
function controlWsUrl(): string {
  const u = new URL(CLOUD_API_URL);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = '/ws/control';
  u.search = '';
  return u.toString();
}

async function getSupabaseToken(): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function CompanionClient() {
  // ── Device picker state ──────────────────────────────────────────────
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Device | null>(null);

  // ── Connection state ─────────────────────────────────────────────────
  const [conn, setConn] = useState<ConnectionState>('idle');
  const [robotOnline, setRobotOnline] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const wsRef = useRef<WebSocket | null>(null);

  // ── Load device list once on mount ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getSupabaseToken();
        if (!token) { setLoadError('Please sign in again.'); return; }
        const res = await fetch(`${CLOUD_API_URL}/api/devices`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as { devices: Device[] };
        if (!cancelled) setDevices(data.devices);
      } catch {
        if (!cancelled) {
          setLoadError("Couldn't load your robots. Try again in a moment.");
          setDevices([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Open WS when a device is selected, close when deselected/unmount ─
  useEffect(() => {
    if (!selected) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    setConn('connecting');
    setRobotOnline(false);
    setStatusMessage('');

    void (async () => {
      const token = await getSupabaseToken();
      if (!token || cancelled) {
        if (!cancelled) {
          setConn('error');
          setStatusMessage('Please sign in again.');
        }
        return;
      }
      ws = new WebSocket(controlWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        ws?.send(JSON.stringify({
          type: 'hello',
          auth_token: token,
          device_id: selected.id,
        }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'hello_ack' && msg.ok) {
            setConn('connected');
          } else if (msg.type === 'device_status') {
            setRobotOnline(!!msg.online);
          }
          // Telemetry / heartbeats / command_result land here too once
          // the firmware is connected — wired up in 2c.4d when the
          // canvas needs them.
        } catch {
          // Ignore malformed frames.
        }
      };

      ws.onerror = () => {
        setConn('error');
        setStatusMessage('Connection error.');
      };

      ws.onclose = (ev) => {
        if (cancelled) return;
        setConn('error');
        // 4xxx codes are app-level (we set them on the server). Map a
        // few to friendlier messages for the kid; everything else is
        // "we lost connection" so they know to retry.
        if (ev.code === 4401) setStatusMessage('Sign-in expired. Please sign in again.');
        else if (ev.code === 4404) setStatusMessage('That robot is no longer registered to your account.');
        else if (ev.code === 4409) setStatusMessage('Another session connected. Refresh to take over.');
        else if (ev.code === 1000) setStatusMessage('Disconnected.');
        else setStatusMessage('Lost connection — try again in a moment.');
      };
    })();

    return () => {
      cancelled = true;
      if (ws && ws.readyState <= WebSocket.OPEN) {
        try { ws.close(1000, 'unmount'); } catch { /* ignore */ }
      }
      wsRef.current = null;
    };
  }, [selected]);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <main className="companion-shell">
      <header className="companion-header">
        {selected ? (
          <button
            type="button"
            className="companion-back"
            onClick={() => setSelected(null)}
            aria-label="Back to robot list"
          >
            <ChevronLeft size={18} />
            Robots
          </button>
        ) : (
          <Link href="/account" className="companion-back" aria-label="Back to account">
            <ChevronLeft size={18} />
            Account
          </Link>
        )}
        <h1 className="companion-title">SaySpark Companion</h1>
        <div style={{ width: 60 }} aria-hidden />
      </header>

      {!selected ? (
        <DevicePicker
          devices={devices}
          loadError={loadError}
          onPick={setSelected}
        />
      ) : (
        <ConnectedView
          device={selected}
          conn={conn}
          robotOnline={robotOnline}
          statusMessage={statusMessage}
        />
      )}
    </main>
  );
}

function DevicePicker(props: {
  devices: Device[] | null;
  loadError: string | null;
  onPick: (d: Device) => void;
}) {
  const { devices, loadError, onPick } = props;

  if (devices === null) {
    return (
      <section className="companion-empty">
        <Loader2 size={28} style={{ animation: 'spin 0.9s linear infinite' }} />
        <p>Loading your robots…</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="companion-empty">
        <AlertTriangle size={28} />
        <p>{loadError}</p>
      </section>
    );
  }

  if (devices.length === 0) {
    return (
      <section className="companion-empty">
        <Cpu size={28} />
        <p>No robots registered to this account yet.</p>
        <Link href="/account" className="btn btn-outline btn-sm" style={{ marginTop: 8 }}>
          Register one →
        </Link>
      </section>
    );
  }

  return (
    <section className="companion-picker">
      <p className="companion-picker-prompt">Pick a robot to talk to.</p>
      <ul className="companion-device-list">
        {devices.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              className="companion-device-card"
              onClick={() => onPick(d)}
            >
              <Cpu size={20} />
              <div className="companion-device-text">
                <div className="companion-device-name">
                  {d.name ?? <em>unnamed robot</em>}
                </div>
                <div className="companion-device-serial">{d.serial}</div>
              </div>
              {d.has_token ? (
                <span className="companion-device-ready" aria-label="Ready to connect">●</span>
              ) : (
                <span className="companion-device-notoken" aria-label="No connection token">!</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="companion-picker-hint">
        Robots without a connection token can&apos;t be reached from the
        phone. Issue one from the <Link href="/account">account page</Link>.
      </p>
    </section>
  );
}

function ConnectedView(props: {
  device: Device;
  conn: ConnectionState;
  robotOnline: boolean;
  statusMessage: string;
}) {
  const { device, conn, robotOnline, statusMessage } = props;

  return (
    <section className="companion-connected">
      <div className="companion-status-card">
        <div className="companion-status-row">
          <Cpu size={16} />
          <span className="companion-status-label">{device.name ?? device.serial}</span>
        </div>

        <div className={`companion-status-pill is-${conn}`}>
          {conn === 'connecting' && <><Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> Connecting to relay…</>}
          {conn === 'connected' && (
            robotOnline
              ? <><Wifi size={13} /> Robot online</>
              : <><WifiOff size={13} /> Robot is sleeping</>
          )}
          {conn === 'error' && <><AlertTriangle size={13} /> {statusMessage || 'Disconnected'}</>}
          {conn === 'idle' && <>Idle</>}
        </div>

        {conn === 'connected' && !robotOnline && (
          <p className="companion-status-hint">
            Power on your robot and it should appear here within a few seconds.
          </p>
        )}
      </div>

      <div className="companion-stage">
        <div className="companion-stage-placeholder">
          <p>🎙️ Voice will live here.</p>
          <p style={{ fontSize: '0.78rem', opacity: 0.6, marginTop: 6 }}>
            (Coming next — push-to-talk, Spark&apos;s avatar, and a live canvas of your robot.)
          </p>
        </div>
      </div>
    </section>
  );
}
