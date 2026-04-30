/**
 * Scene-builder types + helpers.
 *
 * The sandbox course builder lets users place a small library of objects
 * (walls, cones, blocks, waypoints, AprilTags, bot variants) on a grid-snapped
 * floor to build their own mazes / courses. Placed objects persist to the
 * active SavedSession.
 */

export const GRID_SIZE = 0.25;          // metres per grid step
export const STACK_HEIGHT = 0.16;       // metres per stack level (matches block/wall height)
export const ARENA_HALF = 3.0;          // placement zone is ±ARENA_HALF metres

export type SceneObjectType =
  | 'wall'
  | 'cone'
  | 'block'
  | 'sphere'
  | 'cylinder'
  | 'waypoint'
  | 'apriltag'
  | 'bot';

export type BotVariant = 'standard' | 'sumo';

export type SceneObject = {
  id: string;
  type: SceneObjectType;
  /** Grid X position (world metres = gx * GRID_SIZE). */
  gx: number;
  /** Grid Z position. */
  gz: number;
  /** Stack level (0 = floor). World Y = gy * STACK_HEIGHT. */
  gy?: number;
  /** Y rotation in 90° steps. 0 = +X, 1 = +Z, 2 = -X, 3 = -Z. */
  rotY?: 0 | 1 | 2 | 3;
  /** Colour override (waypoint / sphere / cylinder). */
  color?: string;
  /** Only used when type === 'bot'. */
  botVariant?: BotVariant;
};

export type ToolCategory = 'walls' | 'obstacles' | 'markers' | 'bots';

export type ToolDef = {
  /** Stable id used by the rail. May differ from `type` for bot variants. */
  id: string;
  type: SceneObjectType;
  label: string;
  emoji: string;
  category: ToolCategory;
  description: string;
  defaultColor?: string;
  botVariant?: BotVariant;
};

export const TOOLS: ToolDef[] = [
  { id: 'wall',         type: 'wall',     label: 'Wall',     emoji: '🧱', category: 'walls',     description: 'Maze segment, 1 cell long' },
  { id: 'block',        type: 'block',    label: 'Block',    emoji: '🟦', category: 'obstacles', description: 'Stackable cube' },
  { id: 'cone',         type: 'cone',     label: 'Cone',     emoji: '🚧', category: 'obstacles', description: 'Traffic cone obstacle' },
  { id: 'sphere',       type: 'sphere',   label: 'Sphere',   emoji: '⚪', category: 'obstacles', description: 'Round obstacle' },
  { id: 'cylinder',     type: 'cylinder', label: 'Cylinder', emoji: '🥫', category: 'obstacles', description: 'Pillar obstacle' },
  { id: 'waypoint',     type: 'waypoint', label: 'Waypoint', emoji: '📍', category: 'markers',   description: 'Glowing checkpoint', defaultColor: '#4dffb8' },
  { id: 'apriltag',     type: 'apriltag', label: 'AprilTag', emoji: '🏷️', category: 'markers',   description: 'Localization marker' },
  { id: 'bot-standard', type: 'bot',      label: 'Bot',      emoji: '🤖', category: 'bots',      description: 'Standard SketchBot', botVariant: 'standard' },
  { id: 'bot-sumo',     type: 'bot',      label: 'Sumo Bot', emoji: '🥋', category: 'bots',      description: 'Combat-tier sumo bot', botVariant: 'sumo' },
];

export const TOOLS_BY_ID: Record<string, ToolDef> = TOOLS.reduce(
  (acc, t) => { acc[t.id] = t; return acc; },
  {} as Record<string, ToolDef>,
);

export const CATEGORIES: { id: ToolCategory; label: string; emoji: string }[] = [
  { id: 'walls',     label: 'Walls',     emoji: '🧱' },
  { id: 'obstacles', label: 'Obstacles', emoji: '🚧' },
  { id: 'markers',   label: 'Markers',   emoji: '📍' },
  { id: 'bots',      label: 'Bots',      emoji: '🤖' },
];

// ─── Grid helpers ─────────────────────────────────────────────────────────────

export function snapToGrid(meters: number): number {
  return Math.round(meters / GRID_SIZE) * GRID_SIZE;
}

export function worldToGrid(x: number, z: number): { gx: number; gz: number } {
  return { gx: Math.round(x / GRID_SIZE), gz: Math.round(z / GRID_SIZE) };
}

export function gridToWorld(obj: { gx: number; gz: number; gy?: number }): { x: number; y: number; z: number } {
  return {
    x: obj.gx * GRID_SIZE,
    y: (obj.gy ?? 0) * STACK_HEIGHT,
    z: obj.gz * GRID_SIZE,
  };
}

export function rotationToRadians(rotY: 0 | 1 | 2 | 3 = 0): number {
  return rotY * Math.PI / 2;
}

export function newSceneObjectId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'so-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function clampToArena(gx: number, gz: number): { gx: number; gz: number } {
  const max = Math.floor(ARENA_HALF / GRID_SIZE);
  return {
    gx: Math.max(-max, Math.min(max, gx)),
    gz: Math.max(-max, Math.min(max, gz)),
  };
}

/** Construct a fresh SceneObject at the given grid cell using the tool's defaults. */
export function makeObjectFromTool(
  tool: ToolDef,
  gx: number,
  gz: number,
  gy: number = 0,
): SceneObject {
  return {
    id: newSceneObjectId(),
    type: tool.type,
    gx,
    gz,
    gy,
    rotY: 0,
    color: tool.defaultColor,
    botVariant: tool.botVariant,
  };
}

// ─── User templates (saved courses) ───────────────────────────────────────────

export type UserTemplate = {
  id: string;
  name: string;
  sceneObjects: SceneObject[];
  createdAt: number;
};

const TEMPLATES_KEY_PREFIX = 'sketchbot.templates.v1.';

function templatesKey(userName: string): string {
  return TEMPLATES_KEY_PREFIX + (userName || 'anonymous').toLowerCase();
}

function readTemplates(userName: string): UserTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(templatesKey(userName));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is UserTemplate =>
      typeof t === 'object' && t !== null && typeof t.id === 'string' && Array.isArray(t.sceneObjects),
    );
  } catch {
    return [];
  }
}

function writeTemplates(userName: string, templates: UserTemplate[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(templatesKey(userName), JSON.stringify(templates));
  } catch {
    // localStorage full or disabled
  }
}

/** Most-recent first. */
export function listUserTemplates(userName: string): UserTemplate[] {
  return readTemplates(userName).sort((a, b) => b.createdAt - a.createdAt);
}

export function saveUserTemplate(
  userName: string,
  name: string,
  sceneObjects: SceneObject[],
): UserTemplate {
  const tpl: UserTemplate = {
    id: newSceneObjectId(),
    name: name.trim() || 'Untitled course',
    // Deep-clone with fresh ids so re-using a template doesn't share refs
    sceneObjects: sceneObjects.map((o) => ({ ...o, id: newSceneObjectId() })),
    createdAt: Date.now(),
  };
  writeTemplates(userName, [tpl, ...readTemplates(userName)]);
  return tpl;
}

export function deleteUserTemplate(userName: string, id: string): void {
  writeTemplates(userName, readTemplates(userName).filter((t) => t.id !== id));
}

/** Clone a template's objects with fresh ids — call when seeding a new session. */
export function cloneTemplateObjects(template: UserTemplate): SceneObject[] {
  return template.sceneObjects.map((o) => ({ ...o, id: newSceneObjectId() }));
}
