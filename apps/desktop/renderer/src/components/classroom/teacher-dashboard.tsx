'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, Copy, Check, RefreshCw, X, Lock, Unlock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { Button } from '@/components/ui/button';

type Participant = {
  id: string;
  student_name: string;
  status: string;
  current_step: number;
  xp_earned: number;
  joined_at: string;
};

type ActiveSession = {
  id: string;
  join_code: string;
  classroom_name: string;
  created_at: string;
};

type TeacherDashboardProps = {
  apiBase: string;
  classroomName?: string;
  teacherName?: string;
  onClose: () => void;
};

export function TeacherDashboard({ apiBase, classroomName = 'My Class', teacherName, onClose }: TeacherDashboardProps) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState(false);
  const [locked, setLocked] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshParticipants = useCallback(async (session: ActiveSession) => {
    try {
      const res = await fetch(`${apiBase}/api/sessions/participants/${session.join_code}`);
      if (res.ok) {
        const data = await res.json() as { participants: Participant[] };
        setParticipants(data.participants);
      }
    } catch {
      // network blip
    }
  }, [apiBase]);

  useEffect(() => {
    if (!activeSession) return;
    void refreshParticipants(activeSession);
    const timer = setInterval(() => void refreshParticipants(activeSession), 5_000);
    return () => clearInterval(timer);
  }, [activeSession, refreshParticipants]);

  const handleCreateSession = async () => {
    setError(null);
    setCreating(true);
    try {
      const token = (() => {
        try {
          const raw = localStorage.getItem('sb-session');
          return raw ? (JSON.parse(raw) as { access_token: string }).access_token : null;
        } catch { return null; }
      })();

      const res = await fetch(`${apiBase}/api/sessions/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ classroom_name: classroomName }),
      });
      if (!res.ok) throw new Error('Could not create session');
      const data = await res.json() as ActiveSession & { ok: boolean; session_id?: string };
      setActiveSession({
        id: data.session_id ?? data.id,
        join_code: data.join_code,
        classroom_name: data.classroom_name,
        created_at: data.created_at,
      });
      setParticipants([]);
    } catch {
      setError('Failed to start a session. Make sure the desktop runtime is running.');
    } finally {
      setCreating(false);
    }
  };

  const handleCloseSession = async () => {
    if (!activeSession) return;
    setClosing(true);
    try {
      await fetch(`${apiBase}/api/sessions/close/${activeSession.join_code}`, { method: 'POST' });
    } catch { /* best effort */ }
    setActiveSession(null);
    setParticipants([]);
    setLocked(false);
    setClosing(false);
  };

  const handleToggleLock = async () => {
    if (!activeSession) return;
    const endpoint = locked ? 'unlock' : 'lock';
    try {
      await fetch(`${apiBase}/api/sessions/${endpoint}/${activeSession.join_code}`, { method: 'POST' });
      setLocked((prev) => !prev);
    } catch { /* best effort */ }
  };

  const copyCode = async () => {
    if (!activeSession) return;
    await navigator.clipboard.writeText(activeSession.join_code).catch(() => {});
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1800);
  };

  return (
    <div className="teacher-dash-overlay">
      <motion.div
        className="teacher-dash"
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="teacher-dash-header">
          <div className="teacher-dash-title">
            <Users size={18} />
            Teacher Dashboard
            {teacherName && <span className="teacher-dash-name">— {teacherName}</span>}
          </div>
          <button type="button" className="teacher-dash-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error && <p className="entry-error teacher-dash-error">{error}</p>}

        {!activeSession ? (
          <div className="teacher-dash-empty">
            <p className="teacher-dash-empty-text">
              Start a session to give students a join code for <strong>{classroomName}</strong>.
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={handleCreateSession}
              disabled={creating}
            >
              {creating ? 'Starting…' : 'Start Class Session'}
            </Button>
          </div>
        ) : (
          <>
            <div className="teacher-dash-code-row">
              <div className="teacher-dash-code-label">Join Code</div>
              <div className="teacher-dash-code">{activeSession.join_code}</div>
              <button type="button" className="teacher-dash-copy" onClick={copyCode}>
                {codeCopied ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <button
                type="button"
                className="teacher-dash-refresh"
                onClick={() => void refreshParticipants(activeSession)}
              >
                <RefreshCw size={14} />
              </button>
            </div>

            <div className="teacher-dash-grid-head">
              <span>Student</span>
              <span>Step</span>
              <span>XP</span>
              <span>Status</span>
            </div>

            <div className="teacher-dash-list">
              <AnimatePresence>
                {participants.length === 0 ? (
                  <p className="teacher-dash-waiting">
                    Waiting for students to join… Share the code above.
                  </p>
                ) : (
                  participants.map((p) => (
                    <motion.div
                      key={p.id}
                      className={`teacher-dash-row ${p.status === 'active' ? 'active' : 'away'}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.18 }}
                    >
                      <span className="teacher-dash-student-name">{p.student_name}</span>
                      <span>{p.current_step}</span>
                      <span>{p.xp_earned} XP</span>
                      <span className={`teacher-dash-status-dot ${p.status}`} />
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            <div className="teacher-dash-footer">
              <span className="teacher-dash-count">
                {participants.length} student{participants.length !== 1 ? 's' : ''} online
                {locked && <span className="teacher-dash-locked-badge"> · Locked</span>}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleLock}
                  title={locked ? 'Allow new students to join' : 'Block new joins'}
                >
                  {locked ? <><Unlock size={13} /> Unlock</> : <><Lock size={13} /> Lock</>}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCloseSession}
                  disabled={closing}
                >
                  {closing ? 'Closing…' : 'End Session'}
                </Button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
