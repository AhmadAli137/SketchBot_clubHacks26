'use client';

/**
 * Spark agent tool registry — the only set of actions Spark can request to
 * perform on the renderer side. Defined here (not in the backend) so the
 * client always controls what's actually possible — adding a new tool can't
 * happen without shipping a renderer build.
 *
 * Hybrid agency model:
 *   • `kind: 'annotative'`  → executed immediately (highlight, award xp, point)
 *   • `kind: 'mutative'`    → surfaced to the student as "Spark wants to ...
 *                             OK?" and only run on explicit yes
 *
 * The backend (services/local-runtime/app/services/tutor_service.py) sees
 * the tool *schema* below and may return a `tool_request` alongside the
 * usual `{ speak, message }` payload. The renderer dispatches it via
 * `executeTool` (or surfaces a confirmation first). On confirmation
 * outcome the renderer can optionally POST a follow-up so the agent
 * knows what happened.
 */

export type SparkToolKind = 'annotative' | 'mutative';

export interface SparkToolSchemaProperty {
  type: 'string' | 'number' | 'boolean';
  description: string;
  enum?: string[];
}

export interface SparkToolSchema {
  /** Stable id used by the backend & dispatcher. */
  id: string;
  /** Whether this tool needs student confirmation before running. */
  kind: SparkToolKind;
  /** Short label shown in the confirmation UI for mutative tools. */
  label: string;
  /** What Claude sees as the tool's description — guides when it's chosen. */
  description: string;
  /** JSON-schema-style input description Claude can populate. */
  input_schema: {
    type: 'object';
    properties: Record<string, SparkToolSchemaProperty>;
    required?: string[];
  };
}

export interface SparkToolRequest {
  id: string;
  /** Whatever input arguments Claude provided — validated by the dispatcher. */
  input: Record<string, unknown>;
  /** Optional human-readable reason from the model (helps confirmation UX). */
  reason?: string;
}

/**
 * Result the dispatcher returns. Used by the optional follow-up POST so the
 * agent learns whether the action succeeded.
 */
export interface SparkToolResult {
  ok: boolean;
  /** When false, why it didn't happen. */
  message?: string;
  /** Returned data the agent might use ("highlighted object id X"). */
  data?: Record<string, unknown>;
}

// ─── The tool registry ──────────────────────────────────────────────────────

export const SPARK_TOOLS: SparkToolSchema[] = [
  {
    id: 'highlight_object',
    kind: 'annotative',
    label: 'Highlight an object',
    description:
      "Briefly highlight a single object on the canvas to draw the student's attention to it. " +
      "Use when you want to point at something they built and discuss it. Doesn't modify the scene.",
    input_schema: {
      type: 'object',
      properties: {
        object_id: { type: 'string', description: 'Id of the SceneObject to highlight.' },
        reason: { type: 'string', description: 'Short note shown to the student about why.' },
      },
      required: ['object_id'],
    },
  },
  {
    id: 'award_xp',
    kind: 'annotative',
    label: 'Award XP',
    description:
      'Give the student a small XP boost for a genuinely creative move or visible effort. Use sparingly — ' +
      'no more than a few times per session — so it stays meaningful. Always give a reason.',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'XP amount; pick from 5, 10, or 25.' },
        reason: { type: 'string', description: 'One-sentence reason shown to the student.' },
      },
      required: ['amount', 'reason'],
    },
  },
  {
    id: 'add_demo_object',
    kind: 'mutative',
    label: 'Place a demo object',
    description:
      'Drop a demonstration object onto the canvas to show the student what you mean. ' +
      "Use when describing alone isn't clear — for example, 'let me show you how to make an opening here'. " +
      'Mutates the scene; will require explicit student confirmation before running.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['wall', 'cone', 'block', 'sphere', 'cylinder', 'waypoint'],
          description: 'The object type to place.',
        },
        x: { type: 'number', description: 'World X in metres.' },
        z: { type: 'number', description: 'World Z in metres.' },
        reason: { type: 'string', description: "What this demo is meant to teach." },
      },
      required: ['type', 'x', 'z'],
    },
  },
];

export function getToolSchema(id: string): SparkToolSchema | undefined {
  return SPARK_TOOLS.find((t) => t.id === id);
}

export function isMutativeTool(id: string): boolean {
  return getToolSchema(id)?.kind === 'mutative';
}

// ─── Dispatcher contract ─────────────────────────────────────────────────────

/**
 * The renderer mounts a SparkToolDispatcher (component) which subscribes to
 * tool requests and either executes annotative tools immediately or shows
 * a confirmation prompt for mutative ones. See spark-tool-dispatcher.tsx.
 */
const TOOL_REQUEST_EVENT = 'sketchbot:spark-tool-request';

export function emitToolRequest(req: SparkToolRequest): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SparkToolRequest>(TOOL_REQUEST_EVENT, { detail: req }));
}

export function onToolRequest(handler: (req: SparkToolRequest) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<SparkToolRequest>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(TOOL_REQUEST_EVENT, listener);
  return () => window.removeEventListener(TOOL_REQUEST_EVENT, listener);
}
