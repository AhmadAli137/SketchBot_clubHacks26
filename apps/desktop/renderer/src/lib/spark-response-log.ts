'use client';

/**
 * Spark response log — local-only telemetry of every observation tick's
 * outcome, indexed by a structured context signature.
 *
 * Intent: collect (context, response) pairs across real sessions so that
 * future versions can mine frequent patterns and ship a hard-coded
 * fast-path for the top N — bypassing Anthropic for common cases. We
 * deliberately do NOT enforce any of those patterns yet; v1 is just
 * data collection so we have evidence before optimising.
 *
 * Privacy posture: 100% local. localStorage-backed, capped, never sent
 * to a server in the current code paths. The review path is a DevTools
 * snippet — see the bottom of this file.
 */

const STORAGE_KEY = 'sketchbot.spark-response-log.v1';
const MAX_ENTRIES = 500;

// ─── Schema ──────────────────────────────────────────────────────────────────

export interface SparkContextSignature {
  mode: 'sandbox' | 'concept';
  conceptId: string | null;
  ageGroup: string;
  layer: string | null;
  objectCount: number;
  /** Distinct types present, alphabetically sorted (so signatures are stable). */
  objectTypes: string[];
  /** Last few event kinds, chronological (oldest → newest). */
  recentEventKinds: string[];
  failStreak: number;
  successStreak: number;
  /** Coarse session-duration bucket so signatures don't fragment per-second. */
  sessionDurationBucket: 'opening' | 'short' | 'medium' | 'long';
}

export interface SparkResponseLogEntry {
  /** Stable id; mirrors the interjection id from spark-memory when one
   *  exists, so joins between the two stores are possible. Otherwise a
   *  fresh random id. */
  id: string;
  ts: number;
  studentName: string;
  context: SparkContextSignature;
  outcome: {
    speak: boolean;
    message: string;
    tool: { id: string; reason?: string } | null;
    nextCheckSec: number | null;
  };
  /** Filled in later when the interjection tracker resolves engagement. */
  studentResponse?: 'engaged' | 'ignored' | 'declined' | 'unclear';
}

export interface AppendInput {
  studentName: string;
  context: SparkContextSignature;
  outcome: SparkResponseLogEntry['outcome'];
  /** Optional id (e.g., interjection id) so callers can correlate later. */
  id?: string;
}

// ─── Read / write ────────────────────────────────────────────────────────────

function read(): SparkResponseLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: SparkResponseLogEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded — drop oldest 100 entries and try again.
    try {
      const trimmed = entries.slice(-Math.max(50, MAX_ENTRIES - 100));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch { /* give up — non-fatal */ }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Append a new observation outcome. Returns the entry id so callers can
 * correlate later (e.g., for resolving the studentResponse field after a
 * 60s engagement window).
 */
export function appendResponseLog(input: AppendInput): string {
  const id = input.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: SparkResponseLogEntry = {
    id,
    ts: Date.now(),
    studentName: input.studentName,
    context: input.context,
    outcome: input.outcome,
  };
  const all = read();
  all.push(entry);
  // Hard cap: keep most-recent MAX_ENTRIES.
  if (all.length > MAX_ENTRIES) all.splice(0, all.length - MAX_ENTRIES);
  write(all);
  return id;
}

/** Update an entry's studentResponse once the interjection tracker resolves. */
export function setResponseOutcome(
  id: string,
  outcome: 'engaged' | 'ignored' | 'declined' | 'unclear',
): void {
  const all = read();
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx]!, studentResponse: outcome };
  write(all);
}

export function getResponseLog(limit?: number): SparkResponseLogEntry[] {
  const all = read();
  return limit === undefined ? all : all.slice(-limit);
}

export function clearResponseLog(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

// ─── Helpers for callers ─────────────────────────────────────────────────────

export function bucketSessionDuration(seconds: number): SparkContextSignature['sessionDurationBucket'] {
  if (seconds < 30) return 'opening';
  if (seconds < 180) return 'short';   // <3 min
  if (seconds < 600) return 'medium';  // <10 min
  return 'long';
}

/**
 * DevTools review snippet — paste in the Electron renderer console:
 *
 *   const log = JSON.parse(localStorage.getItem('sketchbot.spark-response-log.v1') || '[]');
 *   console.log(`Total: ${log.length}`);
 *   const spoken = log.filter(e => e.outcome.speak);
 *   console.log(`Spoken: ${spoken.length} | Tool: ${log.filter(e => e.outcome.tool).length}`);
 *   const byMsg = {};
 *   spoken.forEach(e => { byMsg[e.outcome.message] = (byMsg[e.outcome.message] || 0) + 1; });
 *   console.log('Top 20 phrasings:');
 *   console.table(Object.entries(byMsg).sort((a,b) => b[1]-a[1]).slice(0,20).map(([msg,n]) => ({n, msg})));
 *
 * For frequent context→response patterns:
 *   const sigKey = c => `${c.mode}|${c.objectCount}|${c.objectTypes.join(',')}|${c.recentEventKinds.slice(-3).join(',')}`;
 *   const buckets = {};
 *   spoken.forEach(e => {
 *     const k = sigKey(e.context);
 *     (buckets[k] ||= []).push(e.outcome.message);
 *   });
 *   const top = Object.entries(buckets).filter(([,arr]) => arr.length >= 3).sort((a,b) => b[1].length - a[1].length).slice(0,10);
 *   top.forEach(([k,arr]) => { console.group(k); console.log(arr); console.groupEnd(); });
 *
 * The second snippet shows you "context signatures that came up >=3 times
 * and what Spark said each time" — that's exactly the input you need to
 * decide which patterns are worth hard-coding.
 */
