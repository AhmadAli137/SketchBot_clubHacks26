/**
 * Bot drive store — live runtime state for placed bots so the controller can
 * write motor commands at any rate while the bot meshes read pose every frame.
 *
 * Why a module-level store: the BotController and the Bot meshes live in
 * different parts of the React tree and reconcile on different cadences
 * (controller updates motors on input events; meshes consume pose every
 * useFrame). React Context would cause a re-render storm at 60 Hz; refs
 * + a mutable Map skip React entirely between explicit "commit" points.
 *
 * Persistence model: pose lives here while the bot is being driven. Periodic
 * commits and the final stop write pose back to the SceneObject (gx / gz /
 * headingRad), keeping the SavedSession honest.
 */

export type BotPose = {
  /** World coords (metres). */
  worldX: number;
  worldZ: number;
  /** Heading in radians, CCW around +Y. 0 = local +X = world +X. */
  heading: number;
  /** Cumulative wheel rotation (radians) — applied to wheel meshes. */
  leftWheelRot: number;
  rightWheelRot: number;
  /** Last commanded motor speeds (m/s along the wheel's forward direction). */
  motorLeft: number;
  motorRight: number;
};

const livePoses = new Map<string, BotPose>();

export function getPose(id: string): BotPose | undefined {
  return livePoses.get(id);
}

export function ensurePose(id: string, init: () => BotPose): BotPose {
  let p = livePoses.get(id);
  if (!p) {
    p = init();
    livePoses.set(id, p);
  }
  return p;
}

/** Hard-reset the pose for a bot (e.g., user moved it via the Move tool). */
export function syncPoseToPlacement(id: string, worldX: number, worldZ: number, heading: number): void {
  const p = livePoses.get(id);
  if (p) {
    p.worldX = worldX;
    p.worldZ = worldZ;
    p.heading = heading;
    // Don't reset wheel rots — they're cumulative and visual only.
  }
}

export function setMotors(id: string, left: number, right: number): void {
  const p = livePoses.get(id);
  if (p) {
    p.motorLeft = left;
    p.motorRight = right;
  }
}

export function stopAllMotors(): void {
  livePoses.forEach((p) => { p.motorLeft = 0; p.motorRight = 0; });
}

export function clearPose(id: string): void {
  livePoses.delete(id);
}

/** Differential-drive integration step. Mutates the pose in place.
 *  v = (L + R) / 2, ω = (R − L) / wheelBase. Wheel angular velocity
 *  = motor / wheelRadius. Both motors are linear m/s along the wheel
 *  forward direction. */
export function integrateBotPose(pose: BotPose, dt: number, wheelBase: number, wheelRadius: number): void {
  const v     = (pose.motorLeft + pose.motorRight) * 0.5;
  const omega = (pose.motorRight - pose.motorLeft) / wheelBase;
  pose.heading += omega * dt;
  pose.worldX += v * dt * Math.cos(pose.heading);
  pose.worldZ += v * dt * (-Math.sin(pose.heading));
  pose.leftWheelRot  += (pose.motorLeft  / wheelRadius) * dt;
  pose.rightWheelRot += (pose.motorRight / wheelRadius) * dt;
}
