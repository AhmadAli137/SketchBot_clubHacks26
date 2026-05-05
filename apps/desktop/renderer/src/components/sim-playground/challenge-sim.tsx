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

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { SparkMiniBotMesh, SumoBotMesh } from './bot-meshes';

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

  const tRef       = useRef(0);          // 0..1 along the polyline
  const dirRef     = useRef(1);          // +1 forward, -1 reverse (ping-pong)
  const headingRef = useRef(initialHeading);
  const lastPos    = useRef<[number, number]>([path[0]![0], path[0]![1]]);

  // Cache segment lengths once. Path is a const-shaped array per sim.
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
    if (!groupRef.current) return;
    if (path.length < 2 || segMetrics.total < 0.001) return;

    const ds = (speed * delta * dirRef.current) / segMetrics.total;
    tRef.current += ds;
    if (pingPong) {
      if (tRef.current >= 1) { tRef.current = 1; dirRef.current = -1; }
      else if (tRef.current <= 0) { tRef.current = 0; dirRef.current = 1; }
    } else {
      tRef.current = ((tRef.current % 1) + 1) % 1;
    }

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

    // Heading from segment tangent. dirRef flips on reverse legs so the
    // bot drives FORWARD when ping-ponging back.
    const tx = (b[0] - a[0]) * dirRef.current;
    const tz = (b[1] - a[1]) * dirRef.current;
    if (Math.abs(tx) + Math.abs(tz) > 0.001) {
      headingRef.current = Math.atan2(tx, tz) - Math.PI / 2;
    }

    groupRef.current.position.set(nx, 0, nz);
    groupRef.current.rotation.y = headingRef.current;

    // Wheel roll = actual travel / wheel radius.
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
// Two bots animate toward the centre, "lock" briefly with their wedges
// touching while a small grind oscillation plays, then retreat to start.
// This is choreography, not AI — the sumo concept is "two bots clash" and
// the visual sells that better with deterministic timing than with
// physics-driven jostling.
//
// Path coordinates are in (x, z). Both bots ride the z-axis: A starts at
// +z and faces -z (driving toward origin); B mirrors. When |z| = 0.21,
// the wedge tips meet at z=0 (chassis half-extent 0.110 + wedge 0.080 +
// small slop ≈ 0.21).

const SUMO_A_PATH: [number, number][] = [
  [0,  0.85],   // start, north of ring
  [0,  0.21],   // close to centre — wedges meet
  [0,  0.30],   // grind oscillation: brief retreat
  [0,  0.21],   // press in
  [0,  0.30],   // brief retreat
  [0,  0.21],   // press in
  [0, -0.10],   // shove south through "B" position
  [0,  0.85],   // retreat to start
];
const SUMO_B_PATH: [number, number][] = [
  [0, -0.85],
  [0, -0.21],
  [0, -0.30],
  [0, -0.21],
  [0, -0.30],
  [0, -0.21],
  [0,  0.10],   // gets shoved north past origin
  [0, -0.85],
];

export function SumoFight({ ringRadius = 1.2 }: { ringRadius?: number }) {
  const borderRef = useRef<THREE.Mesh>(null);
  const glowRef   = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (borderRef.current) {
      (borderRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.3 + Math.sin(clock.elapsedTime * 1.5) * 0.2;
    }
    if (glowRef.current) {
      glowRef.current.intensity = 0.6 + Math.sin(clock.elapsedTime * 1.5) * 0.3;
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
      <pointLight ref={glowRef} position={[0, 0.5, 0]} color="#ff2000" intensity={0.6} distance={3} />

      <PathBot
        path={SUMO_A_PATH}
        speed={0.9}
        pingPong
        variant="sumo"
        initialHeading={-Math.PI / 2}
      />
      <PathBot
        path={SUMO_B_PATH}
        speed={0.9}
        pingPong
        variant="sumo"
        initialHeading={Math.PI / 2}
      />
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
  return (
    <PathBot
      path={WAYPOINT_PATH}
      speed={1.0}
      glowColor="#5de4ff"
      glowIntensity={0.5}
    />
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
