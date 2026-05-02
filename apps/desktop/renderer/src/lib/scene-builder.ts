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
/** Soft placement bound — large enough to feel infinite, small enough to keep
 *  numbers sane (200 m square = 800 cells per side). */
export const ARENA_HALF = 100.0;

export type SceneObjectType =
  | 'wall'
  | 'cone'
  | 'block'
  | 'sphere'
  | 'cylinder'
  | 'waypoint'
  | 'apriltag'
  | 'bot'
  | 'mat'
  | 'studio-light';

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

export type ToolCategory = 'surfaces' | 'walls' | 'obstacles' | 'markers' | 'bots' | 'lights';

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
  { id: 'mat',          type: 'mat',      label: 'Playmat',  emoji: '🟣', category: 'surfaces',  description: 'Glowing stage mat — defines a play area', defaultColor: '#a855f7' },
  { id: 'wall',         type: 'wall',     label: 'Wall',     emoji: '🧱', category: 'walls',     description: 'Maze segment, 1 cell long' },
  { id: 'block',        type: 'block',    label: 'Block',    emoji: '🟦', category: 'obstacles', description: 'Stackable cube' },
  { id: 'cone',         type: 'cone',     label: 'Cone',     emoji: '🚧', category: 'obstacles', description: 'Traffic cone obstacle' },
  { id: 'sphere',       type: 'sphere',   label: 'Sphere',   emoji: '⚪', category: 'obstacles', description: 'Round obstacle' },
  { id: 'cylinder',     type: 'cylinder', label: 'Cylinder', emoji: '🥫', category: 'obstacles', description: 'Pillar obstacle' },
  { id: 'waypoint',     type: 'waypoint', label: 'Waypoint', emoji: '📍', category: 'markers',   description: 'Glowing checkpoint', defaultColor: '#4dffb8' },
  { id: 'apriltag',     type: 'apriltag', label: 'AprilTag', emoji: '🏷️', category: 'markers',   description: 'Localization marker' },
  { id: 'bot-standard', type: 'bot',      label: 'Bot',      emoji: '🤖', category: 'bots',      description: 'Standard SketchBot', botVariant: 'standard' },
  { id: 'bot-sumo',     type: 'bot',      label: 'Sumo Bot', emoji: '🥋', category: 'bots',      description: 'Combat-tier sumo bot', botVariant: 'sumo' },
  { id: 'studio-light', type: 'studio-light', label: 'Studio Light', emoji: '💡', category: 'lights', description: 'Studio softbox stand — aims its beam at the build' },
];

export const TOOLS_BY_ID: Record<string, ToolDef> = TOOLS.reduce(
  (acc, t) => { acc[t.id] = t; return acc; },
  {} as Record<string, ToolDef>,
);

export const CATEGORIES: { id: ToolCategory; label: string; emoji: string }[] = [
  { id: 'surfaces',  label: 'Surfaces',  emoji: '🟣' },
  { id: 'walls',     label: 'Walls',     emoji: '🧱' },
  { id: 'obstacles', label: 'Obstacles', emoji: '🚧' },
  { id: 'markers',   label: 'Markers',   emoji: '📍' },
  { id: 'bots',      label: 'Bots',      emoji: '🤖' },
  { id: 'lights',    label: 'Lights',    emoji: '💡' },
];

// ─── Grid helpers ─────────────────────────────────────────────────────────────

export function snapToGrid(meters: number): number {
  return Math.round(meters / GRID_SIZE) * GRID_SIZE;
}

export function worldToGrid(x: number, z: number): { gx: number; gz: number } {
  return { gx: Math.round(x / GRID_SIZE), gz: Math.round(z / GRID_SIZE) };
}

/** Same as worldToGrid but without rounding — returns float grid units.
 *  Used for free-placement props (everything except walls) so the object
 *  lands exactly where the cursor is, instead of being snapped to the
 *  nearest grid cell. */
export function worldToGridFloat(x: number, z: number): { gx: number; gz: number } {
  return { gx: x / GRID_SIZE, gz: z / GRID_SIZE };
}

/** Object types that must snap to the grid (for clean maze geometry).
 *  Everything else free-places at float coords. */
export const GRID_SNAP_TYPES: ReadonlySet<SceneObjectType> = new Set(['wall']);

/** Snap (gx, gz) to integer cells iff the type requires grid alignment.
 *  Walls snap, everything else passes through unchanged. */
export function maybeSnapForType(
  type: SceneObjectType,
  gx: number,
  gz: number,
): { gx: number; gz: number } {
  if (GRID_SNAP_TYPES.has(type)) {
    return { gx: Math.round(gx), gz: Math.round(gz) };
  }
  return { gx, gz };
}

/** How many *visually distinct* 90° rotations a type has. Cycling rotY
 *  through any larger modulus only repeats positions that look identical
 *  on screen — which the kid reads as "rotate clicks doing nothing" or
 *  worse, "rotate is toggling back". Walls are intentionally symmetric
 *  (X-axis vs Z-axis is the only thing that matters for maze building);
 *  radially-symmetric props (cones, spheres, cylinders, the waypoint
 *  pole, the mat) have only 1 unique state; bots and apriltags carry
 *  full orientation and cycle 4. */
export function rotationStepsForType(type: SceneObjectType): 1 | 2 | 4 {
  switch (type) {
    case 'bot':
    case 'apriltag':
      return 4;
    case 'wall':
      return 2;
    case 'block':
    case 'cone':
    case 'sphere':
    case 'cylinder':
    case 'waypoint':
    case 'mat':
    case 'studio-light':
    default:
      return 1;
  }
}

export function gridToWorld(obj: { gx: number; gz: number; gy?: number }): { x: number; y: number; z: number } {
  return {
    x: obj.gx * GRID_SIZE,
    y: (obj.gy ?? 0) * STACK_HEIGHT,
    z: obj.gz * GRID_SIZE,
  };
}

/** gridToWorld + per-type render offsets. Walls live on cell EDGES with
 *  a half-cell offset along their long axis so their ENDS sit on grid
 *  intersections (real maze-on-edge geometry). Selection chrome anchored
 *  to the bare cell origin would land beside the wall instead of around
 *  it, so use this helper whenever you need the actual visual position
 *  of a placed object: selection ring, hover highlight, floating toolbar. */
export function gridToWorldRendered(obj: {
  gx: number;
  gz: number;
  gy?: number;
  type: SceneObjectType;
  rotY?: 0 | 1 | 2 | 3;
}): { x: number; y: number; z: number } {
  const base = gridToWorld(obj);
  if (obj.type === 'wall') {
    // rotY 0 / 2 → wall along X-axis; rotY 1 / 3 → along Z-axis.
    const isXAxis = ((obj.rotY ?? 0) % 2) === 0;
    return isXAxis
      ? { ...base, x: base.x + GRID_SIZE / 2 }
      : { ...base, z: base.z + GRID_SIZE / 2 };
  }
  return base;
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

// ─── Thumbnail SVG (top-down preview for session tiles) ──────────────────────

const THUMB_W = 200;
const THUMB_H = 110;

const TYPE_COLORS: Record<SceneObjectType, string> = {
  wall:           '#22c55e',
  block:          '#5dadff',
  cone:           '#ff8c00',
  sphere:         '#a855f7',
  cylinder:       '#cccccc',
  waypoint:       '#4dffb8',
  apriltag:       '#f5f0e6',
  bot:            '#5de4ff',
  mat:            '#a855f7',
  'studio-light': '#fff4d6',
};

/**
 * Render a small top-down SVG of the scene for use as a tile thumbnail.
 * Returns null when there's nothing to draw (caller can render a placeholder).
 */
export function generateThumbnailSvg(objects: SceneObject[]): string | null {
  if (objects.length === 0) return null;

  // Map ARENA_HALF metres → pixel coordinate so all objects fit centred
  const halfRange = ARENA_HALF / GRID_SIZE; // grid cells from origin
  const sx = (THUMB_W - 16) / (halfRange * 2);
  const sy = (THUMB_H - 16) / (halfRange * 2);
  const cx = THUMB_W / 2;
  const cy = THUMB_H / 2;

  const px = (gx: number) => cx + gx * sx;
  const py = (gz: number) => cy + gz * sy;

  const dots = objects
    .map((o) => {
      const fill = TYPE_COLORS[o.type] ?? '#888';
      const x = px(o.gx);
      const y = py(o.gz);
      if (o.type === 'wall' || o.type === 'block') {
        return `<rect x="${(x - 4).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="8" height="8" rx="1.5" fill="${fill}" opacity="0.85"/>`;
      }
      if (o.type === 'apriltag') {
        return `<rect x="${(x - 4).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="8" height="8" fill="#0a0a0a" stroke="${fill}" stroke-width="0.6"/>`;
      }
      if (o.type === 'bot') {
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${fill}" opacity="0.95" stroke="#fff" stroke-width="0.6"/>`;
      }
      if (o.type === 'mat') {
        // Render mats as a translucent ring so they read as a defined area
        // rather than a tiny dot in the thumbnail.
        const r = 18;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}" opacity="0.12"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="none" stroke="${fill}" stroke-width="1" opacity="0.6"/>`;
      }
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${fill}" opacity="0.85"/>`;
    })
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${THUMB_W} ${THUMB_H}" preserveAspectRatio="xMidYMid meet">`,
    `<rect width="${THUMB_W}" height="${THUMB_H}" fill="#0a0e1a"/>`,
    // Subtle grid
    Array.from({ length: 6 }).map((_, i) => `<line x1="0" y1="${(THUMB_H * (i + 1)) / 7}" x2="${THUMB_W}" y2="${(THUMB_H * (i + 1)) / 7}" stroke="rgba(120,140,255,0.08)" stroke-width="0.5"/>`).join(''),
    Array.from({ length: 10 }).map((_, i) => `<line x1="${(THUMB_W * (i + 1)) / 11}" y1="0" x2="${(THUMB_W * (i + 1)) / 11}" y2="${THUMB_H}" stroke="rgba(120,140,255,0.08)" stroke-width="0.5"/>`).join(''),
    dots,
    `</svg>`,
  ].join('');
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

export function countLines(text: string | undefined): number {
  if (!text) return 0;
  return text.split('\n').filter((l) => l.trim().length > 0).length;
}

export function formatTimeSpent(ms: number | undefined): string {
  if (!ms || ms < 1000) return '< 1 min';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
