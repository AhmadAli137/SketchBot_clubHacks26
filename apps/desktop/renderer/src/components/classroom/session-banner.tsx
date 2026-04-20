'use client';

import { useEffect, useRef, useState } from 'react';
import { Users, X } from 'lucide-react';

import { getClassSession, setClassSession } from '@/lib/session-store';
import { getProgressSummary } from '@/lib/progress-store';

type SessionBannerProps = {
  apiBase: string;
  studentName?: string;
  onLeave?: () => void;
};

export function SessionBanner({ apiBase, studentName, onLeave }: SessionBannerProps) {
  const session = getClassSession();
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session) return;

    const tick = async () => {
      const name = studentName ?? session.studentName;
      const summary = name ? getProgressSummary(name) : null;

      try {
        await fetch(`${apiBase}/api/sessions/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participant_id: session.participantId,
            current_step: summary?.conceptsStarted ?? 0,
            xp_earned: summary?.xp ?? 0,
          }),
        });
        const res = await fetch(`${apiBase}/api/sessions/participants/${session.sessionCode}`);
        if (res.ok) {
          const data = await res.json() as { count: number };
          setParticipantCount(data.count);
        }
      } catch {
        // network blip — keep showing banner
      }
    };

    void tick();
    heartbeatRef.current = setInterval(() => void tick(), 15_000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [apiBase, session?.participantId, session?.sessionCode, studentName]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) return null;

  const handleLeave = () => {
    setLeaving(true);
    setClassSession(null);
    onLeave?.();
  };

  return (
    <div className="session-banner">
      <div className="session-banner-dot" aria-hidden />
      <div className="session-banner-info">
        <span className="session-banner-class">{session.classroomName}</span>
        <span className="session-banner-name">— {session.studentName}</span>
        {participantCount !== null && (
          <span className="session-banner-peers">
            <Users size={12} />
            {participantCount} online
          </span>
        )}
      </div>
      <div className="session-banner-code">{session.sessionCode}</div>
      <button
        type="button"
        className="session-banner-leave"
        title="Leave class session"
        disabled={leaving}
        onClick={handleLeave}
      >
        <X size={14} />
      </button>
    </div>
  );
}
