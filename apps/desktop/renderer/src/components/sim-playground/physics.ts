/**
 * Sandbox physics — collision shapes + push resolution for pushable scene
 * objects (cones, blocks, spheres, waypoints, and other bots).
 *
 * Companion to bot-drive.ts. Bots have BotPose with motor commands; everything
 * else is a passive kinematic body that gets shoved when the active bot bumps
 * it. Storage pattern matches bot-drive: a module-level Map of live world
 * positions + velocities that the meshes consume each useFrame, and a single
 * React-state commit on motor release for persistence.
 *
 * Each pushable carries linear velocity (vx, vz) and a per-type damping
 * factor so balls roll, cones slide briefly, and blocks barely budge — the
 * thing the bot just bumped continues moving with momentum even after the
 * bot has driven away.
 */

import type { SceneObject, SceneObjectType } from '@/lib/scene-builder';

export type ObjectKinematic = {
  /** Live world coordinates (metres). */
  worldX: number;
  worldZ: number;
  /** Linear velocity (m/s) — drives free motion + ball rolling visuals. */
  vx: number;
  vz: number;
  /** Bounding circle radius (m) used for collision tests + rolling visuals. */
  radius: number;
  /** Higher → more displacement per bot impact. Lighter objects (cones,
   *  balls) take a bigger fraction of the overlap; heavier ones (blocks,
   *  bots) take less. Always paired with the bot's complementary share so
   *  totals = 1. */
  pushFactor: number;
  /** Linear damping coefficient (1/s). v(t) = v0 · exp(-damping · t). High
   *  for cones/blocks (sliding friction); low for balls (rolls a while). */
  damping: number;
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

/** Snap the live position to a fresh placement (Move tool, session restore).
 *  Also zeroes velocity — placements imply "this is now the resting spot". */
export function syncKinematicToPlacement(id: string, worldX: number, worldZ: number): void {
  const k = kinematics.get(id);
  if (k) {
    k.worldX = worldX;
    k.worldZ = worldZ;
    k.vx = 0;
    k.vz = 0;
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
 *  pushFactor weighted by perceived mass so cones flick and blocks shove,
 *  damping tuned so balls roll for ~3 s and cones stop in ~0.4 s. */
export function defaultKinematic(type: SceneObjectType): {
  radius: number;
  pushFactor: number;
  damping: number;
} {
  switch (type) {
    case 'cone':     return { radius: 0.09, pushFactor: 0.85, damping: 4.5 };
    case 'sphere':   return { radius: 0.10, pushFactor: 0.92, damping: 0.6 };  // rolls
    case 'block':    return { radius: 0.13, pushFactor: 0.55, damping: 6.0 };  // heavy
    case 'cylinder': return { radius: 0.10, pushFactor: 0.65, damping: 4.0 };
    case 'waypoint': return { radius: 0.07, pushFactor: 0.95, damping: 5.0 };
    default:         return { radius: 0.10, pushFactor: 0.70, damping: 4.0 };
  }
}

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

/** Free-motion integration step for a passive kinematic. Apply velocity to
 *  position, then exponentially decay velocity by the per-object damping
 *  factor. Stops the object cleanly when |v| dips below 1 mm/s. */
export function integrateKinematic(k: ObjectKinematic, dt: number): void {
  k.worldX += k.vx * dt;
  k.worldZ += k.vz * dt;
  const decay = Math.exp(-k.damping * dt);
  k.vx *= decay;
  k.vz *= decay;
  if (Math.abs(k.vx) < 0.001 && Math.abs(k.vz) < 0.001) {
    k.vx = 0;
    k.vz = 0;
  }
}

/** Resolve a bot vs pushable circle overlap. Mutates both positions to
 *  separate the circles AND imparts the bot's normal-direction velocity to
 *  the object so it continues rolling/sliding after the bot drives off.
 *  Returns true on contact. */
export function resolveBotPushable(
  bot: { worldX: number; worldZ: number },
  botRadius: number,
  botVelX: number,
  botVelZ: number,
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
  // Position resolution: object takes pushFactor share, bot eats the rest.
  obj.worldX += nx * overlap * obj.pushFactor;
  obj.worldZ += nz * overlap * obj.pushFactor;
  bot.worldX -= nx * overlap * (1 - obj.pushFactor);
  bot.worldZ -= nz * overlap * (1 - obj.pushFactor);
  // Velocity impulse: if bot is moving INTO the object faster than the
  // object is moving along the normal, raise the object's normal velocity
  // to match the bot's, scaled by pushFactor. Lateral component is left
  // alone — a sideswipe doesn't kill an existing roll.
  const vBotN = botVelX * nx + botVelZ * nz;
  const vObjN = obj.vx * nx + obj.vz * nz;
  if (vBotN > 0 && vBotN > vObjN) {
    const dV = (vBotN - vObjN) * obj.pushFactor * 1.15;  // a touch of bonus for impact feel
    obj.vx += nx * dV;
    obj.vz += nz * dV;
  }
  return true;
}

/** Bot-vs-bot overlap. Splits the push equally and returns each bot's
 *  displacement so the caller can spin the pushed bot's wheels by the
 *  forward-projected component (skidding sideways doesn't roll a real
 *  wheel). */
export type BotBotResolution = {
  aDx: number; aDz: number;
  bDx: number; bDz: number;
};

export function resolveBotBot(
  a: { worldX: number; worldZ: number },
  aRadius: number,
  b: { worldX: number; worldZ: number },
  bRadius: number,
): BotBotResolution | null {
  const dx = b.worldX - a.worldX;
  const dz = b.worldZ - a.worldZ;
  const distSq = dx * dx + dz * dz;
  const minDist = aRadius + bRadius;
  if (distSq >= minDist * minDist) return null;
  const dist = Math.max(Math.sqrt(distSq), 1e-4);
  const nx = dx / dist;
  const nz = dz / dist;
  const overlap = minDist - dist + 0.001;
  const aDx = -nx * overlap * 0.5;
  const aDz = -nz * overlap * 0.5;
  const bDx =  nx * overlap * 0.5;
  const bDz =  nz * overlap * 0.5;
  a.worldX += aDx;
  a.worldZ += aDz;
  b.worldX += bDx;
  b.worldZ += bDz;
  return { aDx, aDz, bDx, bDz };
}

/** Push a circle out of any AABB it's intersecting AND reflect its
 *  velocity along the contact normal (with restitution) so balls bounce.
 *  Used after a pushable object has been displaced (or is rolling free)
 *  so it can't end up inside a wall. */
export function resolveCircleVsAABBs(
  obj: ObjectKinematic,
  walls: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>,
  restitution = 0.45,
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
      const nx = dx / dist;
      const nz = dz / dist;
      obj.worldX = cx + nx * (obj.radius + 0.0005);
      obj.worldZ = cz + nz * (obj.radius + 0.0005);
      // Reflect velocity along normal if it's heading into the wall.
      const vn = obj.vx * nx + obj.vz * nz;
      if (vn < 0) {
        obj.vx -= (1 + restitution) * vn * nx;
        obj.vz -= (1 + restitution) * vn * nz;
      }
    }
  }
}
