/**
 * Sandbox physics — collision shapes + push resolution for pushable scene
 * objects (cones, blocks, spheres, waypoints, and other bots).
 *
 * Companion to bot-drive.ts. Bots have BotPose with motor commands; everything
 * else is "passive" — gets shoved when the active bot bumps it. Storage
 * pattern matches bot-drive: a module-level Map of live world positions that
 * the meshes consume each useFrame, and a single React-state commit on motor
 * release for persistence.
 */

import type { SceneObject, SceneObjectType } from '@/lib/scene-builder';

export type ObjectKinematic = {
  /** Live world coordinates (metres). */
  worldX: number;
  worldZ: number;
  /** Bounding circle radius (m) used for collision tests. */
  radius: number;
  /** Higher → more displacement per bot impact. Lighter objects (cones,
   *  balls) take a bigger fraction of the overlap; heavier ones (blocks,
   *  bots) take less. Always paired with the bot's complementary share so
   *  totals = 1. */
  pushFactor: number;
};

const kinematics = new Map<string, ObjectKinematic>();

export function getKinematic(id: string): ObjectKinematic | undefined {
  return kinematics.get(id);
}

export function ensureKinematic(id: string, init: () => ObjectKinematic): ObjectKinematic {
  let k = kinematics.get(id);
  if (!k) {
    k = init();
    kinematics.set(id, k);
  }
  return k;
}

/** Snap the live position to a fresh placement (Move tool, session restore). */
export function syncKinematicToPlacement(id: string, worldX: number, worldZ: number): void {
  const k = kinematics.get(id);
  if (k) {
    k.worldX = worldX;
    k.worldZ = worldZ;
  }
}

export function clearKinematic(id: string): void {
  kinematics.delete(id);
}

/** Has the live position drifted from the placement enough to need a commit? */
export function kinematicMovedFrom(id: string, worldX: number, worldZ: number, eps = 0.005): boolean {
  const k = kinematics.get(id);
  if (!k) return false;
  return Math.abs(k.worldX - worldX) > eps || Math.abs(k.worldZ - worldZ) > eps;
}

/** Per-type defaults — bounding radius from the rendered prop's silhouette,
 *  pushFactor weighted by perceived mass so cones flick around but blocks
 *  shove like bricks. */
export function defaultKinematic(type: SceneObjectType): { radius: number; pushFactor: number } {
  switch (type) {
    case 'cone':     return { radius: 0.09, pushFactor: 0.85 };  // light, easy
    case 'sphere':   return { radius: 0.10, pushFactor: 0.92 };  // rolls easy
    case 'block':    return { radius: 0.13, pushFactor: 0.55 };  // heavy
    case 'cylinder': return { radius: 0.10, pushFactor: 0.65 };
    case 'waypoint': return { radius: 0.07, pushFactor: 0.95 };  // marker
    default:         return { radius: 0.10, pushFactor: 0.70 };
  }
}

/** Is a placed object pushable by the active bot? Walls and floor decals
 *  (mat, apriltag, studio-light) are static. */
export function isPushable(o: SceneObject): boolean {
  switch (o.type) {
    case 'cone':
    case 'sphere':
    case 'block':
    case 'cylinder':
    case 'waypoint':
      return true;
    default:
      return false;
  }
}

/** Resolve a bot vs pushable circle overlap. Mutates both positions to
 *  separate the circles. Returns true on contact. */
export function resolveBotPushable(
  bot: { worldX: number; worldZ: number },
  botRadius: number,
  obj: ObjectKinematic,
): boolean {
  const dx = obj.worldX - bot.worldX;
  const dz = obj.worldZ - bot.worldZ;
  const distSq = dx * dx + dz * dz;
  const minDist = botRadius + obj.radius;
  if (distSq >= minDist * minDist) return false;
  const dist = Math.max(Math.sqrt(distSq), 1e-4);
  const nx = dx / dist;
  const nz = dz / dist;
  const overlap = minDist - dist + 0.001;
  // Object takes pushFactor share of the overlap; bot eats the rest.
  obj.worldX += nx * overlap * obj.pushFactor;
  obj.worldZ += nz * overlap * obj.pushFactor;
  bot.worldX -= nx * overlap * (1 - obj.pushFactor);
  bot.worldZ -= nz * overlap * (1 - obj.pushFactor);
  return true;
}

/** Resolve a bot-vs-bot overlap. Splits the push so both bots move equally
 *  unless either has an explicit pushFactor (we treat both as 0.5 here). */
export function resolveBotBot(
  a: { worldX: number; worldZ: number },
  aRadius: number,
  b: { worldX: number; worldZ: number },
  bRadius: number,
): boolean {
  const dx = b.worldX - a.worldX;
  const dz = b.worldZ - a.worldZ;
  const distSq = dx * dx + dz * dz;
  const minDist = aRadius + bRadius;
  if (distSq >= minDist * minDist) return false;
  const dist = Math.max(Math.sqrt(distSq), 1e-4);
  const nx = dx / dist;
  const nz = dz / dist;
  const overlap = minDist - dist + 0.001;
  a.worldX -= nx * overlap * 0.5;
  a.worldZ -= nz * overlap * 0.5;
  b.worldX += nx * overlap * 0.5;
  b.worldZ += nz * overlap * 0.5;
  return true;
}

/** Push a circle out of any AABB it's intersecting. Used after a pushable
 *  object has been displaced by the bot, so it can't end up inside a wall. */
export function resolveCircleVsAABBs(
  obj: { worldX: number; worldZ: number; radius: number },
  walls: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>,
): void {
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const cx = obj.worldX < w.minX ? w.minX : obj.worldX > w.maxX ? w.maxX : obj.worldX;
    const cz = obj.worldZ < w.minZ ? w.minZ : obj.worldZ > w.maxZ ? w.maxZ : obj.worldZ;
    const dx = obj.worldX - cx;
    const dz = obj.worldZ - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq < obj.radius * obj.radius) {
      const dist = Math.max(Math.sqrt(distSq), 1e-4);
      obj.worldX = cx + (dx / dist) * (obj.radius + 0.0005);
      obj.worldZ = cz + (dz / dist) * (obj.radius + 0.0005);
    }
  }
}
