/**
 * Starter sandbox setups — clicked from the empty-state to give kids
 * immediate gratification without learning the builder rail first.
 *
 * Each preset is a list of SceneObject specs (no `id` — caller assigns).
 */

import {
  GRID_SIZE,
  newSceneObjectId,
  type SceneObject,
} from './scene-builder';

type ProtoObject = Omit<SceneObject, 'id'>;

function ringCones(count: number, radiusMeters: number): ProtoObject[] {
  const out: ProtoObject[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out.push({
      type: 'cone',
      gx: Math.round((Math.cos(a) * radiusMeters) / GRID_SIZE),
      gz: Math.round((Math.sin(a) * radiusMeters) / GRID_SIZE),
    });
  }
  return out;
}

const MAZE: ProtoObject[] = [
  // Outer perimeter (with one gap on top + bottom for entry/exit)
  ...[-4, -3, -2, -1,  1,  2,  3,  4].map((x) => ({ type: 'wall' as const, gx: x, gz: -4, rotY: 0 as const })),
  ...[-4, -3, -2, -1,  1,  2,  3,  4].map((x) => ({ type: 'wall' as const, gx: x, gz:  4, rotY: 0 as const })),
  ...[-3, -2, -1, 0, 1, 2, 3].map((z) => ({ type: 'wall' as const, gx: -4, gz: z, rotY: 1 as const })),
  ...[-3, -2, -1, 0, 1, 2, 3].map((z) => ({ type: 'wall' as const, gx:  4, gz: z, rotY: 1 as const })),
  // Inner walls — corridor pattern
  { type: 'wall', gx: -2, gz: -2, rotY: 0 }, { type: 'wall', gx: -1, gz: -2, rotY: 0 },
  { type: 'wall', gx:  1, gz: -1, rotY: 0 }, { type: 'wall', gx:  2, gz: -1, rotY: 0 },
  { type: 'wall', gx: -2, gz:  1, rotY: 0 }, { type: 'wall', gx: -1, gz:  1, rotY: 0 },
  { type: 'wall', gx:  1, gz:  2, rotY: 0 }, { type: 'wall', gx:  2, gz:  2, rotY: 0 },
  // Bot at start, finish-line waypoint at exit
  { type: 'bot',      gx: 0,  gz: -3, botVariant: 'standard' },
  { type: 'waypoint', gx: 0,  gz:  3, color: '#4dffb8' },
];

const CONE_SLALOM: ProtoObject[] = [
  { type: 'cone', gx: -3, gz: -1 },
  { type: 'cone', gx: -2, gz:  1 },
  { type: 'cone', gx: -1, gz: -1 },
  { type: 'cone', gx:  0, gz:  1 },
  { type: 'cone', gx:  1, gz: -1 },
  { type: 'cone', gx:  2, gz:  1 },
  { type: 'cone', gx:  3, gz: -1 },
  { type: 'bot',      gx: -5, gz: 0, botVariant: 'standard' },
  { type: 'waypoint', gx:  5, gz: 0, color: '#4dffb8' },
];

const SUMO_ARENA: ProtoObject[] = [
  ...ringCones(8, 1.25),
  { type: 'bot', gx: -1, gz: 0, botVariant: 'sumo' },
  { type: 'bot', gx:  1, gz: 0, botVariant: 'sumo', rotY: 2 },
];

const SURPRISE: ProtoObject[] = [
  // A whimsical mix
  { type: 'cone',     gx: -3, gz: -2 },
  { type: 'cone',     gx:  3, gz: -2 },
  { type: 'block',    gx: -1, gz: -2, color: '#5dadff' },
  { type: 'block',    gx:  1, gz: -2, color: '#a855f7' },
  { type: 'block',    gx:  0, gz: -2, gy: 1, color: '#ff8c00' },
  { type: 'sphere',   gx:  2, gz:  1, color: '#4dffb8' },
  { type: 'cylinder', gx: -2, gz:  1 },
  { type: 'waypoint', gx:  0, gz:  2, color: '#5de4ff' },
  { type: 'waypoint', gx: -3, gz:  3, color: '#ff8c00' },
  { type: 'waypoint', gx:  3, gz:  3, color: '#a855f7' },
  { type: 'apriltag', gx: -4, gz: -4 },
  { type: 'apriltag', gx:  4, gz: -4 },
  { type: 'bot',      gx:  0, gz:  0, botVariant: 'standard' },
];

export type SandboxPreset = {
  id: string;
  emoji: string;
  label: string;
  description: string;
  /** When clicked, replaces the sandbox with these objects (with fresh ids). */
  objects: ProtoObject[];
};

export const SANDBOX_PRESETS: SandboxPreset[] = [
  { id: 'maze',    emoji: '🧱', label: 'Maze',         description: '8×8 corridor maze',        objects: MAZE },
  { id: 'slalom',  emoji: '🚧', label: 'Cone slalom',  description: 'Zigzag through 7 cones',   objects: CONE_SLALOM },
  { id: 'sumo',    emoji: '🥋', label: 'Sumo arena',   description: 'Ring of cones, 2 sumo bots', objects: SUMO_ARENA },
  { id: 'surprise',emoji: '✨', label: 'Surprise me',  description: 'A bit of everything',      objects: SURPRISE },
];

/** Materialise a preset into ready-to-place SceneObject[] with fresh ids. */
export function instantiatePreset(preset: SandboxPreset): SceneObject[] {
  return preset.objects.map((p) => ({ ...p, id: newSceneObjectId() }));
}
