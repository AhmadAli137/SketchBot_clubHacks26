'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

type Student = {
  rank: number;
  student_name: string;
  xp: number;
  level: number;
  level_name: string;
  level_emoji: string;
  badge_count: number;
  streak_days: number;
  drawings_count: number;
  concepts_started: number;
  concepts_mastered: number;
};

type Session = {
  id: string;
  join_code: string;
  classroom_name: string;
  status: string;
  created_at: string;
  closed_at?: string | null;
};

type Participant = {
  id: string;
  student_name: string;
  status: string;
  current_step: number;
  xp_earned: number;
  joined_at: string;
  last_heartbeat_at?: string;
};

type SortKey = 'rank' | 'xp' | 'level' | 'streak_days' | 'badge_count' | 'drawings_count';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_RUNTIME = 'http://localhost:8787';
const HEARTBEAT_STALE_MS = 45_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function isOnline(p: Participant): boolean {
  if (p.status !== 'active') return false;
  if (!p.last_heartbeat_at) return true; // no heartbeat data — assume online
  return Date.now() - new Date(p.last_heartbeat_at).getTime() < HEARTBEAT_STALE_MS;
}

function XPBar({ xp, level }: { xp: number; level: number }) {
  const thresholds = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4100, 5500, 7200, 9200];
  const next = thresholds[level] ?? 9999;
  const prev = thresholds[level - 1] ?? 0;
  const pct = next > prev ? Math.min(100, Math.round(((xp - prev) / (next - prev)) * 100)) : 100;
  return (
    <div className="db-xpbar-track">
      <div className="db-xpbar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ color: '#fbbf24', fontSize: '1rem' }}>🥇</span>;
  if (rank === 2) return <span style={{ color: '#d1d5db', fontSize: '1rem' }}>🥈</span>;
  if (rank === 3) return <span style={{ color: '#b45309', fontSize: '1rem' }}>🥉</span>;
  return <span className="db-lb-rank">#{rank}</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = { token: string | null; displayName: string };

export function DashboardClient({ token, displayName }: Props) {
  const [runtimeUrl, setRuntimeUrl] = useState(DEFAULT_RUNTIME);
  const [runtimeInput, setRuntimeInput] = useState(DEFAULT_RUNTIME);
  const [reachable, setReachable] = useState<boolean | null>(null);

  // Session state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [history, setHistory] = useState<Session[]>([]);
  const [activeCode, setActiveCode] = useState('');
  const [sessionLocked, setSessionLocked] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sessionCodeInput, setSessionCodeInput] = useState('');
  const [sessionNameInput, setSessionNameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<Student[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDesc, setSortDesc] = useState(true);
  const [search, setSearch] = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const authHeaders = useCallback((): HeadersInit => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  const fetchAll = useCallback(async (base: string) => {
    try {
      const [lb, myS, hist] = await Promise.all([
        fetch(`${base}/api/progress/leaderboard`, { cache: 'no-store' }),
        fetch(`${base}/api/sessions/my-sessions`, { headers: authHeaders(), cache: 'no-store' }),
        fetch(`${base}/api/sessions/history`, { headers: authHeaders(), cache: 'no-store' }),
      ]);

      if (lb.ok) {
        const data = await lb.json() as { leaderboard: Student[] };
        setLeaderboard(data.leaderboard ?? []);
        setReachable(true);
      } else {
        setReachable(false);
      }

      if (myS.ok) {
        const data = await myS.json() as { sessions: Session[] };
        setSessions(data.sessions ?? []);
      }

      if (hist.ok) {
        const data = await hist.json() as { sessions: Session[] };
        setHistory(data.sessions ?? []);
      }
    } catch {
      setReachable(false);
    }
  }, [authHeaders]);

  const fetchParticipants = useCallback(async (base: string, code: string) => {
    if (!code) return;
    try {
      const res = await fetch(`${base}/api/sessions/participants/${code}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json() as { participants: Participant[] };
        setParticipants(data.participants ?? []);
      }
    } catch { /* keep showing stale */ }
  }, []);

  useEffect(() => {
    void fetchAll(runtimeUrl);
    pollRef.current = setInterval(() => void fetchAll(runtimeUrl), 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [runtimeUrl, fetchAll]);

  useEffect(() => {
    if (!activeCode) { setParticipants([]); return; }
    void fetchParticipants(runtimeUrl, activeCode);
    const t = setInterval(() => void fetchParticipants(runtimeUrl, activeCode), 5_000);
    return () => clearInterval(t);
  }, [runtimeUrl, activeCode, fetchParticipants]);

  const handleConnect = () => {
    const url = runtimeInput.trim().replace(/\/$/, '');
    setRuntimeUrl(url);
    setReachable(null);
    setLeaderboard([]);
    setSessions([]);
    setHistory([]);
    setParticipants([]);
    setActiveCode('');
    setSessionLocked(false);
  };

  const handleCreateSession = async () => {
    setLoading(true);
    try {
      const name = sessionNameInput.trim() || 'My Class';
      const res = await fetch(`${runtimeUrl}/api/sessions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ classroom_name: name }),
      });
      if (res.ok) {
        const data = await res.json() as { join_code: string };
        setActiveCode(data.join_code);
        setSessionNameInput('');
        setSessionLocked(false);
        await fetchAll(runtimeUrl);
      }
    } catch { /* show error */ }
    setLoading(false);
  };

  const handleMonitorSession = async () => {
    const code = sessionCodeInput.trim().toUpperCase();
    if (!code) return;
    const res = await fetch(`${runtimeUrl}/api/sessions/validate/${code}`);
    if (res.ok) {
      const d = await res.json() as { valid: boolean };
      if (d.valid) { setActiveCode(code); setSessionCodeInput(''); setSessionLocked(false); }
    }
  };

  const handleEndSession = async () => {
    if (!activeCode) return;
    await fetch(`${runtimeUrl}/api/sessions/close/${activeCode}`, {
      method: 'POST',
      headers: authHeaders(),
    });
    setActiveCode('');
    setSessionLocked(false);
    setParticipants([]);
    await fetchAll(runtimeUrl);
  };

  const handleToggleLock = async () => {
    if (!activeCode) return;
    const endpoint = sessionLocked ? 'unlock' : 'lock';
    await fetch(`${runtimeUrl}/api/sessions/${endpoint}/${activeCode}`, {
      method: 'POST',
      headers: authHeaders(),
    });
    setSessionLocked(!sessionLocked);
  };

  const handleCopyCode = async () => {
    if (!activeCode) return;
    try {
      await navigator.clipboard.writeText(activeCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  const activeOnline = participants.filter(isOnline).length;
  const allSessions = [...sessions, ...history.filter(h => !sessions.some(s => s.id === h.id))];

  // Sorted + filtered leaderboard
  const displayLeaderboard = leaderboard
    .filter(s => !search || s.student_name.toLowerCase().includes(search.toLowerCase()))
    .slice()
    .sort((a, b) => {
      const mult = sortDesc ? -1 : 1;
      if (sortKey === 'rank') return (a.rank - b.rank) * -mult;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * mult;
    });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc(d => !d);
    else { setSortKey(key); setSortDesc(true); }
  };

  const SortBtn = ({ label, k }: { label: string; k: SortKey }) => (
    <button
      type="button"
      className="db-sort-btn"
      onClick={() => handleSort(k)}
      style={{ color: sortKey === k ? 'var(--blue)' : undefined }}
    >
      {label}{sortKey === k ? (sortDesc ? ' ↓' : ' ↑') : ''}
    </button>
  );

  return (
    <main className="db-main">
      <div className="db-container">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="db-header">
          <div>
            <h1 className="db-title">Classroom Dashboard</h1>
            <p className="db-subtitle">
              Signed in as <strong>{displayName}</strong> · Live session monitoring · student progress
            </p>
          </div>
          <div className="db-runtime-row">
            <input
              className="db-input"
              value={runtimeInput}
              onChange={e => setRuntimeInput(e.target.value)}
              placeholder="http://localhost:8787"
              onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
            />
            <button className="db-btn-ghost" onClick={handleConnect}>Connect</button>
            <span
              className={`db-status-dot ${reachable === true ? 'online' : reachable === false ? 'offline' : 'pending'}`}
              title={reachable === true ? 'Runtime online' : reachable === false ? 'Cannot reach runtime' : 'Checking…'}
            />
          </div>
        </div>

        {reachable === false && (
          <div className="db-alert">
            Cannot reach the SketchBot desktop runtime at <strong>{runtimeUrl}</strong>.
            Open the desktop app and make sure it&apos;s running, then click Connect.
          </div>
        )}

        {reachable === null && (
          <div className="db-alert" style={{ borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.07)', color: '#fcd34d' }}>
            Connecting to runtime…
          </div>
        )}

        {reachable === true && (
          <motion.div
            className="db-grid"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >

            {/* ── Left column ─────────────────────────────────────────── */}
            <div className="db-col db-col--left">
              <div className="db-card">
                <div className="db-card-head">
                  <span className="db-card-title">Live Session</span>
                  {activeCode && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {sessionLocked
                        ? <span className="db-badge-locked">🔒 Locked</span>
                        : <span className="db-online-badge">{activeOnline} online</span>
                      }
                    </div>
                  )}
                </div>

                {activeCode ? (
                  <>
                    <div className="db-code-display">
                      <div style={{ flex: 1 }}>
                        <div className="db-code-label">Join Code</div>
                        <div className="db-code-value">{activeCode}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button
                          type="button"
                          className="db-btn-ghost"
                          style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                          onClick={handleCopyCode}
                        >
                          {codeCopied ? '✓ Copied' : 'Copy'}
                        </button>
                        <button
                          type="button"
                          className="db-btn-ghost"
                          style={{ fontSize: '0.78rem', padding: '5px 10px', color: sessionLocked ? 'var(--green)' : 'var(--amber)' }}
                          onClick={handleToggleLock}
                        >
                          {sessionLocked ? '🔓 Unlock' : '🔒 Lock'}
                        </button>
                      </div>
                    </div>

                    <div className="db-participant-list">
                      {participants.length === 0 ? (
                        <p className="db-empty">Waiting for students to join…</p>
                      ) : (
                        <AnimatePresence>
                          {participants.map(p => {
                            const online = isOnline(p);
                            return (
                              <motion.div
                                key={p.id}
                                className={`db-participant ${online ? 'active' : 'disconnected'}`}
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -12 }}
                                transition={{ duration: 0.2 }}
                              >
                                <div className="db-participant-info">
                                  <span className="db-participant-name">{p.student_name}</span>
                                  <span className="db-participant-meta">
                                    Step {p.current_step} · {p.xp_earned} XP · joined {fmtDate(p.joined_at)}
                                  </span>
                                </div>
                                <div className={`db-dot ${online ? 'active' : 'disconnected'}`} />
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      )}
                    </div>

                    <button className="db-btn-danger" onClick={handleEndSession}>
                      End Session
                    </button>
                  </>
                ) : (
                  <>
                    <p className="db-empty" style={{ marginBottom: 4 }}>No active session.</p>

                    <div className="db-session-actions">
                      <input
                        className="db-input"
                        style={{ width: '100%' }}
                        value={sessionNameInput}
                        onChange={e => setSessionNameInput(e.target.value)}
                        placeholder="Class name (e.g. Period 3)"
                        onKeyDown={e => { if (e.key === 'Enter') void handleCreateSession(); }}
                        maxLength={60}
                      />
                      <button
                        className="db-btn-primary"
                        onClick={handleCreateSession}
                        disabled={loading}
                        style={{ width: '100%' }}
                      >
                        {loading ? 'Starting…' : '+ Start New Session'}
                      </button>
                      <div className="db-lookup-row">
                        <input
                          className="db-input db-input--code"
                          placeholder="Monitor code"
                          value={sessionCodeInput}
                          onChange={e => setSessionCodeInput(e.target.value.toUpperCase())}
                          maxLength={10}
                        />
                        <button className="db-btn-ghost" onClick={handleMonitorSession}>Monitor</button>
                      </div>
                    </div>

                    {allSessions.length > 0 && (
                      <div className="db-past-sessions">
                        <p className="db-section-label">Recent sessions</p>
                        {allSessions.map(s => (
                          <div
                            key={s.id}
                            className="db-past-session"
                            onClick={() => s.status === 'live' && setActiveCode(s.join_code)}
                            style={{ cursor: s.status === 'live' ? 'pointer' : 'default' }}
                          >
                            <span className="db-past-code">{s.join_code}</span>
                            <span className="db-past-name">{s.classroom_name}</span>
                            <span className="db-past-date">
                              {s.status === 'live'
                                ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>● Live</span>
                                : fmtDate(s.closed_at ?? s.created_at)
                              }
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Stats summary */}
              {leaderboard.length > 0 && (
                <div className="db-card">
                  <div className="db-card-head">
                    <span className="db-card-title">Class Summary</span>
                  </div>
                  <div className="db-stats-grid">
                    <div className="db-stat">
                      <div className="db-stat-val">{leaderboard.length}</div>
                      <div className="db-stat-label">Students</div>
                    </div>
                    <div className="db-stat">
                      <div className="db-stat-val">{Math.round(leaderboard.reduce((s, r) => s + r.xp, 0) / leaderboard.length).toLocaleString()}</div>
                      <div className="db-stat-label">Avg XP</div>
                    </div>
                    <div className="db-stat">
                      <div className="db-stat-val">{leaderboard.reduce((s, r) => s + r.drawings_count, 0)}</div>
                      <div className="db-stat-label">Drawings</div>
                    </div>
                    <div className="db-stat">
                      <div className="db-stat-val">{leaderboard.reduce((s, r) => s + r.concepts_mastered, 0)}</div>
                      <div className="db-stat-label">Mastered</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Right column — leaderboard ───────────────────────── */}
            <div className="db-col db-col--right">
              <div className="db-card db-card--full">
                <div className="db-card-head">
                  <span className="db-card-title">Student Leaderboard</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="db-muted">{displayLeaderboard.length} / {leaderboard.length}</span>
                    <input
                      className="db-input"
                      style={{ width: 160, padding: '6px 10px', fontSize: '0.82rem' }}
                      placeholder="Search…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                </div>

                {leaderboard.length === 0 ? (
                  <div className="db-empty" style={{ padding: '32px 0' }}>
                    <div style={{ fontSize: '2rem', marginBottom: 10 }}>📊</div>
                    No progress data yet. Students sync XP when they complete drawings or lessons.
                  </div>
                ) : (
                  <div className="db-leaderboard">
                    <div className="db-lb-head">
                      <SortBtn label="#" k="rank" />
                      <span>Student</span>
                      <span>Level / Progress</span>
                      <SortBtn label="XP" k="xp" />
                      <SortBtn label="Streak" k="streak_days" />
                      <SortBtn label="Badges" k="badge_count" />
                      <SortBtn label="Drawings" k="drawings_count" />
                    </div>
                    <AnimatePresence>
                      {displayLeaderboard.map((s, i) => (
                        <motion.div
                          key={s.student_name}
                          className="db-lb-row"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03 }}
                        >
                          <RankMedal rank={s.rank} />
                          <span className="db-lb-name">{s.student_name}</span>
                          <div className="db-lb-level">
                            <span style={{ fontSize: '0.8rem' }}>{s.level_emoji} Lv.{s.level} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{s.level_name}</span></span>
                            <XPBar xp={s.xp} level={s.level} />
                          </div>
                          <span className="db-lb-xp">{s.xp.toLocaleString()}</span>
                          <span className="db-lb-streak">
                            {s.streak_days > 0 ? `🔥 ${s.streak_days}d` : <span style={{ color: 'var(--muted)' }}>—</span>}
                          </span>
                          <span>{s.badge_count > 0 ? `🏅 ${s.badge_count}` : <span style={{ color: 'var(--muted)' }}>—</span>}</span>
                          <span style={{ color: 'var(--muted)' }}>
                            {s.drawings_count > 0 ? `✏️ ${s.drawings_count}` : '—'}
                          </span>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {displayLeaderboard.length === 0 && search && (
                      <div className="db-empty" style={{ padding: '24px 0' }}>
                        No students match &ldquo;{search}&rdquo;
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </motion.div>
        )}
      </div>
    </main>
  );
}
