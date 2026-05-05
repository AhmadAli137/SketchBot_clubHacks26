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
  path: [number, number][];
  /** m/s along the polyline. Real classroom mini-bots cruise around 0.5
   *  m/s; the sims look right at 0.8–1.2 for visibility. */
  speed?: number;
  /** When true, the bot reverses direction at each endpoint and traces
   *  the polyline back to the start. When false, the polyline is treated
   *  as a closed loop (last point connects to first). */
  pingPong?: boolean;
  variant?: 'mini' | 'sumo';
  /** Initial heading (radians). Snaps to the first segment's tangent on
   *  the next frame; this just avoids a one-frame visible reorient. */
  initialHeading?: number;
  glowColor?: string;
  /** Multiplier on the under-chassis pointlight intensity. */
  glowIntensity?: number;
};

function PathBot({
  path,
  speed = 1.0,
  pingPong = false,
  variant = 'mini',
  initialHeading = 0,
  glowColor,
  glowIntensity = 0.4,
}: PathBotProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Mini: 2 wheel refs. Sumo: 4 (2WD logic — both wheels on a side spin
  // in lockstep, but they're each their own group so they spin in place).
  const lWheel = useRef<THREE.Group>(null);
  const rWheel = useRef<THREE.Group>(null);
  const lFront = useRef<THREE.Group>(null);
  const lRear  = useRef<THREE.Group>(null);
  const rFront = useRef<THREE.Group>(null);
  const rRear  = useRef<THREE.Group>(null);

  const wheelR = variant === 'sumo' ? SUMO_WHEEL_R : MINI_WHEEL_R;

  // Catmull-Rom curve through the waypoints. This is what makes corners
  // smooth: the curve passes through every waypoint but bends gently into
  // and out of each one instead of forming a sharp angle. Tension 0.5 is
  // the default centripetal tension — gives organic-looking arcs without
  // overshooting outside the waypoint polygon.
  const curve = useMemo(() => {
    const pts = path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    return new THREE.CatmullRomCurve3(pts, /* closed */ !pingPong, 'catmullrom', 0.5);
  }, [path, pingPong]);
  const totalLength = useMemo(() => curve.getLength(), [curve]);

  const tRef       = useRef(0);          // 0..1 along the curve
  const dirRef     = useRef(1);          // +1 forward, -1 reverse (ping-pong only)
  const headingRef = useRef(initialHeading);
  const lastPos    = useRef<[number, number]>([path[0]![0], path[0]![1]]);

  useFrame((_, delta) => {
    if (!groupRef.current || totalLength < 0.001) return;

    const ds = (speed * delta * dirRef.current) / totalLength;
    tRef.current += ds;
    if (pingPong) {
      if (tRef.current >= 1) { tRef.current = 1; dirRef.current = -1; }
      else if (tRef.current <= 0) { tRef.current = 0; dirRef.current = 1; }
    } else {
      tRef.current = ((tRef.current % 1) + 1) % 1;
    }

    // getPointAt / getTangentAt use ARC-LENGTH parameterisation so the
    // bot's speed along the curve is constant regardless of segment
    // tension. getPoint / getTangent would give parameter-uniform speed,
    // which slows down on tight bends and speeds up on straight runs —
    // looks unnatural.
    const u = tRef.current;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);

    // Reverse the tangent on ping-pong return legs so the bot's heading
    // tracks its motion direction (which is now -tangent).
    const sign = dirRef.current;
    const tx = tan.x * sign;
    const tz = tan.z * sign;
    if (Math.abs(tx) + Math.abs(tz) > 0.001) {
      headingRef.current = Math.atan2(tx, tz) - Math.PI / 2;
    }

    groupRef.current.position.set(p.x, 0, p.z);
    groupRef.current.rotation.y = headingRef.current;

    // Wheel roll = actual travel / wheel radius.
    const travel = Math.hypot(p.x - lastPos.current[0], p.z - lastPos.current[1]);
    const rollDelta = travel / wheelR;
    if (variant === 'sumo') {
      for (const r of [lFront, lRear, rFront, rRear]) {
        if (r.current) r.current.rotation.z -= rollDelta;
      }
    } else {
      if (lWheel.current) lWheel.current.rotation.z -= rollDelta;
      if (rWheel.current) rWheel.current.rotation.z -= rollDelta;
    }
    lastPos.current = [p.x, p.z];
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

/** Sample a Catmull-Rom curve through the given path so we can render a
 *  dashed line that matches the trajectory the bot actually follows. */
function curvePolyline(
  path: [number, number][],
  closed: boolean,
  samples: number,
  yLift = 0.005,
): [number, number, number][] {
  if (path.length < 2) return [];
  const curve = new THREE.CatmullRomCurve3(
    path.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    closed,
    'catmullrom',
    0.5,
  );
  const pts: [number, number, number][] = [];
  const n = closed ? samples : samples + 1;
  for (let i = 0; i < n; i++) {
    const u = (i / samples) % 1;
    const v = curve.getPointAt(closed ? u : Math.min(u, 1));
    pts.push([v.x, yLift, v.z]);
  }
  if (closed) pts.push(pts[0]!);
  return pts;
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

/** Decide motor commands for one sumo bot given its own pose, the
 *  opponent's pose, and a "strength" (default-bot uses 1.0, opp 0.92 so
 *  matches resolve in finite time). The AI is intentionally simple:
 *  - If we're too close to the ring edge, pivot to face centre and drive.
 *  - Otherwise, pivot to face the opponent and drive forward.
 *  - While in contact, freeze the heading update so the wedge stays
 *    engaged instead of yawing off-axis. */
function sumoAi(
  me: ReturnType<typeof mkSumoPose>,
  opp: ReturnType<typeof mkSumoPose>,
  strength: number,
  ringRadius: number,
  inContact: boolean,
): void {
  const dx = opp.worldX - me.worldX;
  const dz = opp.worldZ - me.worldZ;
  const r  = Math.hypot(me.worldX, me.worldZ);
  const edgeWarn = ringRadius * 0.78;

  // Target heading: bot-drive convention is heading=0 = motion +X, with
  // dx = v·cos(h), dz = -v·sin(h), so to drive toward (tx, tz) the
  // heading is atan2(-dz, dx).
  const target = r > edgeWarn
    ? Math.atan2(-(-me.worldZ), -me.worldX)   // face centre
    : Math.atan2(-dz, dx);                    // face opponent
  const err = wrapPi(target - me.heading);

  // While the wedge is engaged with the opponent, freeze the heading
  // adjustment — otherwise the AI happily yaws the bot toward the opp's
  // current position every frame and torques it sideways out of contact.
  if (inContact) {
    const drive = 0.55 * strength;
    me.motorTargetLeft  = drive;
    me.motorTargetRight = drive;
    return;
  }

  // Out of contact: drive forward when sufficiently aligned, pivot in
  // place otherwise. The pivot-vs-drive threshold is generous so the bot
  // doesn't waste a long time aiming.
  if (Math.abs(err) > 0.30) {
    const sign = Math.sign(err);
    const pivot = 0.45 * strength;
    me.motorTargetLeft  = -sign * pivot;
    me.motorTargetRight =  sign * pivot;
  } else {
    const drive = 0.7 * strength;
    me.motorTargetLeft  = drive;
    me.motorTargetRight = drive;
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

  useEffect(() => {
    const ringStart = ringRadius * 0.55;
    // Bot A starts north of centre facing south. Heading π means motion
    // direction = (cos π, -sin π) = (-1, 0) — wait, that's -X not -Z.
    // The bot-drive heading convention is +X-forward at heading 0; to face
    // -Z we need heading = π/2 (since cos(π/2)=0, -sin(π/2)=-1 gives -Z).
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

    // Detect contact BEFORE this frame's AI / integrate so the AI can
    // freeze heading while the wedges are engaged.
    const dx = b.worldX - a.worldX;
    const dz = b.worldZ - a.worldZ;
    const dist = Math.hypot(dx, dz);
    const inContact = dist < (SUMO_BOT_R * 2 + 0.04);

    // AI (bot A is the "default" stronger bot, B is the red-armoured opp)
    sumoAi(a, b, 1.0,  ringRadius, inContact);
    sumoAi(b, a, 0.92, ringRadius, inContact);

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
    for (const r of [aLF, aLR, aRF, aRR]) {
      if (r.current) r.current.rotation.z = -a.leftWheelRot;
    }
    // Right side uses rightWheelRot — but applying same value to all 4
    // wheels would double-roll when bot turns. Instead split: front/rear
    // pair on each side both track that side's wheel rotation.
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

const CONE_PATH: [number, number][] = [
  [-1.65,  0.00],   // entry
  [-1.20,  0.45],   // north of cone 1
  [-0.60, -0.45],   // south of cone 2
  [ 0.00,  0.45],   // north of cone 3
  [ 0.60, -0.45],   // south of cone 4
  [ 1.20,  0.45],   // north of cone 5
  [ 1.65,  0.00],   // exit
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
        pingPong
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

const MAZE_PATH: [number, number][] = [
  [-1.27, -1.27],
  [ 1.27, -1.27],
  [ 1.27,  0.00],
  [-1.27,  0.00],
  [-1.27,  1.27],
  [ 1.27,  1.27],
];

export function MazeRun() {
  return (
    <PathBot
      path={MAZE_PATH}
      speed={1.1}
      pingPong
      glowColor="#00cc44"
      glowIntensity={0.5}
    />
  );
}

// ─── WAYPOINT CHASE ───────────────────────────────────────────────────────────
// Closed loop through five colour-coded waypoints (rendered by env).

const WAYPOINT_PATH: [number, number][] = [
  [-1.0, -0.8],
  [ 0.2, -1.0],
  [ 1.0, -0.2],
  [ 0.6,  0.8],
  [-0.5,  0.9],
];

export function WaypointChase() {
  // Sample the same Catmull-Rom curve the bot follows so the dashed glow
  // line traces the actual path through the waypoints rather than just
  // straight segments. The bot's body sits right on top of the line.
  const linePoints = useMemo(() => curvePolyline(WAYPOINT_PATH, true, 96), []);
  return (
    <group>
      <Line
        points={linePoints}
        color="#5de4ff"
        lineWidth={2.5}
        dashed
        dashSize={0.07}
        gapSize={0.045}
        transparent
        opacity={0.85}
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
        pingPong
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
