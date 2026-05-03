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
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
  /** For type: 'object' — nested property definitions. */
  properties?: Record<string, SparkToolSchemaProperty>;
  /** For type: 'object' — required nested keys. */
  required?: string[];
  /** For type: 'array' — element schema. */
  items?: SparkToolSchemaProperty;
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
    id: 'program_append_block',
    kind: 'annotative',
    label: 'Add a step to the program',
    description:
      "Append one block to the kid's current program in the Programming tab. " +
      "Use whenever the kid says a rule like 'move forward 12 inches' or 'turn left 90 degrees' " +
      "or 'if the ultrasonic reads less than 20 cm, stop'. The block must follow the program-schema " +
      "shape — kind is one of: motor.set, motor.until, turn, drive, wait, if, loop, stop. " +
      "Speed is normalised 0–100. Distances carry their unit (cm | in | m). Always provide a fresh, " +
      "unique block id. Annotative — the block appears immediately so the kid sees their words " +
      "land as a visual step.",
    input_schema: {
      type: 'object',
      properties: {
        block: {
          type: 'object',
          description: "The ProgramBlock to append. Shape mirrors lib/program-schema.ts.",
          properties: {
            id:        { type: 'string', description: "Unique stable id for the block." },
            kind:      { type: 'string', enum: ['motor.set','motor.until','turn','drive','wait','if','loop','stop'], description: "Block kind." },
            side:      { type: 'string', enum: ['left','right','both'], description: "For motor.set / motor.until — which motor side." },
            speed:     { type: 'number', description: "Normalised −100..100 motor speed." },
            seconds:   { type: 'number', description: "Duration in seconds for motor.set / wait." },
            degrees:   { type: 'number', description: "For turn — degrees CCW (negative = CW)." },
            distance:  {
              type: 'object',
              description: "For drive / travelled — { value, unit }. Unit is cm | in | m.",
              properties: {
                value: { type: 'number', description: "Numeric value." },
                unit:  { type: 'string', enum: ['cm','in','m'], description: "Length unit." },
              },
              required: ['value','unit'],
            },
            condition: {
              type: 'object',
              description: "For motor.until / if / loop.until — sensor or time condition.",
              properties: {
                kind:      { type: 'string', enum: ['distance.lt','distance.gt','travelled','elapsed'], description: "Condition kind." },
                sensor:    { type: 'string', enum: ['ultrasonic'], description: "For distance conditions." },
                threshold: {
                  type: 'object',
                  description: "Length threshold for distance conditions.",
                  properties: {
                    value: { type: 'number', description: "Numeric value." },
                    unit:  { type: 'string', enum: ['cm','in','m'], description: "Length unit." },
                  },
                  required: ['value','unit'],
                },
                seconds: { type: 'number', description: "For elapsed condition — seconds." },
              },
              required: ['kind'],
            },
            // Recursive bodies omitted from JSON schema here — Claude generates
            // them as nested arrays and our assertProgramBlock validator catches
            // any malformed shapes before they hit the executor.
          },
          required: ['id','kind'],
        },
      },
      required: ['block'],
    },
  },
  {
    id: 'program_run',
    kind: 'mutative',
    label: 'Run the program',
    description:
      "Execute the current program against the active bot in the simulator. " +
      "Mutative — the kid sees a confirmation prompt first because the bot will " +
      "actually move. Use after the kid says 'run it' or 'try it now', not on " +
      "every block append.",
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: "What you're about to run, in one sentence." },
      },
    },
  },
  {
    id: 'program_clear',
    kind: 'mutative',
    label: 'Clear the program',
    description:
      "Remove every block from the program — start over. Use when the kid says " +
      "'reset' or 'start fresh'. Mutative — confirm before running so the kid " +
      "doesn't lose work to a misheard word.",
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: "Why you're clearing." },
      },
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
