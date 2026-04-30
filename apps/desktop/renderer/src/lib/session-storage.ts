/**
 * Session storage — localStorage-backed persistence for user workspaces.
 *
 * A "session" is a workspace: it has its own chat history with the AI tutor,
 * a current prompt, optional code/blocks, and metadata. Sessions are scoped
 * per user (`userName`) so multiple students sharing one machine each get
 * their own list.
 *
 * Sessions auto-persist as the user works. The home screen shows them as
 * "Continue" (most recent) and "Saved" (everything else), and clicking any
 * tile resumes the workspace exactly where it was left.
 */

import type { AgeGroup } from './concept-types';
import type { SceneObject } from './scene-builder';

export type SessionChatMessage = {
  id: string;
  role: 'user' | 'tutor' | 'system';
  text: string;
  ts: number;
};

export type SavedSession = {
  /** Stable id used as the workspace handle for the session lifetime. */
  id: string;
  /** User-given or auto-generated label shown on the home screen. */
  name: string;
  /** Whether the user explicitly named this session (affects "Saved" vs "Recent"). */
  pinned: boolean;
  /** Concept this session was started from (template). null = blank sandbox. */
  conceptId: string | null;
  /** Friendly title for the concept template (cached). */
  conceptTitle: string | null;
  ageGroup: AgeGroup;

  /** Most recent prompt the user composed. */
  prompt: string;
  /** Persisted tutor chat history. */
  chat: SessionChatMessage[];
  /** Optional code editor contents. */
  code?: string;
  /** Optional block editor JSON. */
  blocks?: unknown;
  /** Optional last-rendered SVG snapshot — used as a thumbnail on tiles. */
  thumbnailSvg?: string;
  /** Sandbox course-builder objects placed by the user. */
  sceneObjects?: SceneObject[];
  /** Cumulative time spent in this session, in milliseconds. */
  totalTimeMs?: number;

  createdAt: number;
  lastOpenedAt: number;
};

const STORAGE_VERSION = 1;
const KEY_PREFIX = 'sketchbot.sessions.v' + STORAGE_VERSION + '.';

function storageKey(userName: string): string {
  return KEY_PREFIX + (userName || 'anonymous').toLowerCase();
}

function safeParse(raw: string | null): SavedSession[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is SavedSession =>
      typeof s === 'object' &&
      s !== null &&
      typeof s.id === 'string' &&
      typeof s.name === 'string',
    );
  } catch {
    return [];
  }
}

function readAll(userName: string): SavedSession[] {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(storageKey(userName)));
}

function writeAll(userName: string, sessions: SavedSession[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userName), JSON.stringify(sessions));
  } catch {
    // localStorage full or disabled — silently drop
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Returns sessions sorted by most recently opened first. */
export function listSessions(userName: string): SavedSession[] {
  return readAll(userName).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

/** The session most recently opened — used as the "Continue" tile. */
export function getMostRecent(userName: string): SavedSession | null {
  return listSessions(userName)[0] ?? null;
}

/** Look up a session by id, or null if it doesn't exist. */
export function getSession(userName: string, id: string): SavedSession | null {
  return readAll(userName).find((s) => s.id === id) ?? null;
}

export type CreateSessionInput = {
  conceptId: string | null;
  conceptTitle: string | null;
  ageGroup: AgeGroup;
  prompt?: string;
  /** Optional explicit name. Defaults to conceptTitle or "Sandbox". */
  name?: string;
};

/** Create and persist a new blank session. Returns the new record. */
export function createSession(userName: string, input: CreateSessionInput): SavedSession {
  const now = Date.now();
  const session: SavedSession = {
    id: uuid(),
    name: input.name ?? input.conceptTitle ?? 'Sandbox',
    pinned: false,
    conceptId: input.conceptId,
    conceptTitle: input.conceptTitle,
    ageGroup: input.ageGroup,
    prompt: input.prompt ?? '',
    chat: [],
    createdAt: now,
    lastOpenedAt: now,
  };
  const all = readAll(userName);
  all.push(session);
  writeAll(userName, all);
  return session;
}

/** Update fields on an existing session. Stamps `lastOpenedAt`. */
export function updateSession(
  userName: string,
  id: string,
  patch: Partial<Omit<SavedSession, 'id' | 'createdAt'>>,
): SavedSession | null {
  const all = readAll(userName);
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const next: SavedSession = { ...all[idx]!, ...patch, lastOpenedAt: Date.now() };
  all[idx] = next;
  writeAll(userName, all);
  // Broadcast a save event so UI surfaces (e.g. SaveIndicator) can react.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sketchbot:session-saved', {
      detail: { userName, id, at: next.lastOpenedAt },
    }));
  }
  return next;
}

/** Constant for the global "save now" event — dispatched by manual Save buttons,
 *  consumed by auto-save effects to force an immediate flush. */
export const SAVE_NOW_EVENT = 'sketchbot:save-now';

/** Mark a session as opened — bumps lastOpenedAt without changing other fields. */
export function touchSession(userName: string, id: string): void {
  updateSession(userName, id, {});
}

/** Delete a session permanently. */
export function deleteSession(userName: string, id: string): void {
  const all = readAll(userName).filter((s) => s.id !== id);
  writeAll(userName, all);
}

/** Pin a session with a name — promotes it from "Recent" to "Saved". */
export function pinSession(userName: string, id: string, name: string): SavedSession | null {
  return updateSession(userName, id, { pinned: true, name: name.trim() || 'Saved session' });
}

/** Unpin (rename back to default) — moves it back into Recent. */
export function unpinSession(userName: string, id: string): SavedSession | null {
  const session = getSession(userName, id);
  if (!session) return null;
  return updateSession(userName, id, {
    pinned: false,
    name: session.conceptTitle ?? 'Sandbox',
  });
}

/** Cap the unpinned (recent) list — call periodically to prevent localStorage bloat. */
export function pruneRecent(userName: string, keep = 10): void {
  const all = readAll(userName);
  const pinned = all.filter((s) => s.pinned);
  const recent = all
    .filter((s) => !s.pinned)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, keep);
  writeAll(userName, [...pinned, ...recent]);
}

/** Group sessions for display: pinned (saved) + most-recent + the rest of recent. */
export function groupForHome(userName: string): {
  continueWith: SavedSession | null;
  saved: SavedSession[];
  recent: SavedSession[];
} {
  const all = listSessions(userName);
  const pinned = all.filter((s) => s.pinned);
  const unpinned = all.filter((s) => !s.pinned);
  const [first, ...rest] = unpinned;
  return {
    continueWith: first ?? null,
    saved: pinned,
    recent: rest.slice(0, 5),
  };
}
