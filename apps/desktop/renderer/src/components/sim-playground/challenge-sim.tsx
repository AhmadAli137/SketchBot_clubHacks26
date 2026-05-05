'use client';

/**
 * ChallengeSim — animated previews of the four challenge concepts plus the
 * geometry-drawing line follower. Pure path animation: each bot interpolates
 * along a precomputed polyline at a fixed speed, the wheels roll based on
 * actual frame-to-frame travel, and heading auto-aligns with the path
 * tangent. This mirrors the marketing-site hero scenes exactly — same
 * smoothness, same predictable behaviour, no physics tuning to fight.
 *
 * Why no physics: the bots aren't competing against any AI; they're
 * demonstrating what a programmed path looks like. The earlier
 * physics-driven AI overshot waypoints, fought damping, slid off contact,
 * and generally looked like drunk robots. Webapp users see the path
 * animation version and consistently report it feels right; this brings
 * the desktop sims into parity.
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

import { SparkMiniBotMesh, SumoBotMesh } from './bot-meshes';
import {
  ensurePose,
  getPose,
  setMotors,
  clearPose,
  integrateBotPose,
} from './bot-drive';

// ─── Mode dispatch ────────────────────────────────────────────────────────────

export type SimMode =
  | 'drawing'
  | 'sumo'
  | 'cone-ring'
  | 'maze'
  | 'waypoint'
  | 'circle-dance'
  | 'pid-approach';

export function getSimMode(conceptId: string | null | undefined): SimMode {
  switch (conceptId) {
    case 'sumo-arena':         return 'sumo';
    case 'cone-ring-gauntlet': return 'cone-ring';
    case 'maze-marathon':      return 'maze';
    case 'path-planning':      return 'waypoint';
    case 'geometry-drawing':
    default:                   return 'drawing';
  }
}

// ─── Wheel radii — match the SparkMiniBotMesh / SumoBotMesh tires so wheel
// rolling lines up with actual travel distance.
const MINI_WHEEL_R = 0.052;
const SUMO_WHEEL_R = 0.045;

// ─── Path-animated bot ────────────────────────────────────────────────────────
//
// Animates a SparkMiniBotMesh / SumoBotMesh along a polyline at a constant
// speed. Heading auto-orients to the path tangent (mesh's local +X is
// "forward" — the rotation.y formula `atan2(dx, dz) - π/2` maps the
// motion-direction unit vector to a Y rotation that puts the mesh's +X
// axis along that direction). Wheels roll based on per-frame travel.

type PathBotProps = {
  /** Polyline the bot traces, treated as a closed loop. For closed-loop
   *  routes (waypoint chase, circle dance) include the start point as
   *  the last element so the wrap is seamless. For "ping-pong" routes
   *  (maze, cone slalom, PID approach) supply a palindrome path —
   *  S → … → E → … → S — and the bot animates the whole thing as a loop. */
  path: [number, number][];
  /** m/s along the polyline. Real classroom mini-bots cruise around 0.5
   *  m/s; the sims look right at 0.8–1.2 for visibility. */
  speed?: number;
  variant?: 'mini' | 'sumo';
  glowColor?: string;
  /** Multiplier on the under-chassis pointlight intensity. */
  glowIntensity?: number;
};

function PathBot({
  path,
  speed = 1.0,
  variant = 'mini',
  glowColor,
  glowIntensity = 0.4,
}: PathBotProps) {
  const groupRef = useRef<THREE.Group>(null);

  const lWheel = useRef<THREE.Group>(null);
  const rWheel = useRef<THREE.Group>(null);
  const lFront = useRef<THREE.Group>(null);
  const lRear  = useRef<THREE.Group>(null);
  const rFront = useRef<THREE.Group>(null);
  const rRear  = useRef<THREE.Group>(null);

  const wheelR = variant === 'sumo' ? SUMO_WHEEL_R : MINI_WHEEL_R;

  const tRef    = useRef(0);
  const lastPos = useRef<[number, number]>([path[0]![0], path[0]![1]]);

  // Cumulative arc-length parameterisation so the bot moves at constant
  // metres-per-second along the polyline (rather than constant fraction
  // per segment, which would speed up on short legs and slow down on long
  // ones — looks wrong). Same approach the webapp's MovingMiniBot uses.
  const segMetrics = useMemo(() => {
    const segLens: number[] = [];
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const len = Math.hypot(path[i + 1]![0] - path[i]![0], path[i + 1]![1] - path[i]![1]);
      segLens.push(len);
      total += len;
    }
    return { segLens, total };
  }, [path]);

  useFrame((_, delta) => {
    if (!groupRef.current || segMetrics.total < 0.001) return;

    // t wraps 0..1 over the WHOLE polyline. For closed loops the path
    // includes the start as its last point so wrap is seamless. For
    // ping-pong feel, callers pass a palindrome path — the bot still
    // animates as a continuous loop, just with the segments arranged
    // S → … → E → … → S.
    const ds = (speed * delta) / segMetrics.total;
    tRef.current = (tRef.current + ds + 1) % 1;

    const targetDist = tRef.current * segMetrics.total;
    let walked = 0;
    let segIdx = 0;
    for (; segIdx < segMetrics.segLens.length; segIdx++) {
      if (walked + segMetrics.segLens[segIdx]! >= targetDist) break;
      walked += segMetrics.segLens[segIdx]!;
    }
    segIdx = Math.min(segIdx, segMetrics.segLens.length - 1);
    const segLen = segMetrics.segLens[segIdx]!;
    const f = segLen > 0.0001 ? (targetDist - walked) / segLen : 0;
    const a = path[segIdx]!;
    const b = path[segIdx + 1]!;
    const nx = a[0] + (b[0] - a[0]) * f;
    const nz = a[1] + (b[1] - a[1]) * f;

    // Heading = segment tangent. atan2(dx, dz) - π/2 puts the mesh's
    // local +X (forward) along the motion direction.
    const tx = b[0] - a[0];
    const tz = b[1] - a[1];
    if (Math.abs(tx) + Math.abs(tz) > 0.001) {
      groupRef.current.rotation.y = Math.atan2(tx, tz) - Math.PI / 2;
    }
    groupRef.current.position.set(nx, 0, nz);

    const travel = Math.hypot(nx - lastPos.current[0], nz - lastPos.current[1]);
    const rollDelta = travel / wheelR;
    if (variant === 'sumo') {
      for (const r of [lFront, lRear, rFront, rRear]) {
        if (r.current) r.current.rotation.z -= rollDelta;
      }
    } else {
      if (lWheel.current) lWheel.current.rotation.z -= rollDelta;
      if (rWheel.current) rWheel.current.rotation.z -= rollDelta;
    }
    lastPos.current = [nx, nz];
  });

  return (
    <group ref={groupRef}>
      {variant === 'sumo' ? (
        <SumoBotMesh
          wheelRefs={{
            leftFront:  lFront,
            leftRear:   lRear,
            rightFront: rFront,
            rightRear:  rRear,
          }}
        />
      ) : (
        <SparkMiniBotMesh wheelRefs={{ left: lWheel, right: rWheel }} />
      )}
      {glowColor && (
        <pointLight color={glowColor} intensity={glowIntensity} distance={1.2} />
      )}
    </group>
  );
}

// ─── SUMO ─────────────────────────────────────────────────────────────────────
//
// Real physics this time: each bot uses the sandbox's bot-drive store
// (BotPose + integrateBotPose), the AI sets motor commands, and a custom
// bot-bot resolver pushes them out of penetration each frame so the
// wedges actually grind against each other instead of phasing through.
// Same physics primitives the kid drives in the sandbox.

const SUMO_BOT_A = '__sim_sumo_a__';
const SUMO_BOT_B = '__sim_sumo_b__';
const SUMO_BOT_R       = 0.22;       // collision radius (≈ chassis half-diagonal)
const SUMO_WHEELBASE   = 0.21;       // matches SumoBotMesh
const SUMO_WHEEL_RAD   = SUMO_WHEEL_R;

function mkSumoPose(x: number, z: number, heading: number) {
  return {
    worldX: x, worldZ: z, worldY: 0, heading,
    pitch: 0, roll: 0,
    worldVY: 0, driftLocalVX: 0, driftLocalVZ: 0,
    leftWheelRot: 0, rightWheelRot: 0,
    motorTargetLeft: 0, motorTargetRight: 0,
    motorLeft: 0, motorRight: 0,
  };
}

/** Wrap an angle to (-π, π]. */
function wrapPi(a: number): number {
  let x = ((a % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  if (x === -Math.PI) x = Math.PI;
  return x;
}

/** Sumo combat phases. Drives the back-and-forth + circling rhythm: bots
 *  charge, lock and grind, recoil briefly, charge again — and after a few
 *  exchanges they back off and circle each other before re-engaging. */
type SumoPhase = 'engage' | 'lock' | 'recoil' | 'circle';

/** Decide motor commands for one sumo bot. Behaviour depends on the
 *  shared phase (so both bots move in sync); strength scales motor
 *  speeds asymmetrically so matches still resolve to a winner. */
function sumoAi(
  me: ReturnType<typeof mkSumoPose>,
  opp: ReturnType<typeof mkSumoPose>,
  strength: number,
  /** +1 (counter-clockwise) or -1 (clockwise) sweep direction in CIRCLE. */
  circleSign: 1 | -1,
  ringRadius: number,
  phase: SumoPhase,
): void {
  const dx = opp.worldX - me.worldX;
  const dz = opp.worldZ - me.worldZ;
  const r  = Math.hypot(me.worldX, me.worldZ);
  const edgeWarn = ringRadius * 0.78;

  // Edge override: if we're hanging off the line, forget the phase plan
  // and pivot toward centre. Better to break formation than fall out.
  if (r > edgeWarn) {
    const target = Math.atan2(me.worldZ, -me.worldX);
    pivotOrDrive(me, target, 0.45, 0.6 * strength);
    return;
  }

  // Target heading: face the opponent (bot-drive heading convention is
  // heading=0 = motion +X, dx = v·cos h, dz = -v·sin h, so heading-to-
  // opp = atan2(-dz, dx)).
  const toOpp = Math.atan2(-dz, dx);

  switch (phase) {
    case 'engage': {
      // Drive at the opponent. Pivot to face them when off-heading,
      // otherwise barrel forward at full speed.
      pivotOrDrive(me, toOpp, 0.5, 0.75 * strength);
      return;
    }
    case 'lock': {
      // Wedges are touching — stop yawing and just push. Heading freezes
      // here, contact stays loaded, the stronger bot's COM creeps forward.
      const drive = 0.78 * strength;
      me.motorTargetLeft  = drive;
      me.motorTargetRight = drive;
      return;
    }
    case 'recoil': {
      // Disengage briefly. Drive backward (motors negative) while still
      // facing the opponent so the next charge starts cleanly.
      const back = -0.55 * strength;
      me.motorTargetLeft  = back;
      me.motorTargetRight = back;
      return;
    }
    case 'circle': {
      // Sweep around the centre at a small radius. Both bots use opposite
      // motor differentials AND opposite sign multipliers so they trace
      // the same world-frame circle (rather than spiralling apart). The
      // wheel imbalance gives the visible "rotating around each other"
      // motion the user asked for.
      const drive = 0.5 * strength;
      const turnBias = 0.20 * strength * circleSign;
      me.motorTargetLeft  = drive - turnBias;
      me.motorTargetRight = drive + turnBias;
      return;
    }
  }
}

/** Helper used by the engage and edge-recovery cases: pivot in place if
 *  the heading is off, drive forward otherwise. Threshold 0.30 rad ≈ 17°. */
function pivotOrDrive(
  me: ReturnType<typeof mkSumoPose>,
  target: number,
  pivotMag: number,
  driveMag: number,
): void {
  const err = wrapPi(target - me.heading);
  if (Math.abs(err) > 0.30) {
    const sign = Math.sign(err);
    me.motorTargetLeft  = -sign * pivotMag;
    me.motorTargetRight =  sign * pivotMag;
  } else {
    me.motorTargetLeft  = driveMag;
    me.motorTargetRight = driveMag;
  }
}

/** Push two sumo bots out of overlap. Position-only correction — both
 *  bots' motor commands keep driving them forward, so the contact stays
 *  loaded as long as both are pushing. Returns true if they were
 *  actually overlapping (used to gate the AI's "freeze heading" behaviour). */
function sumoResolveContact(
  a: ReturnType<typeof mkSumoPose>,
  b: ReturnType<typeof mkSumoPose>,
  radius: number,
): boolean {
  const dx = b.worldX - a.worldX;
  const dz = b.worldZ - a.worldZ;
  const dist = Math.hypot(dx, dz);
  const minDist = radius * 2;
  if (dist >= minDist || dist < 0.0001) return false;
  const nx = dx / dist;
  const nz = dz / dist;
  const pen = minDist - dist;
  // Equal masses → split correction evenly.
  a.worldX -= nx * pen * 0.5;
  a.worldZ -= nz * pen * 0.5;
  b.worldX += nx * pen * 0.5;
  b.worldZ += nz * pen * 0.5;
  return true;
}

/** Keep a bot inside the dohyo. */
function constrainToRing(
  pose: ReturnType<typeof mkSumoPose>,
  ringRadius: number,
  botRadius: number,
): void {
  const r = Math.hypot(pose.worldX, pose.worldZ);
  const limit = ringRadius - botRadius;
  if (r > limit && r > 0.0001) {
    pose.worldX *= limit / r;
    pose.worldZ *= limit / r;
  }
}

export function SumoFight({ ringRadius = 1.2 }: { ringRadius?: number }) {
  const borderRef = useRef<THREE.Mesh>(null);
  const haloRef   = useRef<THREE.PointLight>(null);

  const aGroup = useRef<THREE.Group>(null);
  const aLF = useRef<THREE.Group>(null);
  const aLR = useRef<THREE.Group>(null);
  const aRF = useRef<THREE.Group>(null);
  const aRR = useRef<THREE.Group>(null);

  const bGroup = useRef<THREE.Group>(null);
  const bLF = useRef<THREE.Group>(null);
  const bLR = useRef<THREE.Group>(null);
  const bRF = useRef<THREE.Group>(null);
  const bRR = useRef<THREE.Group>(null);

  // Shared phase state — both bots stay synced so the back-and-forth
  // rhythm reads as a fight rather than two independent AIs drifting.
  const phaseRef     = useRef<SumoPhase>('engage');
  const phaseTimer   = useRef(0);
  const clashCount   = useRef(0);
  // Sweep direction for CIRCLE phase — flipped between cycles so the
  // bots circle clockwise then counter-clockwise.
  const circleSign   = useRef<1 | -1>(1);

  useEffect(() => {
    const ringStart = ringRadius * 0.55;
    // bot-drive heading convention is +X-forward at heading 0; to face
    // -Z (toward opponent on the south side) we need heading = π/2,
    // since cos(π/2) = 0 and -sin(π/2) = -1.
    ensurePose(SUMO_BOT_A, () => mkSumoPose( 0,  ringStart, Math.PI / 2));
    ensurePose(SUMO_BOT_B, () => mkSumoPose( 0, -ringStart, -Math.PI / 2));
    return () => {
      clearPose(SUMO_BOT_A);
      clearPose(SUMO_BOT_B);
    };
  }, [ringRadius]);

  useFrame(({ clock }, dt) => {
    const a = getPose(SUMO_BOT_A);
    const b = getPose(SUMO_BOT_B);
    if (!a || !b) return;

    const dx = b.worldX - a.worldX;
    const dz = b.worldZ - a.worldZ;
    const dist = Math.hypot(dx, dz);
    const inContact = dist < (SUMO_BOT_R * 2 + 0.04);

    // ── Phase machine — bots clash a few times then break to circle each
    // other before re-engaging. Tunable timings:
    //   engage: drive toward opp until contact (no max time)
    //   lock:   grind together; flips to recoil after 1.0s in contact
    //   recoil: brief 0.4s backward push so the next charge has runway
    //   circle: 1.6s of orbiting around centre after every 3 clashes
    phaseTimer.current += dt;
    switch (phaseRef.current) {
      case 'engage':
        if (inContact) { phaseRef.current = 'lock'; phaseTimer.current = 0; }
        break;
      case 'lock':
        if (phaseTimer.current > 1.0 || !inContact) {
          phaseRef.current = 'recoil';
          phaseTimer.current = 0;
          clashCount.current += 1;
        }
        break;
      case 'recoil':
        if (phaseTimer.current > 0.4) {
          if (clashCount.current >= 3) {
            phaseRef.current = 'circle';
            clashCount.current = 0;
            // Alternate sweep direction each cycle for visual variety.
            circleSign.current = (circleSign.current === 1 ? -1 : 1);
          } else {
            phaseRef.current = 'engage';
          }
          phaseTimer.current = 0;
        }
        break;
      case 'circle':
        if (phaseTimer.current > 1.6) {
          phaseRef.current = 'engage';
          phaseTimer.current = 0;
        }
        break;
    }

    // Bot A is "default" (stronger), B is the red-armoured opponent.
    // Opposite circleSign per bot so they sweep the same direction in
    // world space rather than spiralling apart.
    sumoAi(a, b, 1.00,  circleSign.current,            ringRadius, phaseRef.current);
    sumoAi(b, a, 0.94, -circleSign.current as 1 | -1, ringRadius, phaseRef.current);

    // Real bot-drive physics — same integrator the sandbox uses when the
    // kid drives a bot.
    integrateBotPose(a, dt, SUMO_WHEELBASE, SUMO_WHEEL_RAD);
    integrateBotPose(b, dt, SUMO_WHEELBASE, SUMO_WHEEL_RAD);

    // Bot-bot collision and ring constraint.
    sumoResolveContact(a, b, SUMO_BOT_R);
    constrainToRing(a, ringRadius, SUMO_BOT_R);
    constrainToRing(b, ringRadius, SUMO_BOT_R);

    // Mesh updates — group transform from pose, wheels from cumulative rot.
    if (aGroup.current) {
      aGroup.current.position.set(a.worldX, 0, a.worldZ);
      aGroup.current.rotation.y = a.heading;
    }
    if (bGroup.current) {
      bGroup.current.position.set(b.worldX, 0, b.worldZ);
      bGroup.current.rotation.y = b.heading;
    }
    // Wheels: front + rear on each SIDE share that side's wheel rotation.
    if (aLF.current) aLF.current.rotation.z = -a.leftWheelRot;
    if (aLR.current) aLR.current.rotation.z = -a.leftWheelRot;
    if (aRF.current) aRF.current.rotation.z = -a.rightWheelRot;
    if (aRR.current) aRR.current.rotation.z = -a.rightWheelRot;
    if (bLF.current) bLF.current.rotation.z = -b.leftWheelRot;
    if (bLR.current) bLR.current.rotation.z = -b.leftWheelRot;
    if (bRF.current) bRF.current.rotation.z = -b.rightWheelRot;
    if (bRR.current) bRR.current.rotation.z = -b.rightWheelRot;

    // Decorative ring pulse.
    if (borderRef.current) {
      (borderRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.3 + Math.sin(clock.elapsedTime * 1.5) * 0.2;
    }
    if (haloRef.current) {
      haloRef.current.intensity = inContact
        ? 1.4 + Math.sin(clock.elapsedTime * 18) * 0.4   // pulse harder during clash
        : 0.6 + Math.sin(clock.elapsedTime * 1.5) * 0.3;
    }
  });

  return (
    <group>
      {/* Ring */}
      <mesh position={[0, -0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[ringRadius, 64]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.7} />
      </mesh>
      <mesh ref={borderRef} position={[0, -0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ringRadius - 0.06, ringRadius, 64]} />
        <meshStandardMaterial color="#cc0000" emissive="#cc0000" emissiveIntensity={0.3} roughness={0.5} />
      </mesh>
      <pointLight ref={haloRef} position={[0, 0.5, 0]} color="#ff2000" intensity={0.6} distance={3} />

      <group ref={aGroup}>
        <SumoBotMesh wheelRefs={{ leftFront: aLF, leftRear: aLR, rightFront: aRF, rightRear: aRR }} />
      </group>
      <group ref={bGroup}>
        <SumoBotMesh wheelRefs={{ leftFront: bLF, leftRear: bLR, rightFront: bRF, rightRear: bRR }} />
      </group>
    </group>
  );
}

// ─── CONE SLALOM ──────────────────────────────────────────────────────────────
// Five cones in a row at z=0; the bot weaves north/south through the row,
// end to end, ping-ponging.

const CONE_DEFS: { x: number; z: number }[] = [
  { x: -1.20, z: 0 },
  { x: -0.60, z: 0 },
  { x:  0.00, z: 0 },
  { x:  0.60, z: 0 },
  { x:  1.20, z: 0 },
];

// Palindrome — bot weaves entry → exit, then exit → entry, then loops.
// PathBot treats it as a single closed-loop polyline.
const CONE_HALF: [number, number][] = [
  [-1.65,  0.00],   // entry
  [-1.20,  0.45],   // north of cone 1
  [-0.60, -0.45],   // south of cone 2
  [ 0.00,  0.45],   // north of cone 3
  [ 0.60, -0.45],   // south of cone 4
  [ 1.20,  0.45],   // north of cone 5
  [ 1.65,  0.00],   // exit
];
const CONE_PATH: [number, number][] = [
  ...CONE_HALF,
  ...[...CONE_HALF].reverse().slice(1),
];

function StaticCone({ x, z }: { x: number; z: number }) {
  const ref = useRef<THREE.Group>(null);
  // Tiny idle bob so cones don't look like cardboard cutouts.
  const off = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = Math.sin(clock.elapsedTime * 1.4 + off.current) * 0.012;
    }
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 0.016, 16]} />
        <meshStandardMaterial color="#111" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.14, 0]} castShadow>
        <coneGeometry args={[0.06, 0.26, 16]} />
        <meshStandardMaterial color="#ff5500" emissive="#ff3300" emissiveIntensity={0.2} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.03, 16]} />
        <meshStandardMaterial color="#fff" roughness={0.5} />
      </mesh>
    </group>
  );
}

export function ConeRingRun() {
  return (
    <group>
      {CONE_DEFS.map((c, i) => <StaticCone key={i} x={c.x} z={c.z} />)}
      <PathBot
        path={CONE_PATH}
        speed={1.0}
        glowColor="#ff8040"
        glowIntensity={0.5}
      />
    </group>
  );
}

// ─── MAZE ─────────────────────────────────────────────────────────────────────
// Z-shape solve: corridor along the bottom, around the east end of wall 1,
// across the middle corridor, around the west end of wall 2, along the top.
// Walls themselves are rendered by the env in the parent (spark-scene-3d's
// ArenaProps).

// Z-shape solve forward then back. Polyline → sharp corners but the bot
// stays in the corridor (waypoints at ±1.20 leave 0.30m of clearance to
// the outer-wall AABB at ±1.50, which is plenty even with the 0.11m
// chassis half-width).
const MAZE_HALF: [number, number][] = [
  [-1.20, -1.20],
  [ 1.20, -1.20],
  [ 1.20,  0.00],
  [-1.20,  0.00],
  [-1.20,  1.20],
  [ 1.20,  1.20],
];
const MAZE_PATH: [number, number][] = [
  ...MAZE_HALF,
  ...[...MAZE_HALF].reverse().slice(1),
];

export function MazeRun() {
  return (
    <PathBot
      path={MAZE_PATH}
      speed={1.1}
      glowColor="#00cc44"
      glowIntensity={0.5}
    />
  );
}

// ─── WAYPOINT CHASE ───────────────────────────────────────────────────────────
// Five waypoints, straight-segment polyline, dashed cyan trajectory line —
// matches the marketing site's WaypointsScene which the user explicitly
// likes. The bot drives a pentagon-shaped tour with sharp heading changes
// at each corner; the dashed line is the same straight segments the bot
// follows so the line and the trajectory always agree.

const WAYPOINT_NODES: [number, number][] = [
  [-1.20, -1.00],
  [ 0.20, -1.50],
  [ 1.40, -0.20],
  [ 0.80,  1.20],
  [-0.60,  1.00],
];
const WAYPOINT_PATH: [number, number][] = [
  ...WAYPOINT_NODES,
  WAYPOINT_NODES[0]!,   // close the loop
];
const WAYPOINT_LINE: [number, number, number][] = WAYPOINT_PATH.map(
  ([x, z]) => [x, 0.005, z],
);

export function WaypointChase() {
  return (
    <group>
      <Line
        points={WAYPOINT_LINE}
        color="#5de4ff"
        lineWidth={2}
        dashed
        dashSize={0.06}
        gapSize={0.04}
      />
      <PathBot
        path={WAYPOINT_PATH}
        speed={1.0}
        glowColor="#5de4ff"
        glowIntensity={0.5}
      />
    </group>
  );
}

// ─── CIRCLE / TRIG DANCE ──────────────────────────────────────────────────────
// Lissajous-ish closed curve. Generated as a polyline so PathBot can drive
// it with the same machinery as the other sims.

const TRAIL_LEN = 40;
const CIRCLE_PATH: [number, number][] = (() => {
  const pts: [number, number][] = [];
  const N = 80;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const r = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2));
    pts.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  return pts;
})();

export function CircleDance() {
  const trailMeshes = useMemo(() =>
    Array.from({ length: TRAIL_LEN }, (_, i) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 6, 4),
        new THREE.MeshStandardMaterial({
          color: '#7040ff',
          emissive: new THREE.Color('#7040ff'),
          emissiveIntensity: 0.6,
          transparent: true,
          opacity: (i / TRAIL_LEN) * 0.7,
        }),
      );
      mesh.visible = false;
      return mesh;
    }),
  []);

  // Trail ring buffer — re-uses the same N spheres, repositioning the
  // oldest each frame to the bot's current spot. We can't easily get the
  // bot pose from PathBot here, so we run a parallel polyline lookup.
  const idx = useRef(0);
  const t = useRef(0);
  useFrame((_, delta) => {
    t.current = (t.current + delta * 0.4) % 1;
    let total = 0;
    const lens: number[] = [];
    for (let i = 0; i < CIRCLE_PATH.length; i++) {
      const next = (i + 1) % CIRCLE_PATH.length;
      const len = Math.hypot(CIRCLE_PATH[next]![0] - CIRCLE_PATH[i]![0], CIRCLE_PATH[next]![1] - CIRCLE_PATH[i]![1]);
      lens.push(len);
      total += len;
    }
    if (total < 0.001) return;
    const target = t.current * total;
    let w = 0;
    let s = 0;
    for (; s < lens.length; s++) {
      if (w + lens[s]! >= target) break;
      w += lens[s]!;
    }
    s = Math.min(s, lens.length - 1);
    const f = lens[s]! > 0.0001 ? (target - w) / lens[s]! : 0;
    const a = CIRCLE_PATH[s]!;
    const b = CIRCLE_PATH[(s + 1) % CIRCLE_PATH.length]!;
    const x = a[0] + (b[0] - a[0]) * f;
    const z = a[1] + (b[1] - a[1]) * f;

    const mesh = trailMeshes[idx.current];
    if (mesh) {
      mesh.position.set(x, 0.04, z);
      mesh.visible = true;
    }
    idx.current = (idx.current + 1) % TRAIL_LEN;
  });

  return (
    <>
      {trailMeshes.map((m, i) => <primitive key={i} object={m} />)}
      <PathBot
        path={CIRCLE_PATH}
        speed={1.2}
        glowColor="#7040ff"
        glowIntensity={0.6}
      />
    </>
  );
}

// ─── PID APPROACH ─────────────────────────────────────────────────────────────
// Simple back-and-forth between a start point and the target, demonstrating
// approach + recoil. Replaces the earlier PID controller — the visual is
// the same but the motion comes from the standard path animator.

const PID_PATH: [number, number][] = [
  [-1.0, 0.0],
  [ 0.78, 0.0],   // target — sit just shy of the marker
  [-1.0, 0.0],
];

export function PIDApproach() {
  return (
    <group>
      {/* Target marker */}
      <mesh position={[0.8, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.06, 0.10, 32]} />
        <meshStandardMaterial color="#ff6020" emissive="#ff6020" emissiveIntensity={0.6} />
      </mesh>
      <PathBot
        path={PID_PATH}
        speed={0.9}
        glowColor="#ff6020"
        glowIntensity={0.5}
      />
    </group>
  );
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export function ChallengeSim({ mode, sumoRingRadius = 1.2 }: { mode: SimMode; sumoRingRadius?: number }) {
  if (mode === 'sumo')         return <SumoFight ringRadius={sumoRingRadius} />;
  if (mode === 'cone-ring')    return <ConeRingRun />;
  if (mode === 'maze')         return <MazeRun />;
  if (mode === 'waypoint')     return <WaypointChase />;
  if (mode === 'circle-dance') return <CircleDance />;
  if (mode === 'pid-approach') return <PIDApproach />;
  return null;
}
