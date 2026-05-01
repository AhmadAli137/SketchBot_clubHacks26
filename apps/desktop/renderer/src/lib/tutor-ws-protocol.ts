/**
 * Tutor WebSocket protocol — shared message types between renderer and
 * cloud backend. Mirror of services/cloud-backend/app/services/tutor_agent.py
 * constants. Keep them in sync; the wire is the contract.
 */

// ─── Message-type constants ──────────────────────────────────────────────────

// Client → server
export const MSG_HELLO = 'hello';
export const MSG_EVENT = 'event';
export const MSG_CONTEXT = 'context';
export const MSG_CHAT = 'chat';
export const MSG_TOOL_RESULT = 'tool_result';
export const MSG_PING = 'ping';

// Server → client
export const MSG_WELCOME = 'welcome';
export const MSG_SPEAK = 'speak';
export const MSG_TOOL_CALL = 'tool_call';
export const MSG_THINKING = 'thinking';
export const MSG_PONG = 'pong';
export const MSG_RESTART = 'restart';
export const MSG_ERROR = 'error';

// ─── Outbound (renderer → backend) ───────────────────────────────────────────

export interface HelloMessage {
  type: typeof MSG_HELLO;
  /** Supabase access token. WebSocket can't easily set Authorization
   *  headers, so we send it in the first message and validate server-side. */
  token: string;
  session_id: string;
  student_name: string;
  age_group: string;
  actor_role: 'student' | 'teacher';
  concept_id: string | null;
  layer: string;
}

export interface EventMessage {
  type: typeof MSG_EVENT;
  kind: string;
  payload?: Record<string, unknown>;
  /** Wallclock millis when emitted on the renderer. */
  ts: number;
}

export interface ContextMessage {
  type: typeof MSG_CONTEXT;
  /** Pre-rendered situational-awareness preamble (the same text the
   *  legacy /observe path was sending). The agent uses this as the
   *  context_text for its next reasoning pass. */
  context_text: string;
}

export interface ChatMessage {
  type: typeof MSG_CHAT;
  text: string;
}

export interface ToolResultMessage {
  type: typeof MSG_TOOL_RESULT;
  tool_id: string;
  ok: boolean;
  data?: Record<string, unknown>;
  message?: string;
}

export interface PingMessage {
  type: typeof MSG_PING;
}

export type ClientMessage =
  | HelloMessage
  | EventMessage
  | ContextMessage
  | ChatMessage
  | ToolResultMessage
  | PingMessage;

// ─── Inbound (backend → renderer) ────────────────────────────────────────────

export interface WelcomeMessage {
  type: typeof MSG_WELCOME;
  agent_id: string;
  /** True when the server reattached to an existing in-memory agent
   *  for our session_id (reconnection within the grace window). */
  resumed: boolean;
  server_time: number;
}

export interface SpeakMessage {
  type: typeof MSG_SPEAK;
  /** Stable id for the utterance — used by the renderer for dedupe and
   *  outcome correlation in spark-memory. */
  id: string;
  message: string;
  /** Optional scene id hint for the face-mode renderer. */
  scene_hint?: number;
}

export interface ToolCallMessage {
  type: typeof MSG_TOOL_CALL;
  /** Stable id; renderer echoes it back in the matching tool_result. */
  id: string;
  tool_id: string;
  input: Record<string, unknown>;
  reason?: string;
}

export interface ThinkingMessage {
  type: typeof MSG_THINKING;
  status: string;
}

export interface PongMessage {
  type: typeof MSG_PONG;
  ts: number;
}

export interface RestartMessage {
  type: typeof MSG_RESTART;
  reason: string;
  reconnect_in_ms: number;
}

export interface ErrorMessage {
  type: typeof MSG_ERROR;
  code: string;
  message: string;
}

export type ServerMessage =
  | WelcomeMessage
  | SpeakMessage
  | ToolCallMessage
  | ThinkingMessage
  | PongMessage
  | RestartMessage
  | ErrorMessage;

// ─── Type guard helpers ──────────────────────────────────────────────────────

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!value || typeof value !== 'object') return false;
  const t = (value as { type?: unknown }).type;
  return typeof t === 'string';
}
