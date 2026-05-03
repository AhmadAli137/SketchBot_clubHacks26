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
  /** Vertical position (metres above ground). 0 on the floor; tracks
   *  ramp height while driving up; falls back to 0 with gravity when
   *  the bot leaves an elevated surface. */
  worldY: number;
  /** Heading in radians, CCW around +Y. 0 = local +X = world +X. */
  heading: number;
  /** Chassis pitch in radians, applied as rotation around the bot's
   *  local Z axis so the chassis tilts forward/backward to match
   *  whatever slope it's on. + = nose up (climbing); − = nose down. */
  pitch: number;
  /** Chassis roll in radians, applied as rotation around the bot's
   *  local X axis so the chassis tips side-to-side when one wheel is
   *  off the support surface (e.g., half-off the ramp edge). */
  roll: number;
  /** Vertical velocity (m/s). Accumulates under gravity when the
   *  chassis is in the air so falls accelerate like real gravity
   *  instead of dropping at a constant rate. Zeroed on landing. */
  worldVY: number;
  /** Slip velocity in BOT-LOCAL frame (m/s). Accumulates from gravity
   *  projected onto the bot's tilted base plane and decays via rolling
   *  friction, so a bot on a slope rolls faster and faster (with
   *  terminal velocity) rather than instantly hitting drift speed. */
  driftLocalVX: number;
  driftLocalVZ: number;
  /** Cumulative wheel rotation (radians) — applied to wheel meshes. */
  leftWheelRot: number;
  rightWheelRot: number;
  /** Target motor speeds (m/s) — set by controller buttons, smoothed
   *  toward by motorLeft/motorRight via LPF for chassis momentum feel. */
  motorTargetLeft: number;
  motorTargetRight: number;
  /** Current motor speeds — what the integrator actually uses. */
  motorLeft: number;
  motorRight: number;
};

/** Axis-aligned wall AABB used for collision response. */
export type WallAABB = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
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
    // Targets, not currents — currents catch up via LPF in integrateBotPose
    // so motor changes feel like an accelerating chassis rather than an
    // on/off switch.
    p.motorTargetLeft = left;
    p.motorTargetRight = right;
  }
}

export function stopAllMotors(): void {
  livePoses.forEach((p) => {
    p.motorTargetLeft = 0;
    p.motorTargetRight = 0;
  });
}

export function clearPose(id: string): void {
  livePoses.delete(id);
}

/** Asymmetric motor LPF — short attack so a button press feels instant,
 *  long release so the chassis coasts after the user lets go (real bots
 *  carry their forward momentum until rolling friction bleeds it off). */
const MOTOR_TAU_ATTACK  = 0.06;
const MOTOR_TAU_RELEASE = 0.45;
/** Bounce factor when colliding with a wall — fraction of the radial velocity
 *  reversed back at the bot. 0 = stick, 1 = perfect bounce. */
const BOUNCE = 0.55;

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Differential-drive integration step. Mutates the pose in place.
 *  v = (L + R) / 2, ω = (R − L) / wheelBase. Wheel angular velocity =
 *  motor / wheelRadius. Both motors are linear m/s along the wheel forward
 *  direction.
 *
 *  When `walls` is provided the new position is rejected if the bot's
 *  bounding circle overlaps any wall AABB; the bot is pushed out along
 *  the wall's surface normal and the radial component of velocity is
 *  reversed (BOUNCE coefficient) so the impact has a recoil. */
export function integrateBotPose(
  pose: BotPose,
  dt: number,
  wheelBase: number,
  wheelRadius: number,
  walls?: WallAABB[],
  botRadius?: number,
): void {
  // Motor LPF — current chases target with a time constant. Asymmetric
  // so press feels instant but release leaves the chassis coasting
  // (real wheeled bots don't e-brake when you let go). Tau is picked
  // per-side based on whether the target's magnitude grew (attack) or
  // shrank (release).
  const tauL = Math.abs(pose.motorTargetLeft)  > Math.abs(pose.motorLeft)  ? MOTOR_TAU_ATTACK : MOTOR_TAU_RELEASE;
  const tauR = Math.abs(pose.motorTargetRight) > Math.abs(pose.motorRight) ? MOTOR_TAU_ATTACK : MOTOR_TAU_RELEASE;
  pose.motorLeft  += (pose.motorTargetLeft  - pose.motorLeft)  * (1 - Math.exp(-dt / tauL));
  pose.motorRight += (pose.motorTargetRight - pose.motorRight) * (1 - Math.exp(-dt / tauR));

  const v     = (pose.motorLeft + pose.motorRight) * 0.5;
  const omega = (pose.motorRight - pose.motorLeft) / wheelBase;
  pose.heading += omega * dt;

  const dx = v * dt * Math.cos(pose.heading);
  const dz = v * dt * (-Math.sin(pose.heading));
  let nextX = pose.worldX + dx;
  let nextZ = pose.worldZ + dz;

  // Collision against axis-aligned wall boxes — circle vs rectangle test.
  if (walls && walls.length > 0 && botRadius && botRadius > 0) {
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      const cx = clampNum(nextX, w.minX, w.maxX);
      const cz = clampNum(nextZ, w.minZ, w.maxZ);
      const dxw = nextX - cx;
      const dzw = nextZ - cz;
      const distSq = dxw * dxw + dzw * dzw;
      const r = botRadius;
      if (distSq < r * r) {
        const dist = Math.max(Math.sqrt(distSq), 1e-4);
        const nxn = dxw / dist;
        const nzn = dzw / dist;
        // Push the bot out so its perimeter just kisses the wall.
        nextX = cx + nxn * (r + 0.0005);
        nextZ = cz + nzn * (r + 0.0005);
        // Reflect the radial component of motor velocity. Forward motion
        // into the wall gets reversed and damped; lateral motion past
        // the wall is preserved.
        const vForwardX =  Math.cos(pose.heading);
        const vForwardZ = -Math.sin(pose.heading);
        const vDotN = (vForwardX * nxn + vForwardZ * nzn) * v;
        if (vDotN < 0) {
          // Bot is driving INTO the wall — flip and damp the per-wheel
          // current speeds so it recoils back. Pivot turns (no forward
          // component into the wall) survive untouched. Targets are kept
          // intact so a held button reaccelerates the bot off the wall
          // — releases as a brief "boing" before settling.
          pose.motorLeft  = -BOUNCE * pose.motorLeft;
          pose.motorRight = -BOUNCE * pose.motorRight;
        }
      }
    }
  }

  pose.worldX = nextX;
  pose.worldZ = nextZ;
  pose.leftWheelRot  += (pose.motorLeft  / wheelRadius) * dt;
  pose.rightWheelRot += (pose.motorRight / wheelRadius) * dt;
}
