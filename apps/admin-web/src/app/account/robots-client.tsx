'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Plus, Trash2, Cpu } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { CLOUD_API_URL } from '@/lib/config';

// Mirror of cloud-backend/app/routers/devices.py::Device. Kept as a
// local type so the admin-web doesn't depend on a generated client.
type Device = {
  id: string;
  serial: string;
  name: string | null;
  registered_at: string;
  last_seen_at: string | null;
};

const SERIAL_PATTERN = /^SKETCH-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$/;

async function getToken(): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function RobotsCard() {
  const params = useSearchParams();
  // Desktop deep-link drops the connected bot's serial in the URL so the
  // user can claim it without retyping. We also remember whether the
  // initial value came from the URL so the form auto-focuses.
  const initialSerial = (params.get('serial') ?? '').toUpperCase();

  const [devices, setDevices] = useState<Device[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [serial, setSerial] = useState(initialSerial);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const refresh = async () => {
    setLoadError(null);
    try {
      const token = await getToken();
      if (!token) { setLoadError('Sign in again to see your robots.'); return; }
      const res = await fetch(`${CLOUD_API_URL}/api/devices`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { devices: Device[] };
      setDevices(data.devices);
    } catch {
      setLoadError('Could not load your robots. Try again in a moment.');
      setDevices([]);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const trimmed = serial.trim().toUpperCase();
    if (!SERIAL_PATTERN.test(trimmed)) {
      setSubmitError('Serial should look like SKETCH-XXXX-XXXX.');
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) { setSubmitError('Please sign in again.'); return; }
      const res = await fetch(`${CLOUD_API_URL}/api/devices`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serial: trimmed, name: name.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError((body as { detail?: string }).detail ?? 'Could not register that robot.');
        return;
      }
      setSerial('');
      setName('');
      await refresh();
    } catch {
      setSubmitError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnclaim = async (id: string) => {
    if (!confirm('Release this robot from your account? Anyone can claim it again afterwards.')) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${CLOUD_API_URL}/api/devices/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) await refresh();
    } catch { /* ignore */ }
  };

  return (
    <div className="card account-card" style={{ gridColumn: '1 / -1' }}>
      <p className="eyebrow">My Robots</p>
      <h3 className="headline" style={{ marginBottom: 8, fontSize: '1.05rem' }}>
        <Cpu size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: '-3px' }} />
        Registered SaySpark robots
      </h3>
      <p className="body-md" style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 16 }}>
        Each robot has a serial number — printed on the unit and shown in the desktop app when it&apos;s connected.
        Bind the serial to your account here so it can run AI-tutored programs.
      </p>

      {/* ── Existing list ───────────────────────────────────────────── */}
      {devices === null ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          <Loader2 size={13} style={{ display: 'inline', marginRight: 6, animation: 'spin 0.9s linear infinite', verticalAlign: '-2px' }} />
          Loading…
        </p>
      ) : devices.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', fontStyle: 'italic', marginBottom: 16 }}>
          No robots registered yet.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {devices.map((d) => (
            <li
              key={d.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.9rem' }}>{d.serial}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  {d.name ?? <em>unnamed</em>}{' · '}
                  registered {new Date(d.registered_at).toLocaleDateString()}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => handleUnclaim(d.id)}
                title="Release this robot"
                style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
              >
                <Trash2 size={13} />
                Release
              </button>
            </li>
          ))}
        </ul>
      )}
      {loadError && <p style={{ fontSize: '0.78rem', color: '#ef4444', marginBottom: 12 }}>{loadError}</p>}

      {/* ── Claim form ──────────────────────────────────────────────── */}
      <form onSubmit={handleClaim} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
        <input
          type="text"
          value={serial}
          onChange={(e) => setSerial(e.target.value.toUpperCase())}
          placeholder="SKETCH-XXXX-XXXX"
          autoFocus={!!initialSerial}
          required
          style={{
            flex: '1 1 220px',
            padding: '8px 10px', borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--fg)',
            fontFamily: 'var(--font-mono, monospace)', fontSize: '0.9rem',
            letterSpacing: '0.04em',
          }}
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nickname (optional)"
          maxLength={80}
          style={{
            flex: '1 1 160px',
            padding: '8px 10px', borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--fg)',
            fontSize: '0.9rem',
          }}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={submitting}
        >
          {submitting ? <Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> : <Plus size={13} />}
          {submitting ? 'Registering…' : 'Register robot'}
        </button>
      </form>
      {submitError && <p style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: 8 }}>{submitError}</p>}
    </div>
  );
}
