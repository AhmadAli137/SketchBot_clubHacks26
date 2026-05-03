/**
 * Simulator sensor implementations — concrete SensorPort backed by the
 * scene's wall AABBs and pushable circles. Mirrors what an HC-SR04 on
 * the real bot would return: distance to the closest obstacle in the
 * forward-facing 30° cone, capped at 4 m (the sensor's nominal range).
 *
 * The bot calls `ultrasonicMeters(botId)` when running an `if distance.lt`
 * or `motor.until distance.lt` block. We snapshot the relevant scene
 * objects on every call rather than caching: the program runs at human
 * timescales (decisions per second), so per-call overhead is fine and
 * we avoid stale-cache bugs when the user moves objects mid-program.
 */

import type { SensorPort } from '@/lib/program-executor';
import { GRID_SIZE, gridToWorldRendered, type SceneObject } from '@/lib/scene-builder';
import { getPose } from './bot-drive';
import { getKinematic } from './physics';

const ULTRASONIC_MAX_M = 4.0;
const WALL_THICKNESS = GRID_SIZE * 0.18;
const WALL_LENGTH    = GRID_SIZE;

/** Distance from `(ox, oz)` to the closest wall AABB / pushable circle hit
 *  by a ray cast along (dx, dz) (unit vector). Returns Infinity if nothing
 *  in range. */
function rayHitDistance(
  ox: number, oz: number, dx: number, dz: number,
  walls: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>,
  circles: Array<{ x: number; z: number; r: number }>,
): number {
  let best = Infinity;

  // Ray vs axis-aligned box (slab method). Both walls and circles are
  // tested in world space; the bot pose's heading is already baked into
  // the (dx, dz) direction passed in.
  for (const w of walls) {
    const invDx = dx !== 0 ? 1 / dx : Infinity;
    const invDz = dz !== 0 ? 1 / dz : Infinity;
    const tx1 = (w.minX - ox) * invDx;
    const tx2 = (w.maxX - ox) * invDx;
    const tz1 = (w.minZ - oz) * invDz;
    const tz2 = (w.maxZ - oz) * invDz;
    const tEntry = Math.max(Math.min(tx1, tx2), Math.min(tz1, tz2));
    const tExit  = Math.min(Math.max(tx1, tx2), Math.max(tz1, tz2));
    if (tExit < 0 || tEntry > tExit) continue;
    const t = tEntry > 0 ? tEntry : 0;  // 0 = ray origin inside box (treat as touching)
    if (t < best) best = t;
  }

  // Ray vs circle (closest of two roots, must be >= 0).
  for (const c of circles) {
    const cx = ox - c.x;
    const cz = oz - c.z;
    const b = cx * dx + cz * dz;
    const cc = cx * cx + cz * cz - c.r * c.r;
    const disc = b * b - cc;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    const t1 = -b - sq;
    const t2 = -b + sq;
    const t = t1 >= 0 ? t1 : t2;
    if (t >= 0 && t < best) best = t;
  }

  return best;
}

/** Build a SensorPort that pulls fresh scene state on each read. The
 *  caller (programming UI) holds a ref to the latest sceneObjects array
 *  and passes it via getSceneObjects so the sensor sees user moves. */
export function makeSimSensor(getSceneObjects: () => SceneObject[]): SensorPort {
  return {
    ultrasonicMeters(botId: string): number {
      const pose = getPose(botId);
      if (!pose) return Infinity;

      const list = getSceneObjects();
      // Forward direction in world matches integrateBotPose's convention:
      // dx = cos(heading), dz = -sin(heading).
      const dx = Math.cos(pose.heading);
      const dz = -Math.sin(pose.heading);

      const walls: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
      const circles: Array<{ x: number; z: number; r: number }> = [];

      for (const o of list) {
        if (o.id === botId) continue;
        if (o.type === 'wall') {
          const { x: wx, z: wz } = gridToWorldRendered(o);
          const isXAxis = ((o.rotY ?? 0) % 2) === 0;
          const halfLen = WALL_LENGTH / 2;
          const halfThk = WALL_THICKNESS / 2;
          if (isXAxis) walls.push({ minX: wx - halfLen, maxX: wx + halfLen, minZ: wz - halfThk, maxZ: wz + halfThk });
          else         walls.push({ minX: wx - halfThk, maxX: wx + halfThk, minZ: wz - halfLen, maxZ: wz + halfLen });
        } else if (o.type === 'cone' || o.type === 'block' || o.type === 'sphere' || o.type === 'cylinder') {
          // Read live position from the kinematic store so a rolling ball
          // is detected at where it actually is, not where it was placed.
          const k = getKinematic(o.id);
          if (k) circles.push({ x: k.worldX, z: k.worldZ, r: k.radius });
          else {
            const { x: ox, z: oz } = gridToWorldRendered(o);
            circles.push({ x: ox, z: oz, r: 0.10 });
          }
        } else if (o.type === 'bot') {
          const op = getPose(o.id);
          if (op) circles.push({ x: op.worldX, z: op.worldZ, r: 0.13 });
        }
      }

      const t = rayHitDistance(pose.worldX, pose.worldZ, dx, dz, walls, circles);
      return Math.min(t, ULTRASONIC_MAX_M);
    },
  };
}
