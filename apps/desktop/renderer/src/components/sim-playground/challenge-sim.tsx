'use client';

/**
 * ChallengeSimulation — autonomous 3D robot simulations per concept.
 * Each concept gets a completely different robot behaviour, not just a drawing robot.
 *
 * Drawing robot (RobotGantry) is only used for geometry-drawing and coord-systems.
 * All other concepts get concept-appropriate motion with useFrame animations.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── Which sim mode for each concept ─────────────────────────────────────────

export type SimMode =
  | 'drawing'       // RobotGantry + paper (default for drawing concepts)
  | 'sumo'          // Two robots fighting on ring
  | 'cone-ring'     // Robot weaving between cones
  | 'maze'          // Robot navigating maze walls
  | 'waypoint'      // Robot visiting waypoints in sequence
  | 'circle-dance'  // Robot driving sine/circle curves
  | 'pid-approach'; // Robot oscillating toward target (PID visualization)

export function getSimMode(conceptId: string | null | undefined): SimMode {
  switch (conceptId) {
    case 'sumo-arena': return 'sumo';
    case 'cone-ring-gauntlet': return 'cone-ring';
    case 'maze-marathon': return 'maze';
    case 'path-planning': return 'waypoint';
    case 'trigonometry-motion': return 'circle-dance';
    case 'control-theory': return 'pid-approach';
    // Drawing concepts use the standard RobotGantry
    case 'geometry-drawing':
    case 'coord-systems':
    default:
      return 'drawing';
  }
}

// ─── Shared materials ─────────────────────────────────────────────────────────

const mkMat = (color: string, emissive?: string, roughness = 0.65, metalness = 0.2) =>
  new THREE.MeshStandardMaterial({
    color, roughness, metalness,
    emissive: emissive ? new THREE.Color(emissive) : undefined,
    emissiveIntensity: emissive ? 0.25 : 0,
  });

const CHASSIS_MAT = mkMat('#1a1a22');
const ACCENT_MAT = mkMat('#1e3a48', '#2a6080', 0.45, 0.35);
const WHEEL_RUBBER = mkMat('#1c1c1c', undefined, 0.92, 0.05);
const WHEEL_HUB_DEFAULT = mkMat('#f5c800', undefined, 0.55, 0.15);
const WHEEL_HUB_RED = mkMat('#ff2040', undefined, 0.55, 0.15);
const WHEEL_HUB_BLUE = mkMat('#2060ff', undefined, 0.55, 0.15);
const CASTER_MAT = mkMat('#c8d0dc', undefined, 0.12, 0.9);
const MOTOR_MAT = mkMat('#c8c8d0', undefined, 0.4, 0.7);

// Sumo-specific: heavy ramming plate
const SUMO_RAM_MAT = mkMat('#222230', '#3030a0', 0.5, 0.6);
const SUMO_SCRAPE_MAT = mkMat('#888898', undefined, 0.3, 0.8);

// Maze-specific: sensor arms
const SENSOR_ARM_MAT = mkMat('#102818', '#005520', 0.6, 0.3);
const SENSOR_TIP_MAT = new THREE.MeshStandardMaterial({
  color: '#00ff66', emissive: new THREE.Color('#00ff66'), emissiveIntensity: 0.9,
  roughness: 0.2,
});

const S = 0.25; // same scale factor as RobotGantry

// ─── Wheel component ──────────────────────────────────────────────────────────

function Wheel({ side, hubMat = WHEEL_HUB_DEFAULT }: { side: 1 | -1; hubMat?: THREE.Material }) {
  return (
    <group position={[side * 0.78 * S, 0.28 * S, 0.15 * S]}>
      <mesh rotation={[0, 0, Math.PI / 2]} material={WHEEL_RUBBER} castShadow>
        <cylinderGeometry args={[0.28 * S, 0.28 * S, 0.10 * S, 20]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} material={hubMat} castShadow>
        <cylinderGeometry args={[0.14 * S, 0.14 * S, 0.06 * S, 14]} />
      </mesh>
      <mesh position={[side * 0.09 * S, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={MOTOR_MAT}>
        <cylinderGeometry args={[0.10 * S, 0.10 * S, 0.14 * S, 12]} />
      </mesh>
    </group>
  );
}

// ─── Competition differential-drive bot (no pen arm) ─────────────────────────

type BotVariant = 'standard' | 'sumo' | 'maze-scout';

function DifferentialBot({
  color = 'default',
  variant = 'standard',
  wheelRotRef,
  glowRef,
}: {
  color?: 'default' | 'red' | 'blue';
  variant?: BotVariant;
  wheelRotRef?: React.RefObject<{ l: number; r: number }>;
  glowRef?: React.RefObject<THREE.PointLight | null>;
}) {
  const hubMat = color === 'red' ? WHEEL_HUB_RED : color === 'blue' ? WHEEL_HUB_BLUE : WHEEL_HUB_DEFAULT;
  const glowColor = color === 'red' ? '#ff4060' : color === 'blue' ? '#4080ff' : '#5de4ff';

  return (
    <group>
      {/* Chassis */}
      <mesh
        position={[0, 0.35 * S, 0]}
        material={variant === 'sumo' ? SUMO_RAM_MAT : CHASSIS_MAT}
        castShadow receiveShadow
      >
        <boxGeometry args={[
          variant === 'sumo' ? 1.8 * S : 1.5 * S,
          variant === 'sumo' ? 0.26 * S : 0.22 * S,
          variant === 'sumo' ? 1.5 * S : 1.2 * S,
        ]} />
      </mesh>

      {/* Accent top stripe */}
      <mesh position={[0, (0.35 + 0.11 + 0.006) * S, 0]} material={ACCENT_MAT} castShadow>
        <boxGeometry args={[
          variant === 'sumo' ? 1.82 * S : 1.52 * S,
          0.012 * S,
          variant === 'sumo' ? 1.52 * S : 1.22 * S,
        ]} />
      </mesh>

      {/* Sumo ramming plate (front wedge) */}
      {variant === 'sumo' && (
        <>
          <mesh position={[0, 0.18 * S, -0.85 * S]} material={SUMO_SCRAPE_MAT} castShadow>
            <boxGeometry args={[1.7 * S, 0.08 * S, 0.22 * S]} />
          </mesh>
          {/* Angled front wedge */}
          <mesh position={[0, 0.09 * S, -0.72 * S]} rotation={[0.35, 0, 0]} material={SUMO_RAM_MAT}>
            <boxGeometry args={[1.6 * S, 0.05 * S, 0.28 * S]} />
          </mesh>
        </>
      )}

      {/* Maze scout sensor arms */}
      {variant === 'maze-scout' && (
        <>
          {/* Left arm */}
          <group position={[-0.72 * S, 0.42 * S, -0.4 * S]} rotation={[0, -0.6, 0]}>
            <mesh material={SENSOR_ARM_MAT}>
              <boxGeometry args={[0.04 * S, 0.04 * S, 0.5 * S]} />
            </mesh>
            <mesh position={[0, 0, -0.28 * S]} material={SENSOR_TIP_MAT}>
              <sphereGeometry args={[0.04 * S, 8, 6]} />
            </mesh>
            <pointLight position={[0, 0, -0.3 * S]} color="#00ff66" intensity={0.4} distance={0.3} />
          </group>
          {/* Right arm */}
          <group position={[0.72 * S, 0.42 * S, -0.4 * S]} rotation={[0, 0.6, 0]}>
            <mesh material={SENSOR_ARM_MAT}>
              <boxGeometry args={[0.04 * S, 0.04 * S, 0.5 * S]} />
            </mesh>
            <mesh position={[0, 0, -0.28 * S]} material={SENSOR_TIP_MAT}>
              <sphereGeometry args={[0.04 * S, 8, 6]} />
            </mesh>
            <pointLight position={[0, 0, -0.3 * S]} color="#00ff66" intensity={0.4} distance={0.3} />
          </group>
        </>
      )}

      {/* Bottom plate */}
      <mesh position={[0, 0.15 * S, 0]} material={CHASSIS_MAT}>
        <boxGeometry args={[1.4 * S, 0.04 * S, 1.1 * S]} />
      </mesh>

      {/* Wheels */}
      <Wheel side={-1} hubMat={hubMat} />
      <Wheel side={1} hubMat={hubMat} />

      {/* Front caster */}
      <group position={[0, 0.10 * S, -0.50 * S]}>
        <mesh material={CHASSIS_MAT}>
          <boxGeometry args={[0.18 * S, 0.10 * S, 0.14 * S]} />
        </mesh>
        <mesh position={[0, -0.06 * S, 0]} material={CASTER_MAT}>
          <sphereGeometry args={[0.08 * S, 14, 10]} />
        </mesh>
      </group>

      {/* Glow point light under chassis */}
      <pointLight ref={glowRef} position={[0, 0.05, 0]} color={glowColor} intensity={0.4} distance={0.7} decay={2} />
    </group>
  );
}

// ─── SUMO FIGHT ───────────────────────────────────────────────────────────────

export function SumoFight({ ringRadius = 1.2 }: { ringRadius?: number }) {
  const botRef = useRef<THREE.Group>(null);
  const oppRef = useRef<THREE.Group>(null);
  const glowA = useRef<THREE.PointLight>(null);
  const glowB = useRef<THREE.PointLight>(null);
  // State machine: 0=orbit, 1=charge, 2=clinch, 3=retreat
  const stateRef = useRef(0);
  const timerRef = useRef(0);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    timerRef.current += dt;

    // State transitions
    if (stateRef.current === 0 && timerRef.current > 2.5 + Math.sin(t * 0.3) * 1) {
      stateRef.current = 1; timerRef.current = 0; // orbit → charge
    } else if (stateRef.current === 1 && timerRef.current > 0.6) {
      stateRef.current = 2; timerRef.current = 0; // charge → clinch
    } else if (stateRef.current === 2 && timerRef.current > 0.9) {
      stateRef.current = 3; timerRef.current = 0; // clinch → retreat
    } else if (stateRef.current === 3 && timerRef.current > 0.7) {
      stateRef.current = 0; timerRef.current = 0; // retreat → orbit
    }

    const phase = stateRef.current;

    // Player bot position (yellow)
    let bx = 0, bz = 0, bAngle = 0;
    if (phase === 0) {
      const a = t * 0.9;
      bx = Math.cos(a) * (ringRadius * 0.62);
      bz = Math.sin(a) * (ringRadius * 0.62);
      bAngle = -a + Math.PI / 2;
    } else if (phase === 1) {
      const chargeT = Math.min(timerRef.current / 0.6, 1);
      bx = THREE.MathUtils.lerp(Math.cos(t * 0.9) * ringRadius * 0.62, 0, chargeT);
      bz = THREE.MathUtils.lerp(Math.sin(t * 0.9) * ringRadius * 0.62, 0, chargeT);
      bAngle = Math.atan2(-bz, -bx) + Math.PI;
    } else if (phase === 2) {
      bx = Math.sin(timerRef.current * 3) * 0.04;
      bz = -Math.abs(Math.sin(timerRef.current * 5)) * 0.08;
      bAngle = 0;
    } else {
      const retreatT = Math.min(timerRef.current / 0.7, 1);
      bx = THREE.MathUtils.lerp(0, -Math.cos(t * 0.9) * ringRadius * 0.6, retreatT);
      bz = THREE.MathUtils.lerp(0, -Math.sin(t * 0.9) * ringRadius * 0.6, retreatT);
      bAngle = Math.PI;
    }

    // Opponent bot (red) — orbits opposite, pauses during clinch
    let ox = 0, oz = 0, oAngle = 0;
    const oppA = t * 0.7 + Math.PI + Math.sin(t * 0.4) * 0.3;
    if (phase <= 1) {
      ox = Math.cos(oppA) * (ringRadius * 0.58);
      oz = Math.sin(oppA) * (ringRadius * 0.58);
      oAngle = -oppA + Math.PI / 2;
    } else if (phase === 2) {
      ox = Math.sin(timerRef.current * 3 + Math.PI) * 0.04;
      oz = 0.06 + Math.sin(timerRef.current * 4) * 0.03;
      oAngle = Math.PI;
    } else {
      ox = Math.cos(oppA) * (ringRadius * 0.55);
      oz = Math.sin(oppA) * (ringRadius * 0.55);
      oAngle = -oppA + Math.PI / 2;
    }

    if (botRef.current) {
      botRef.current.position.set(bx, 0, bz);
      botRef.current.rotation.y = bAngle;
    }
    if (oppRef.current) {
      oppRef.current.position.set(ox, 0, oz);
      oppRef.current.rotation.y = oAngle;
    }

    // Pulse glow during charge
    const chargeIntensity = phase === 1 ? 1.2 + Math.sin(t * 20) * 0.4 : 0.4;
    if (glowA.current) glowA.current.intensity = chargeIntensity;
    if (glowB.current) glowB.current.intensity = phase === 2 ? 0.8 + Math.sin(t * 15) * 0.3 : 0.4;
  });

  return (
    <group>
      <group ref={botRef}>
        <DifferentialBot color="default" variant="sumo" glowRef={glowA} />
      </group>
      <group ref={oppRef}>
        <DifferentialBot color="red" variant="sumo" glowRef={glowB} />
      </group>
    </group>
  );
}

// ─── CONE RING RUN ────────────────────────────────────────────────────────────

export function ConeRingRun() {
  const botRef = useRef<THREE.Group>(null);
  const trailRefs = useRef<THREE.Mesh[]>([]);

  // Pre-compute a figure-8 weaving path through inner + outer cones
  const path = useMemo(() => {
    const pts: [number, number][] = [];
    const outerR = 1.15;
    const innerR = 0.6;
    for (let i = 0; i <= 360; i += 3) {
      const angle = (i / 360) * Math.PI * 2;
      // Weave between outer and inner by alternating based on cone count (8 outer, 4 inner)
      const wave = Math.sin(angle * 6) * 0.25;
      const r = THREE.MathUtils.lerp(innerR + 0.1, outerR - 0.1, (wave + 0.25) / 0.5 + 0.15);
      pts.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    }
    return pts;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.4; // lap speed
    const idx = Math.floor((t % 1) * path.length) % path.length;
    const nextIdx = (idx + 1) % path.length;
    const frac = ((t % 1) * path.length) % 1;

    const x = THREE.MathUtils.lerp(path[idx][0], path[nextIdx][0], frac);
    const z = THREE.MathUtils.lerp(path[idx][1], path[nextIdx][1], frac);

    const nx = path[nextIdx][0] - path[idx][0];
    const nz = path[nextIdx][1] - path[idx][1];
    const heading = Math.atan2(nx, nz);

    if (botRef.current) {
      botRef.current.position.set(x, 0, z);
      botRef.current.rotation.y = heading;
    }
  });

  return (
    <group ref={botRef}>
      <DifferentialBot color="default" variant="standard" />
    </group>
  );
}

// ─── MAZE RUN ─────────────────────────────────────────────────────────────────

const MAZE_PATH: [number, number][] = [
  [-1.1, -1.1],
  [-1.1, -0.3],
  [-0.3, -0.3],
  [-0.3, 0.3],
  [0.3, 0.3],
  [0.3, -0.6],
  [0.8, -0.6],
  [0.8, 0.9],
  [0, 0.9],
  [0, 1.1],
  [1.1, 1.1],
];

export function MazeRun() {
  const botRef = useRef<THREE.Group>(null);
  const sensorL = useRef<THREE.PointLight>(null);
  const sensorR = useRef<THREE.PointLight>(null);
  const segRef = useRef(0);
  const segTRef = useRef(0);

  useFrame(({ clock }, dt) => {
    const speed = 0.55; // units/sec
    segTRef.current += dt * speed;
    const seg = segRef.current;
    const from = MAZE_PATH[seg];
    const to = MAZE_PATH[(seg + 1) % MAZE_PATH.length];
    const segLen = Math.hypot(to[0] - from[0], to[1] - from[1]);

    if (segTRef.current >= segLen) {
      segTRef.current -= segLen;
      segRef.current = (seg + 1) % MAZE_PATH.length;
    }

    const pct = Math.min(segTRef.current / segLen, 1);
    const x = THREE.MathUtils.lerp(from[0], to[0], pct);
    const z = THREE.MathUtils.lerp(from[1], to[1], pct);
    const heading = Math.atan2(to[0] - from[0], to[1] - from[1]);

    if (botRef.current) {
      botRef.current.position.set(x, 0, z);
      botRef.current.rotation.y = heading;
    }

    // Pulse sensor lights
    const t = clock.elapsedTime;
    if (sensorL.current) sensorL.current.intensity = 0.5 + Math.sin(t * 4) * 0.2;
    if (sensorR.current) sensorR.current.intensity = 0.5 + Math.sin(t * 4 + Math.PI) * 0.2;
  });

  return (
    <group ref={botRef}>
      <DifferentialBot color="blue" variant="maze-scout" />
      {/* Extra sensor glow point lights */}
      <pointLight ref={sensorL} position={[-0.18, 0.12, -0.18]} color="#00ff66" intensity={0.5} distance={0.4} />
      <pointLight ref={sensorR} position={[0.18, 0.12, -0.18]} color="#00ff66" intensity={0.5} distance={0.4} />
    </group>
  );
}

// ─── WAYPOINT CHASE ───────────────────────────────────────────────────────────

const WAYPOINTS: [number, number][] = [
  [-1.0, -0.8],
  [0.2, -1.0],
  [1.0, -0.2],
  [0.6, 0.8],
  [-0.5, 0.9],
];

export function WaypointChase() {
  const botRef = useRef<THREE.Group>(null);
  const targetRef = useRef(0);
  const pauseRef = useRef(0);
  const posRef = useRef(new THREE.Vector2(WAYPOINTS[0][0], WAYPOINTS[0][1]));
  const glowRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }, dt) => {
    if (pauseRef.current > 0) {
      pauseRef.current -= dt;
      // Celebrate spin at waypoint
      if (botRef.current) botRef.current.rotation.y += dt * 4;
      if (glowRef.current) glowRef.current.intensity = 1.2 + Math.sin(clock.elapsedTime * 10) * 0.5;
      return;
    }

    const target = WAYPOINTS[targetRef.current];
    const dx = target[0] - posRef.current.x;
    const dz = target[1] - posRef.current.y;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.06) {
      pauseRef.current = 0.8; // pause at waypoint
      targetRef.current = (targetRef.current + 1) % WAYPOINTS.length;
      return;
    }

    const speed = 0.7;
    const step = Math.min(dist, speed * dt);
    posRef.current.x += (dx / dist) * step;
    posRef.current.y += (dz / dist) * step;

    if (botRef.current) {
      botRef.current.position.set(posRef.current.x, 0, posRef.current.y);
      botRef.current.rotation.y = Math.atan2(dx, dz);
    }
    if (glowRef.current) glowRef.current.intensity = 0.4;
  });

  return (
    <group ref={botRef}>
      <DifferentialBot color="default" variant="standard" glowRef={glowRef} />
    </group>
  );
}

// ─── CIRCLE / TRIG DANCE ──────────────────────────────────────────────────────

export function CircleDance() {
  const botRef = useRef<THREE.Group>(null);
  // Leave a visible trail of small markers
  const trailRef = useRef<{ x: number; z: number }[]>([]);
  const trailMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const TRAIL_LEN = 40;

  // Initialize trail meshes as invisible
  const trailMeshes = useMemo(() => {
    return Array.from({ length: TRAIL_LEN }, (_, i) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 6, 4),
        new THREE.MeshStandardMaterial({
          color: '#7040ff', emissive: new THREE.Color('#7040ff'), emissiveIntensity: 0.6,
          transparent: true, opacity: (i / TRAIL_LEN) * 0.7,
        }),
      );
      mesh.visible = false;
      return mesh;
    });
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;

    // Spiral in/out: radius oscillates between 0.3 and 0.9
    const phase = (t * 0.3) % (Math.PI * 2);
    const r = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(phase));
    const angle = t * 1.4;

    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;

    if (botRef.current) {
      botRef.current.position.set(x, 0, z);
      botRef.current.rotation.y = -angle + Math.PI / 2;
    }

    // Trail
    trailRef.current.push({ x, z });
    if (trailRef.current.length > TRAIL_LEN) trailRef.current.shift();
    trailRef.current.forEach((p, i) => {
      const mesh = trailMeshes[i];
      if (mesh) {
        mesh.position.set(p.x, 0.04, p.z);
        mesh.visible = true;
        (mesh.material as THREE.MeshStandardMaterial).opacity = (i / TRAIL_LEN) * 0.65;
      }
    });
  });

  return (
    <>
      {trailMeshes.map((mesh, i) => <primitive key={i} object={mesh} />)}
      <group ref={botRef}>
        <DifferentialBot color="blue" variant="standard" />
      </group>
    </>
  );
}

// ─── PID APPROACH ─────────────────────────────────────────────────────────────

export function PIDApproach() {
  const botRef = useRef<THREE.Group>(null);
  const xRef = useRef(-1.0); // starting position
  const vRef = useRef(0);    // velocity
  const glowRef = useRef<THREE.PointLight>(null);

  // Target marker
  const targetMarkerRef = useRef<THREE.Mesh>(null);

  const TARGET_X = 0.8;
  const Kp = 3.5;
  const Ki = 0.4;
  const Kd = 1.8;
  const integralRef = useRef(0);
  const prevErrRef = useRef(0);
  const resetRef = useRef(0);

  useFrame(({ clock }, dt) => {
    resetRef.current += dt;
    // Reset every 8 seconds to show repeated approach
    if (resetRef.current > 8) {
      resetRef.current = 0;
      xRef.current = -1.0;
      vRef.current = 0;
      integralRef.current = 0;
      prevErrRef.current = 0;
    }

    const err = TARGET_X - xRef.current;
    integralRef.current += err * dt;
    const derivative = (err - prevErrRef.current) / dt;
    prevErrRef.current = err;

    const force = Kp * err + Ki * integralRef.current + Kd * derivative;
    // Clamp force and add damping
    const clampedForce = Math.max(-4, Math.min(4, force));
    vRef.current = vRef.current * 0.92 + clampedForce * dt;
    xRef.current += vRef.current * dt;

    if (botRef.current) {
      botRef.current.position.set(xRef.current, 0, 0);
      // Face right (toward target)
      botRef.current.rotation.y = xRef.current < TARGET_X ? -Math.PI / 2 : Math.PI / 2;
    }

    // Target marker pulse
    if (targetMarkerRef.current) {
      const m = targetMarkerRef.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 0.4 + Math.sin(clock.elapsedTime * 3) * 0.2;
    }

    if (glowRef.current) {
      glowRef.current.intensity = Math.abs(vRef.current) * 0.8 + 0.2;
    }
  });

  return (
    <>
      {/* Target marker post */}
      <group position={[TARGET_X, 0, 0]}>
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.5, 8]} />
          <meshStandardMaterial color="#303040" />
        </mesh>
        <mesh ref={targetMarkerRef} position={[0, 0.5, 0]}>
          <sphereGeometry args={[0.06, 12, 10]} />
          <meshStandardMaterial color="#ff4060" emissive={new THREE.Color('#ff4060')} emissiveIntensity={0.4} />
        </mesh>
        <pointLight position={[0, 0.5, 0]} color="#ff4060" intensity={0.5} distance={0.8} />
      </group>

      {/* Error line (visual distance indicator) */}
      <mesh position={[TARGET_X / 2 + 0.0, 0.005, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[Math.abs(TARGET_X - (-1.0)), 0.008, 0.008]} />
        <meshStandardMaterial color="#ff4060" transparent opacity={0.3} />
      </mesh>

      {/* Bot */}
      <group ref={botRef}>
        <DifferentialBot color="default" variant="standard" glowRef={glowRef} />
      </group>
    </>
  );
}

// ─── Top-level selector ───────────────────────────────────────────────────────

type ChallengeSimProps = {
  mode: SimMode;
  sumoRingRadius?: number;
};

export function ChallengeSim({ mode, sumoRingRadius = 1.2 }: ChallengeSimProps) {
  if (mode === 'sumo') return <SumoFight ringRadius={sumoRingRadius} />;
  if (mode === 'cone-ring') return <ConeRingRun />;
  if (mode === 'maze') return <MazeRun />;
  if (mode === 'waypoint') return <WaypointChase />;
  if (mode === 'circle-dance') return <CircleDance />;
  if (mode === 'pid-approach') return <PIDApproach />;
  return null; // 'drawing' — handled by parent (RobotGantry)
}
