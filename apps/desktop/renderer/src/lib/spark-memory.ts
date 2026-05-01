'use client';

/**
 * Spark long-term memory — per-student persistence for two kinds of
 * "learns from interactions" signal that don't require model fine-tuning:
 *
 *   1. Session summaries  (Level 1) — Spark writes a short reflection at
 *      the end of each session so future sessions feel remembered.
 *   2. Interjection outcomes (Level 2) — every time Spark speaks or uses
 *      a tool, we capture whether the kid engaged afterward. Surfaced in
 *      the next observation tick's prompt as "last 5 interjections were
 *      mostly ignored" so the agent can adapt its style.
 *
 * Both stay local (localStorage). Send-on-the-wire is limited to:
 *   • the natural-language summary text (forwarded once per session opener)
 *   • a short feedback synopsis ("3 of last 5 interjections ignored")
 * which sits inside the existing situational-awareness preamble. No raw
 * outcome history leaves the device.
 */

const STORAGE_KEY = 'sketchbot.spark-memory.v1';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionSummary {
  /** SavedSession id, when one was active. May be null for ad-hoc sessions. */
  sessionId: string | null;
  conceptId: string | null;
  durationSec: number;
  endedAt: number;
  /** 1–3 sentence natural-language reflection. */
  summary: string;
  struggledWith?: string;
  excelledAt?: string;
  sentiment?: 'positive' | 'neutral' | 'frustrated';
}

export type InterjectionType = 'speak' | 'highlight' | 'demo' | 'xp';
export type InterjectionOutcome = 'engaged' | 'ignored' | 'declined' | 'unclear';

export interface InterjectionRecord {
  id: string;
  ts: number;
  type: InterjectionType;
  /** Trimmed content / tool-id snapshot — short, for context only. */
  preview: string;
  outcome: InterjectionOutcome;
  resolvedAt?: number;
}

interface Store {
  /** key = full studentName as stored elsewhere (e.g., progress-store key). */
  students: Record<string, StudentMemory>;
}

interface StudentMemory {
  /** Most-recent summaries last. Capped at MAX_SUMMARIES. */
  summaries: SessionSummary[];
  /** Most-recent interjections last. Capped at MAX_INTERJECTIONS. */
  interjections: InterjectionRecord[];
}

const MAX_SUMMARIES = 8;
const MAX_INTERJECTIONS = 50;

// ─── Read / write ────────────────────────────────────────────────────────────

function read(): Store {
  if (typeof window === 'undefined') return { students: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { students: {} };
    const parsed = JSON.parse(raw) as Partial<Store>;
    return { students: parsed.students ?? {} };
  } catch {
    return { students: {} };
  }
}

function write(store: Store): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded — drop the oldest student's history to recover. Cheap
    // safety net rather than a sophisticated LRU.
    try {
      const names = Object.keys(store.students);
      if (names.length > 1) {
        delete store.students[names[0]!];
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      }
    } catch { /* give up — non-fatal */ }
  }
}

function ensure(store: Store, name: string): StudentMemory {
  if (!store.students[name]) {
    store.students[name] = { summaries: [], interjections: [] };
  }
  return store.students[name]!;
}

// ─── Session summaries (Level 1) ─────────────────────────────────────────────

export function appendSessionSummary(studentName: string, summary: SessionSummary): void {
  if (!studentName) return;
  const store = read();
  const m = ensure(store, studentName);
  m.summaries.push(summary);
  if (m.summaries.length > MAX_SUMMARIES) {
    m.summaries.splice(0, m.summaries.length - MAX_SUMMARIES);
  }
  write(store);
}

export function getRecentSummaries(studentName: string, n = 3): SessionSummary[] {
  if (!studentName) return [];
  const store = read();
  const m = store.students[studentName];
  if (!m) return [];
  return m.summaries.slice(-n);
}

// ─── Interjection outcomes (Level 2) ─────────────────────────────────────────

export function recordInterjection(studentName: string, type: InterjectionType, preview: string): string {
  if (!studentName) return '';
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const store = read();
  const m = ensure(store, studentName);
  m.interjections.push({
    id,
    ts: Date.now(),
    type,
    preview: preview.slice(0, 80),
    outcome: 'unclear', // resolved later by the watcher / tool dispatcher
  });
  if (m.interjections.length > MAX_INTERJECTIONS) {
    m.interjections.splice(0, m.interjections.length - MAX_INTERJECTIONS);
  }
  write(store);
  return id;
}

export function markInterjectionOutcome(
  studentName: string,
  id: string,
  outcome: InterjectionOutcome,
): void {
  if (!studentName || !id) return;
  const store = read();
  const m = store.students[studentName];
  if (!m) return;
  const rec = m.interjections.find((r) => r.id === id);
  if (!rec) return;
  // Don't overwrite a stronger outcome ("engaged" / "declined") with a
  // softer one ("unclear") that might fire from a different code path.
  if (rec.outcome !== 'unclear' && outcome === 'unclear') return;
  rec.outcome = outcome;
  rec.resolvedAt = Date.now();
  write(store);
}

export function getRecentInterjections(studentName: string, n = 10): InterjectionRecord[] {
  if (!studentName) return [];
  const store = read();
  const m = store.students[studentName];
  if (!m) return [];
  return m.interjections.slice(-n);
}

// ─── Aggregate views (used by spark-context) ─────────────────────────────────

export interface InterjectionStats {
  total: number;
  engaged: number;
  ignored: number;
  declined: number;
  unclear: number;
  /** Compact synopsis for the agent prompt. Empty when no data. */
  synopsis: string;
}

export function summariseInterjections(studentName: string, n = 7): InterjectionStats {
  const recent = getRecentInterjections(studentName, n);
  const stats: InterjectionStats = {
    total: recent.length,
    engaged: 0, ignored: 0, declined: 0, unclear: 0,
    synopsis: '',
  };
  for (const r of recent) {
    if (r.outcome === 'engaged') stats.engaged += 1;
    else if (r.outcome === 'ignored') stats.ignored += 1;
    else if (r.outcome === 'declined') stats.declined += 1;
    else stats.unclear += 1;
  }
  if (stats.total === 0) return stats;
  const parts: string[] = [];
  if (stats.engaged) parts.push(`${stats.engaged} engaged`);
  if (stats.ignored) parts.push(`${stats.ignored} ignored`);
  if (stats.declined) parts.push(`${stats.declined} declined`);
  if (stats.unclear) parts.push(`${stats.unclear} unclear`);
  stats.synopsis =
    `Last ${stats.total} interjection${stats.total > 1 ? 's' : ''}: ${parts.join(', ')}.`;
  // Add a hint when the kid is clearly tuning out — this is the value of
  // capturing outcomes at all.
  if (stats.ignored / stats.total >= 0.6) {
    stats.synopsis += ' Recent style is being tuned out — try a short question rather than a statement, or stay silent.';
  } else if (stats.engaged / stats.total >= 0.6) {
    stats.synopsis += ' Recent style is landing — keep the same energy.';
  }
  return stats;
}

export function clearStudentMemory(studentName: string): void {
  if (!studentName) return;
  const store = read();
  if (store.students[studentName]) {
    delete store.students[studentName];
    write(store);
  }
}
