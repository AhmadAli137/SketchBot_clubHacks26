const KEY = 'sketchbot-class-session-v1';

export type ClassSession = {
  sessionCode: string;
  sessionId: string;
  participantId: string;
  classroomName: string;
  studentName: string;
  joinedAt: string;
};

export function getClassSession(): ClassSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ClassSession) : null;
  } catch {
    return null;
  }
}

export function setClassSession(s: ClassSession | null): void {
  try {
    if (s) {
      localStorage.setItem(KEY, JSON.stringify(s));
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    // ignore
  }
}
