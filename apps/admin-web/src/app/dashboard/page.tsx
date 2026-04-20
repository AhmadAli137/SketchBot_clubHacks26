'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SiteHeader } from '@/components/site-header';

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
};

type Participant = {
  id: string;
  student_name: string;
  status: string;
  current_step: number;
  xp_earned: number;
  joined_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_RUNTIME = 'http://localhost:8787';

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [runtimeUrl, setRuntimeUrl] = useState(DEFAULT_RUNTIME);
  const [runtimeInput, setRuntimeInput] = useState(DEFAULT_RUNTIME);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [leaderboard, setLeaderboard] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeCode, setActiveCode] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sessionCodeInput, setSessionCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async (base: string) => {
    try {
      const [lb, myS] = await Promise.all([
        fetch(`${base}/api/progress/leaderboard`, { cache: 'no-store' }),
        fetch(`${base}/api/sessions/my-sessions`, { cache: 'no-store' }),
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
    } catch {
      setReachable(false);
    }
  }, []);

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
    setParticipants([]);
    setActiveCode('');
  };

  const handleCreateSession = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${runtimeUrl}/api/sessions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroom_name: 'My Class' }),
      });
      if (res.ok) {
        const data = await res.json() as { join_code: string };
        setActiveCode(data.join_code);
        await fetchAll(runtimeUrl);
      }
    } catch { /* show error */ }
    setLoading(false);
  };

  const handleLookupSession = async () => {
    const code = sessionCodeInput.trim().toUpperCase();
    if (!code) return;
    const res = await fetch(`${runtimeUrl}/api/sessions/validate/${code}`);
    if (res.ok) {
      const d = await res.json() as { valid: boolean };
      if (d.valid) { setActiveCode(code); setSessionCodeInput(''); }
    }
  };

  const handleEndSession = async () => {
    if (!activeCode) return;
    await fetch(`${runtimeUrl}/api/sessions/close/${activeCode}`, { method: 'POST' });
    setActiveCode('');
    setParticipants([]);
    await fetchAll(runtimeUrl);
  };

  const activeOnline = participants.filter(p => p.status === 'active').length;

  return (
    <>
      <SiteHeader />
      <main className="db-main">
        <div className="db-container">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="db-header">
            <div>
              <h1 className="db-title">Classroom Dashboard</h1>
              <p className="db-subtitle">Live session monitoring · student progress · leaderboard</p>
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
              <span className={`db-status-dot ${reachable === true ? 'online' : reachable === false ? 'offline' : 'pending'}`} />
            </div>
          </div>

          {reachable === false && (
            <div className="db-alert">
              Could not reach the SketchBot desktop runtime at <strong>{runtimeUrl}</strong>.
              Make sure the app is open and try again.
            </div>
          )}

          {reachable === true && (
            <div className="db-grid">

              {/* ── Left column ─────────────────────────────────────── */}
              <div className="db-col db-col--left">

                {/* Active session card */}
                <div className="db-card">
                  <div className="db-card-head">
                    <span className="db-card-title">Live Session</span>
                    {activeCode && (
                      <span className="db-online-badge">{activeOnline} online</span>
                    )}
                  </div>

                  {activeCode ? (
                    <>
                      <div className="db-code-display">
                        <span className="db-code-label">Join Code</span>
                        <span className="db-code-value">{activeCode}</span>
                      </div>

                      <div className="db-participant-list">
                        {participants.length === 0 ? (
                          <p className="db-empty">Waiting for students to join…</p>
                        ) : (
                          participants.map(p => (
                            <div key={p.id} className={`db-participant ${p.status}`}>
                              <div className="db-participant-info">
                                <span className="db-participant-name">{p.student_name}</span>
                                <span className="db-participant-meta">
                                  Step {p.current_step} · {p.xp_earned} XP
                                </span>
                              </div>
                              <div className={`db-dot ${p.status}`} />
                            </div>
                          ))
                        )}
                      </div>

                      <button className="db-btn-danger" onClick={handleEndSession}>
                        End Session
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="db-empty" style={{ marginBottom: 16 }}>No active session.</p>
                      <div className="db-session-actions">
                        <button
                          className="db-btn-primary"
                          onClick={handleCreateSession}
                          disabled={loading}
                        >
                          {loading ? 'Starting…' : 'Start New Session'}
                        </button>
                        <div className="db-lookup-row">
                          <input
                            className="db-input db-input--code"
                            placeholder="Enter code to monitor"
                            value={sessionCodeInput}
                            onChange={e => setSessionCodeInput(e.target.value.toUpperCase())}
                            maxLength={10}
                          />
                          <button className="db-btn-ghost" onClick={handleLookupSession}>Monitor</button>
                        </div>
                      </div>

                      {sessions.length > 0 && (
                        <div className="db-past-sessions">
                          <p className="db-section-label">Recent sessions</p>
                          {sessions.map(s => (
                            <div key={s.id} className="db-past-session" onClick={() => setActiveCode(s.join_code)}>
                              <span className="db-past-code">{s.join_code}</span>
                              <span className="db-past-name">{s.classroom_name}</span>
                              <span className="db-past-date">{fmtDate(s.created_at)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

              </div>

              {/* ── Right column — leaderboard ───────────────────── */}
              <div className="db-col db-col--right">
                <div className="db-card db-card--full">
                  <div className="db-card-head">
                    <span className="db-card-title">Student Leaderboard</span>
                    <span className="db-muted">{leaderboard.length} students</span>
                  </div>

                  {leaderboard.length === 0 ? (
                    <p className="db-empty">
                      No progress data yet. Students sync XP when they complete lessons.
                    </p>
                  ) : (
                    <div className="db-leaderboard">
                      <div className="db-lb-head">
                        <span>#</span>
                        <span>Student</span>
                        <span>Level</span>
                        <span>XP</span>
                        <span>Streak</span>
                        <span>Badges</span>
                        <span>Drawings</span>
                      </div>
                      {leaderboard.map(s => (
                        <div key={s.student_name} className="db-lb-row">
                          <span className="db-lb-rank">#{s.rank}</span>
                          <span className="db-lb-name">{s.student_name}</span>
                          <div className="db-lb-level">
                            <span>{s.level_emoji} Lv.{s.level}</span>
                            <XPBar xp={s.xp} level={s.level} />
                          </div>
                          <span className="db-lb-xp">{s.xp.toLocaleString()}</span>
                          <span className="db-lb-streak">
                            {s.streak_days > 0 ? `🔥 ${s.streak_days}d` : '—'}
                          </span>
                          <span>{s.badge_count}</span>
                          <span>{s.drawings_count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </main>
    </>
  );
}
