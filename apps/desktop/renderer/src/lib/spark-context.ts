/**
 * Spark context — the situational-awareness payload the AI tutor receives.
 *
 * The renderer assembles a SparkContext from:
 *   • the current SceneObject array (what's on the canvas)
 *   • the spark-behavior coordinator's rolling event log + streaks
 *   • session metadata (mode, concept, age group, layer, student name)
 *   • a wallclock anchor for "session duration"
 *
 * `describeContextAsText` renders that into a compact natural-language preamble
 * which is prepended to the per-turn user_text on tutor calls. Designed to be
 * cheap (<600 tokens once stringified) and clear enough for Claude to reason
 * spatially over raw positions.
 *
 * NOTE on privacy: this payload is sent to Anthropic. By design we ship only
 * the child's first name + age range, raw scene positions (not images), and
 * recent in-app actions. No persistent server-side storage of context payloads
 * — see the docs/privacy entry that accompanies the tutor agent rollout.
 */

import type { AgeGroup, ConceptLayer } from './concept-types';
import type { SceneObject } from './scene-builder';
import { GRID_SIZE, STACK_HEIGHT } from './scene-builder';
import { sparkBehavior } from './spark-behavior';
import type { SparkEventDetail } from './spark-events';
import { getProgressSummary } from './progress-store';
import { listSessions, getMostRecent } from './session-storage';
import { getRecentSummaries, summariseInterjections, type SessionSummary, type InterjectionStats } from './spark-memory';

/** Hard caps so the payload stays bounded regardless of how busy the session is. */
const MAX_OBJECTS_IN_CONTEXT = 30;
const MAX_EVENTS_IN_CONTEXT = 15;

export type SparkSessionMode = 'sandbox' | 'concept';

export interface SparkContextSceneObject {
  id: string;
  type: SceneObject['type'];
  /** World metres. Easier for the LLM to reason about than grid units. */
  x: number;
  y: number;
  z: number;
  rotation?: 0 | 90 | 180 | 270;
  color?: string;
  variant?: string;
}

export interface SparkContextEvent {
  kind: SparkEventDetail['kind'];
  secondsAgo: number;
  payload?: Record<string, unknown>;
}

/**
 * Cross-session memory snapshot. Pulled from existing localStorage-backed
 * stores (progress + sessions) — no new persistence layer. Helps Spark
 * sound like he remembers the student between sessions.
 */
export interface SparkContextProfile {
  /** How many sessions this student has had with SaySpark. */
  totalSessions: number;
  /** XP / level — gives the tutor a sense of overall progress. */
  level: number;
  xp: number;
  conceptsStarted: number;
  conceptsMastered: number;
  /** Last 5 badge ids the student has earned (most recent last). */
  recentBadges: string[];
  /** Most-recent saved sessions (capped at 3) — used to recall what they
   *  were last working on. */
  recentSessions: Array<{
    name: string;
    conceptId: string | null;
    daysAgo: number;
  }>;
  /** True if this is the very first session ever. */
  isFirstSession: boolean;
}

export interface SparkContext {
  mode: SparkSessionMode;
  conceptId: string | null;
  conceptTitle: string | null;
  ageGroup: AgeGroup;
  layer: ConceptLayer | null;
  studentFirstName: string;
  /** Seconds since the current session began. */
  sessionDurationSec: number;
  scene: {
    objectCount: number;
    objectsByType: Record<string, number>;
    /** Up to MAX_OBJECTS_IN_CONTEXT — see truncated flag if more exist. */
    objects: SparkContextSceneObject[];
    truncated: boolean;
  };
  events: {
    recent: SparkContextEvent[];
    truncated: boolean;
  };
  streaks: {
    failStreak: number;
    successStreak: number;
  };
  /** Cross-session memory. Optional — null when the student record is
   *  missing or when context is built for a guest user. */
  profile: SparkContextProfile | null;
  /** Last few session reflections written by Spark himself
   *  (Level 1 learning). Empty when no past sessions are summarised yet. */
  recentSessionSummaries: SessionSummary[];
  /** Aggregate of recent Spark interjections — engaged / ignored / declined
   *  counts plus a synopsis suggesting how to adapt style
   *  (Level 2 learning). */
  interjectionStats: InterjectionStats;
  /** Last few chat messages so Spark sees the conversational thread. */
  chatExcerpt: Array<{ role: 'tutor' | 'student'; content: string }>;
  /** What the kid most recently asked the robot to draw. */
  activeDrawingPrompt: string | null;
  /** Path-segment count of the most recent drawing — rough complexity hint. */
  lastPathCount: number | null;
}

export interface BuildSparkContextInput {
  sceneObjects: SceneObject[];
  mode: SparkSessionMode;
  conceptId: string | null;
  conceptTitle: string | null;
  ageGroup: AgeGroup;
  layer: ConceptLayer | null;
  studentFirstName: string;
  /** Full student name as stored in progress / sessions stores — used to
   *  pull cross-session memory. Defaults to studentFirstName when omitted. */
  studentStoreKey?: string;
  /** Last few chat messages (most-recent last) so Spark sees the
   *  conversation he's been part of and can avoid repeating himself. */
  chatExcerpt?: Array<{ role: 'tutor' | 'student'; content: string }>;
  /** What the kid most recently asked the robot to draw, if any. */
  activeDrawingPrompt?: string | null;
  /** Number of path segments in the most recent drawing — gives Spark a
   *  rough sense of complexity. */
  lastPathCount?: number | null;
}

/** Convert a raw SceneObject (grid coords) → the context-shape (world metres). */
function toContextObject(obj: SceneObject): SparkContextSceneObject {
  const rot = obj.rotY === undefined ? undefined : (obj.rotY * 90) as 0 | 90 | 180 | 270;
  return {
    id: obj.id,
    type: obj.type,
    x: round(obj.gx * GRID_SIZE),
    y: round((obj.gy ?? 0) * STACK_HEIGHT),
    z: round(obj.gz * GRID_SIZE),
    ...(rot !== undefined ? { rotation: rot } : {}),
    ...(obj.color ? { color: obj.color } : {}),
    ...(obj.botVariant ? { variant: obj.botVariant } : {}),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build the cross-session profile from existing stores. Returns null when
 * the student isn't tracked yet (first ever launch, guest user, or the
 * progress store hasn't been initialised for this name).
 */
function buildProfile(studentStoreKey: string): SparkContextProfile | null {
  const summary = getProgressSummary(studentStoreKey);
  if (!summary) return null;

  // Pull recent saved sessions; map to a compact form.
  const sessions = listSessions(studentStoreKey).slice(0, 3);
  const now = Date.now();
  const recentSessions = sessions.map((s) => ({
    name: s.name,
    conceptId: s.conceptId ?? null,
    daysAgo: Math.max(0, Math.floor((now - s.lastOpenedAt) / (24 * 60 * 60 * 1000))),
  }));

  // Recent badges — last 5, most recent last. Badge order in the store is
  // already chronological (awardBadge appends).
  const recentBadges = summary.badges.slice(-5);

  // First-session detection — total_sessions counter from progress-store.
  // We treat 0 or 1 as "this is the first session" (the counter increments
  // sometime during/after the session boots).
  const isFirstSession = summary.totalSessions <= 1 && getMostRecent(studentStoreKey) === null;

  return {
    totalSessions: summary.totalSessions,
    level: summary.level,
    xp: summary.xp,
    conceptsStarted: summary.conceptsStarted,
    conceptsMastered: summary.conceptsMastered,
    recentBadges,
    recentSessions,
    isFirstSession,
  };
}

/**
 * Assemble a SparkContext from current renderer state. The behavior
 * coordinator is consulted directly for the event log + streaks — callers
 * don't need to thread those through.
 */
export function buildSparkContext(input: BuildSparkContextInput): SparkContext {
  const now = Date.now();
  const sessionDurationSec = Math.max(0, Math.round((now - sparkBehavior.getSessionStart()) / 1000));

  // Inventory by type
  const byType: Record<string, number> = {};
  for (const o of input.sceneObjects) {
    byType[o.type] = (byType[o.type] ?? 0) + 1;
  }

  // Truncate to keep payload bounded. Keep most-recently-placed (last in list).
  const truncatedScene = input.sceneObjects.length > MAX_OBJECTS_IN_CONTEXT;
  const objects = (truncatedScene
    ? input.sceneObjects.slice(-MAX_OBJECTS_IN_CONTEXT)
    : input.sceneObjects
  ).map(toContextObject);

  // Recent events (most-recent last). The coordinator log already excludes
  // pure idle/active signals.
  const rawEvents = sparkBehavior.getRecentEvents(MAX_EVENTS_IN_CONTEXT * 2); // grab more, may filter
  const truncatedEvents = rawEvents.length > MAX_EVENTS_IN_CONTEXT;
  const recentEvents: SparkContextEvent[] = (truncatedEvents
    ? rawEvents.slice(-MAX_EVENTS_IN_CONTEXT)
    : rawEvents
  ).map((e) => ({
    kind: e.kind,
    secondsAgo: Math.max(0, Math.round((now - e.ts) / 1000)),
    ...(e.payload ? { payload: e.payload } : {}),
  }));

  // Cross-session memory — read-only snapshots from existing stores.
  const storeKey = input.studentStoreKey ?? input.studentFirstName;
  let profile: SparkContextProfile | null = null;
  let recentSessionSummaries: SessionSummary[] = [];
  let interjectionStats: InterjectionStats = {
    total: 0, engaged: 0, ignored: 0, declined: 0, unclear: 0, synopsis: '',
  };
  try {
    profile = buildProfile(storeKey);
    recentSessionSummaries = getRecentSummaries(storeKey, 3);
    interjectionStats = summariseInterjections(storeKey, 7);
  } catch {
    // Store may not be available (SSR, fresh install). Skip silently.
    profile = null;
  }

  return {
    mode: input.mode,
    conceptId: input.conceptId,
    conceptTitle: input.conceptTitle,
    ageGroup: input.ageGroup,
    layer: input.layer,
    studentFirstName: input.studentFirstName,
    sessionDurationSec,
    scene: {
      objectCount: input.sceneObjects.length,
      objectsByType: byType,
      objects,
      truncated: truncatedScene,
    },
    events: {
      recent: recentEvents,
      truncated: truncatedEvents,
    },
    streaks: sparkBehavior.getStreaks(),
    profile,
    recentSessionSummaries,
    interjectionStats,
    chatExcerpt: input.chatExcerpt ?? [],
    activeDrawingPrompt: input.activeDrawingPrompt ?? null,
    lastPathCount: input.lastPathCount ?? null,
  };
}

/**
 * Render a SparkContext as compact natural-language for inclusion in the
 * tutor prompt. Aim: ≤600 tokens stringified, dense with signal, easy for
 * Claude to reason over. Raw positions are kept intact so the model can
 * recognise spatial patterns the renderer didn't pre-compute.
 */
export function describeContextAsText(ctx: SparkContext): string {
  const lines: string[] = [];

  // ── Header — who, where, how long ────────────────────────────────────────
  const modeLabel = ctx.mode === 'sandbox'
    ? 'Sandbox (free build)'
    : `Concept session: ${ctx.conceptTitle ?? ctx.conceptId ?? 'unknown'}` +
      (ctx.layer ? ` (${ctx.layer} layer)` : '');
  lines.push(`Student: ${ctx.studentFirstName} · age group: ${ctx.ageGroup}`);
  lines.push(`Mode: ${modeLabel}`);
  lines.push(`Session duration: ${formatDuration(ctx.sessionDurationSec)}`);

  // ── Cross-session memory — what Spark already knows about this student ──
  if (ctx.profile) {
    const p = ctx.profile;
    lines.push('');
    if (p.isFirstSession) {
      lines.push("History: this is their first session — be welcoming, set the tone.");
    } else {
      const bits: string[] = [];
      bits.push(`Sessions so far: ${p.totalSessions}`);
      bits.push(`Level ${p.level} (${p.xp} XP)`);
      if (p.conceptsStarted > 0) {
        bits.push(`${p.conceptsMastered}/${p.conceptsStarted} concepts mastered`);
      }
      lines.push(`History: ${bits.join(' · ')}.`);

      if (p.recentSessions.length > 0) {
        lines.push('Recent sessions:');
        for (const s of p.recentSessions) {
          const when = s.daysAgo === 0 ? 'today' : s.daysAgo === 1 ? 'yesterday' : `${s.daysAgo} days ago`;
          const where = s.conceptId ? `concept "${s.conceptId}"` : 'sandbox';
          lines.push(`  - ${when}: ${where} (${s.name})`);
        }
      }

      if (p.recentBadges.length > 0) {
        lines.push(`Recent badges earned: ${p.recentBadges.join(', ')}.`);
      }
    }
  }

  // ── Last-time-you reflections (Level 1 learning) ─────────────────────────
  if (ctx.recentSessionSummaries.length > 0) {
    lines.push('');
    lines.push('Notes you wrote about previous sessions (most-recent last):');
    for (const s of ctx.recentSessionSummaries) {
      const when = formatRelativeDays(Date.now() - s.endedAt);
      const tag = s.sentiment && s.sentiment !== 'neutral' ? ` [${s.sentiment}]` : '';
      const concept = s.conceptId ? ` (${s.conceptId})` : ' (sandbox)';
      lines.push(`  - ${when}${concept}${tag}: ${s.summary}`);
      if (s.struggledWith) lines.push(`    struggled with: ${s.struggledWith}`);
      if (s.excelledAt) lines.push(`    did well: ${s.excelledAt}`);
    }
    lines.push("Use these to make the kid feel remembered. Reference them naturally; don't recite them.");
  }

  // ── Active drawing prompt + last path count ──────────────────────────────
  if (ctx.activeDrawingPrompt) {
    lines.push('');
    const promptText = ctx.activeDrawingPrompt.length > 240
      ? ctx.activeDrawingPrompt.slice(0, 237) + '…'
      : ctx.activeDrawingPrompt;
    lines.push(`Active drawing prompt (what the kid asked the robot to draw): "${promptText}"`);
    if (ctx.lastPathCount !== null) {
      lines.push(`The most recent drawing produced ${ctx.lastPathCount} path segment${ctx.lastPathCount === 1 ? '' : 's'}.`);
    }
  }

  // ── Recent chat (so Spark doesn't repeat himself) ────────────────────────
  if (ctx.chatExcerpt.length > 0) {
    lines.push('');
    lines.push('Recent chat (most-recent last):');
    for (const m of ctx.chatExcerpt) {
      const speaker = m.role === 'tutor' ? 'Spark' : 'Student';
      const trimmed = m.content.replace(/\s+/g, ' ').trim();
      const compact = trimmed.length > 220 ? trimmed.slice(0, 217) + '…' : trimmed;
      if (compact) lines.push(`  ${speaker}: ${compact}`);
    }
    lines.push("Don't repeat yourself. If you've already said something, say something different or stay silent.");
  }

  // ── Interjection feedback (Level 2 learning) ─────────────────────────────
  if (ctx.interjectionStats.synopsis) {
    lines.push('');
    lines.push(`Interjection style check: ${ctx.interjectionStats.synopsis}`);
  }

  // ── Scene state ──────────────────────────────────────────────────────────
  lines.push('');
  if (ctx.scene.objectCount === 0) {
    lines.push('Canvas: empty.');
  } else {
    const inv = Object.entries(ctx.scene.objectsByType)
      .map(([type, n]) => `${n} ${type}${n > 1 ? 's' : ''}`)
      .join(', ');
    lines.push(`Canvas: ${ctx.scene.objectCount} object${ctx.scene.objectCount > 1 ? 's' : ''} (${inv}).`);
    lines.push('Object positions (x, y, z in metres):');
    for (const o of ctx.scene.objects) {
      const rot = o.rotation !== undefined ? `, rot=${o.rotation}°` : '';
      const variant = o.variant ? ` [${o.variant}]` : '';
      lines.push(`  - ${o.type}${variant}: (${o.x}, ${o.y}, ${o.z})${rot}`);
    }
    if (ctx.scene.truncated) {
      lines.push(`  …(${ctx.scene.objectCount - ctx.scene.objects.length} more older objects omitted)`);
    }
  }

  // ── Recent activity ──────────────────────────────────────────────────────
  lines.push('');
  if (ctx.events.recent.length === 0) {
    lines.push('Recent activity: none yet this session.');
  } else {
    lines.push('Recent activity (most-recent last):');
    for (const e of ctx.events.recent) {
      const rel = e.secondsAgo < 60
        ? `${e.secondsAgo}s ago`
        : `${Math.floor(e.secondsAgo / 60)}m${e.secondsAgo % 60 ? ` ${e.secondsAgo % 60}s` : ''} ago`;
      const payload = e.payload && Object.keys(e.payload).length
        ? ` ${JSON.stringify(e.payload)}`
        : '';
      lines.push(`  - ${rel}: ${e.kind}${payload}`);
    }
    if (ctx.events.truncated) {
      lines.push('  …(older events omitted)');
    }
  }

  // ── Streaks ──────────────────────────────────────────────────────────────
  if (ctx.streaks.failStreak > 0 || ctx.streaks.successStreak > 0) {
    lines.push('');
    if (ctx.streaks.failStreak > 0) {
      lines.push(`Streak: ${ctx.streaks.failStreak} consecutive failure${ctx.streaks.failStreak > 1 ? 's' : ''}.`);
    }
    if (ctx.streaks.successStreak > 0) {
      lines.push(`Streak: ${ctx.streaks.successStreak} consecutive success${ctx.streaks.successStreak > 1 ? 'es' : ''}.`);
    }
  }

  return lines.join('\n');
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatRelativeDays(ms: number): string {
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  const days = Math.floor(ms / 86_400_000);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
