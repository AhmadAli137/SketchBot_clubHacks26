'use client';

/**
 * ChallengeSimulation — physics-driven 3D robot simulations per concept.
 *
 * Physics: custom 2D rigid-body system (physics-2d.ts) running in useFrame.
 * Robots can't phase through walls. Cones fly on impact. Wheels spin correctly.
 * Sumo bots push and recoil. Maze walls block with realistic slide+bounce.
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  PhysicsBody,
  resolveCircleCircle,
  resolveCircleAABB,
  constrainToRing,
  tankWheelSpeeds,
  angDiff,
  type WallRect,
} from './physics-2d';
import { getEnvironment } from '@/lib/concept-environments';
import { SparkMiniBotMesh, SumoBotMesh } from './bot-meshes';

// ─── Sim mode selector ────────────────────────────────────────────────────────

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

// ─── Physical constants ───────────────────────────────────────────────────────

const S = 0.25;                    // robot scale (matches RobotGantry)
const ROBOT_RADIUS  = 0.20;        // collision circle for standard bot
const SUMO_RADIUS   = 0.25;        // collision circle for sumo bot
const CONE_RADIUS   = 0.072;       // cone base physics radius
const WHEEL_R       = 0.28 * S;    // = 0.07 — wheel rolling radius
const HALF_WB       = 0.78 * S;    // = 0.195 — half-wheelbase

// ─── Shared materials (created once at module level) ─────────────────────────

function mkMat(color: string, emissive?: string, roughness = 0.65, metalness = 0.2) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  if (emissive) { mat.emissive = new THREE.Color(emissive); mat.emissiveIntensity = 0.25; }
  return mat;
}

// Sensor + cone materials — bot chassis materials live inside the shared
// SparkMiniBotMesh / SumoBotMesh in ./bot-meshes.tsx so the sandbox bot and
// the challenge-sim bot stay literally the same mesh.
const SENSOR_ARM_MAT   = mkMat('#102818', '#005520', 0.6, 0.3);
const SENSOR_TIP_MAT   = new THREE.MeshStandardMaterial({
  color: '#00ff66', emissive: new THREE.Color('#00ff66'), emissiveIntensity: 0.9, roughness: 0.2,
});
const CONE_BASE_MAT    = mkMat('#111111', undefined, 0.9, 0.05);
const CONE_BODY_MAT    = new THREE.MeshStandardMaterial({
  color: '#ff5500', emissive: new THREE.Color('#ff3300'), emissiveIntensity: 0.2, roughness: 0.6,
});
const CONE_BAND_MAT    = mkMat('#ffffff', undefined, 0.5, 0.1);

// ─── DifferentialBot ──────────────────────────────────────────────────────────
// Thin wrapper around the shared SparkMiniBotMesh / SumoBotMesh from
// `bot-meshes.tsx` so the challenge sims show LITERALLY the same robot the
// student sees in the sandbox.
//
// The shared meshes treat local +X as forward and roll their wheels via
// `.rotation.z` on the spinner refs. Challenge-sim's existing physics
// convention has forward = -Z and was using `.rotation.y`. We reconcile
// with a single `<group rotation={[0, π/2, 0]}>` wrap that maps mesh +X →
// world -Z, and update applyWheelRoll() below to drive `.rotation.z`.

type BotVariant = 'standard' | 'sumo' | 'maze-scout';

type DifferentialBotProps = {
  /** Reserved for future per-bot tinting. The shared mesh ships its own
   *  hub colour scheme (cyan lugs on Spark Mini, red hubs on Sumo). */
  color?: 'default' | 'red' | 'blue';
  variant?: BotVariant;
  glowRef?: React.RefObject<THREE.PointLight | null>;
  lRollRef?: React.RefObject<THREE.Group | null>;
  rRollRef?: React.RefObject<THREE.Group | null>;
};

function DifferentialBot({
  color = 'default',
  variant = 'standard',
  glowRef,
  lRollRef,
  rRollRef,
}: DifferentialBotProps) {
  const glowColor = color === 'red' ? '#ff4060' : color === 'blue' ? '#4080ff' : '#5de4ff';
  const isSumo = variant === 'sumo';
  // Scale the sandbox mesh up so its silhouette roughly matches the physics
  // collision radii (ROBOT_RADIUS=0.20, SUMO_RADIUS=0.25). The mesh's
  // native size is for the sandbox grid; the challenge sim uses the same
  // S=0.25 conventions for everything else, so 1.4× lands the bot at the
  // same visual footprint the old DifferentialBot had.
  const SCALE = isSumo ? 1.5 : 1.4;

  // Sumo is 4WD — its rear wheels need to spin in lockstep with the front.
  // The applyWheelRoll() helper drives lRollRef/rRollRef (which are
  // attached to the FRONT wheels via the mesh wheelRefs); a useFrame
  // mirrors those rotations onto rear-wheel refs created here.
  const lRearRef = useRef<THREE.Group>(null);
  const rRearRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!isSumo) return;
    if (lRollRef?.current && lRearRef.current) {
      lRearRef.current.rotation.z = lRollRef.current.rotation.z;
    }
    if (rRollRef?.current && rRearRef.current) {
      rRearRef.current.rotation.z = rRollRef.current.rotation.z;
    }
  });

  return (
    <group>
      <group rotation={[0, -Math.PI / 2, 0]} scale={SCALE}>
        {/* Physics convention: PhysicsBody.forwardDir() = (sin(angle),
            cos(angle)), so at angle=0 the bot's forward is world +Z. The
            shared mesh has its forward along local +X. A Y rotation of
            -π/2 maps mesh +X → world +Z, lining the visible chassis up
            with the direction the bot actually moves. Mesh "left" (mesh
            +Z) then lands at world -X — the bot's left side when facing
            +Z — so lRollRef / rRollRef pass through unswapped. */}
        {isSumo ? (
          <SumoBotMesh
            wheelRefs={{
              leftFront:  lRollRef,
              leftRear:   lRearRef,
              rightFront: rRollRef,
              rightRear:  rRearRef,
            }}
          />
        ) : (
          <SparkMiniBotMesh
            wheelRefs={{ left: lRollRef, right: rRollRef }}
          />
        )}

        {/* Maze-scout sensor arms — extend forward of the chassis (mesh +X).
            Same dimensions as the original DifferentialBot, just placed in
            mesh-local coordinates. */}
        {variant === 'maze-scout' && (
          <>
            {([[1, -0.6], [-1, 0.6]] as [number, number][]).map(([sZ, ry], k) => (
              <group key={k} position={[0.080, 0.110, sZ * 0.060]} rotation={[0, ry, 0]}>
                <mesh material={SENSOR_ARM_MAT}>
                  <boxGeometry args={[0.110, 0.010, 0.010]} />
                </mesh>
                <mesh position={[0.062, 0, 0]} material={SENSOR_TIP_MAT}>
                  <sphereGeometry args={[0.012, 8, 6]} />
                </mesh>
                <pointLight position={[0.066, 0, 0]} color="#00ff66" intensity={0.4} distance={0.3} />
              </group>
            ))}
          </>
        )}
      </group>

      {/* Under-chassis glow — outside the rotation/scale wrap so it sits at
          the bot's world origin regardless of variant. */}
      <pointLight ref={glowRef} position={[0, 0.05, 0]} color={glowColor} intensity={0.4} distance={0.7} decay={2} />
    </group>
  );
}

// ─── Physics cone visual ──────────────────────────────────────────────────────

/** Single cone mesh. Position/rotation driven from physics body in useFrame. */
function PhysicsCone({ groupRef, scale = 1 }: {
  groupRef: React.Ref<THREE.Group | null>;
  scale?: number;
}) {
  return (
    <group ref={groupRef} scale={scale}>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={CONE_BASE_MAT} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 0.016, 16]} />
      </mesh>
      <mesh position={[0, 0.14, 0]} material={CONE_BODY_MAT} castShadow>
        <coneGeometry args={[0.06, 0.26, 16]} />
      </mesh>
      <mesh position={[0, 0.08, 0]} material={CONE_BAND_MAT}>
        <cylinderGeometry args={[0.065, 0.065, 0.03, 16]} />
      </mesh>
    </group>
  );
}

// ─── Wheel roll helper ────────────────────────────────────────────────────────

/**
 * Set the bot's angular velocity directly so it snaps to a target heading
 * without fighting the proportional-torque + angular-damping system.
 *
 * The torque controller bots used previously could only achieve ~17% of
 * commanded angVel after damping ate the rest, which meant a 180° turn
 * took 5+ seconds. With direct control the bot reaches its commanded rate
 * the same frame and turns at MAX_RATE rad/s until almost on heading,
 * then eases in proportionally. Bots that need this should also set
 * `angDamp: 0` in their PhysicsBody opts so integrate doesn't subsequently
 * decay the angVel we just wrote.
 */
function steerToHeading(
  body: PhysicsBody,
  desiredHeading: number,
  maxRate: number,
): number {
  const err = angDiff(desiredHeading, body.angle);
  const ramp = Math.min(Math.abs(err) * 5, maxRate);
  body.angVel = Math.sign(err) * ramp;
  return err;
}

function applyWheelRoll(
  lRef: React.RefObject<THREE.Group | null>,
  rRef: React.RefObject<THREE.Group | null>,
  body: PhysicsBody,
  dt: number,
): void {
  // Roll axis: the shared SparkMiniBotMesh / SumoBotMesh in bot-meshes.tsx
  // lays the wheel cylinder with axis along its local Z. Forward roll is
  // achieved with NEGATIVE delta on .rotation.z (matches the sandbox's
  // pose-driven rotation convention in scene-objects.tsx, e.g.
  // `leftWheelRef.current.rotation.z = -pose.leftWheelRot`).
  const speeds = tankWheelSpeeds(body.forwardSpeed(), body.angVel, HALF_WB);
  if (lRef.current) lRef.current.rotation.z -= (speeds.left  / WHEEL_R) * dt;
  if (rRef.current) rRef.current.rotation.z -= (speeds.right / WHEEL_R) * dt;
}

// ─── SUMO FIGHT ───────────────────────────────────────────────────────────────

export function SumoFight({ ringRadius = 1.2 }: { ringRadius?: number }) {
  const botGrp  = useRef<THREE.Group>(null);
  const oppGrp  = useRef<THREE.Group>(null);
  const glowA   = useRef<THREE.PointLight>(null);
  const glowB   = useRef<THREE.PointLight>(null);
  const lRollA  = useRef<THREE.Group>(null);
  const rRollA  = useRef<THREE.Group>(null);
  const lRollB  = useRef<THREE.Group>(null);
  const rRollB  = useRef<THREE.Group>(null);

  // Physics bodies
  const botBody = useRef<PhysicsBody | null>(null);
  const oppBody = useRef<PhysicsBody | null>(null);

  // Sumo AI state machine: 0=seek, 1=charge, 2=push, 3=escape
  const botState  = useRef(0);
  const oppState  = useRef(0);
  const botTimer  = useRef(0);
  const oppTimer  = useRef(0);

  useEffect(() => {
    // restitution 0.05 = sticky contact so a wedge that lands on the
    // opponent stays engaged. angDamp 0 = direct angVel control isn't
    // chewed up by integrate damping — bots reorient on the same frame
    // their AI commands the turn.
    botBody.current = new PhysicsBody(0, ringRadius * 0.6, {
      mass: 2.5, radius: SUMO_RADIUS, restitution: 0.05, linDamp: 2.0, angDamp: 0,
    });
    oppBody.current = new PhysicsBody(0, -ringRadius * 0.6, {
      angle: Math.PI, mass: 2.5, radius: SUMO_RADIUS, restitution: 0.05, linDamp: 2.0, angDamp: 0,
    });
    botState.current = 0; oppState.current = 0;
    botTimer.current = 0; oppTimer.current = 0;
    return () => { botBody.current = null; oppBody.current = null; };
  }, [ringRadius]);

  useFrame(({ clock }, dt) => {
    const bot = botBody.current;
    const opp = oppBody.current;
    if (!bot || !opp) return;
    const t = clock.elapsedTime;

    const MAX_ANG    = 5.0;
    const FORCE_BASE = 11.0;
    const FORCE_PUSH = 22.0;
    const PUSH_DIST  = SUMO_RADIUS * 2 + 0.04;
    const EDGE_WARN  = ringRadius * 0.85;

    const toOppDist   = Math.hypot(opp.pos.x - bot.pos.x, opp.pos.z - bot.pos.z);
    const inContact   = toOppDist < PUSH_DIST;
    const botEdgeDist = Math.hypot(bot.pos.x, bot.pos.z);
    const oppEdgeDist = Math.hypot(opp.pos.x, opp.pos.z);

    botState.current = botEdgeDist > EDGE_WARN ? 3 : inContact ? 2 : 1;
    oppState.current = oppEdgeDist > EDGE_WARN ? 3 : inContact ? 2 : 1;

    // ── Bot AI ── snap heading toward opponent (or centre when near edge),
    // then drive forward. Forward thrust is gated by alignment so the bot
    // doesn't drift sideways while it's still rotating to face its target.
    const botDesiredHeading = botEdgeDist > EDGE_WARN
      ? Math.atan2(-bot.pos.x, -bot.pos.z)
      : Math.atan2(opp.pos.x - bot.pos.x, opp.pos.z - bot.pos.z);
    const botAngErr = steerToHeading(bot, botDesiredHeading, MAX_ANG);
    if (Math.abs(botAngErr) < 0.65) {
      const fd = bot.forwardDir();
      const fmag = inContact ? FORCE_PUSH : FORCE_BASE;
      bot.applyForce(fd.x * fmag, fd.z * fmag, dt);
    }

    // ── Opponent AI (slightly weaker so the "default" bot tends to win) ──
    const oppDesiredHeading = oppEdgeDist > EDGE_WARN
      ? Math.atan2(-opp.pos.x, -opp.pos.z)
      : Math.atan2(bot.pos.x - opp.pos.x, bot.pos.z - opp.pos.z);
    const oppAngErr = steerToHeading(opp, oppDesiredHeading, MAX_ANG);
    if (Math.abs(oppAngErr) < 0.65) {
      const fd = opp.forwardDir();
      const fmag = inContact ? FORCE_PUSH * 0.85 : FORCE_BASE * 0.85;
      opp.applyForce(fd.x * fmag, fd.z * fmag, dt);
    }
    botTimer.current += dt; oppTimer.current += dt;

    // ── Physics step ──
    bot.integrate(dt);
    opp.integrate(dt);
    resolveCircleCircle(bot, opp);
    constrainToRing(bot, ringRadius);
    constrainToRing(opp, ringRadius);

    // ── Mesh update ──
    if (botGrp.current) {
      botGrp.current.position.set(bot.pos.x, 0, bot.pos.z);
      botGrp.current.rotation.y = bot.angle;
    }
    if (oppGrp.current) {
      oppGrp.current.position.set(opp.pos.x, 0, opp.pos.z);
      oppGrp.current.rotation.y = opp.angle;
    }

    // ── Wheel animation ──
    applyWheelRoll(lRollA, rRollA, bot, dt);
    applyWheelRoll(lRollB, rRollB, opp, dt);

    // ── Charge glow pulse ──
    if (glowA.current) glowA.current.intensity = botState.current === 1 ? 1.2 + Math.sin(t * 22) * 0.4 : 0.4;
    if (glowB.current) glowB.current.intensity = oppState.current === 1 ? 1.0 + Math.sin(t * 18) * 0.4 : 0.4;
  });

  return (
    <group>
      <group ref={botGrp}>
        <DifferentialBot color="default" variant="sumo" glowRef={glowA} lRollRef={lRollA} rRollRef={rRollA} />
      </group>
      <group ref={oppGrp}>
        <DifferentialBot color="red" variant="sumo" glowRef={glowB} lRollRef={lRollB} rRollRef={rRollB} />
      </group>
    </group>
  );
}

// ─── CONE SLALOM ──────────────────────────────────────────────────────────────
//
// Linear cone gauntlet: 5 uniform-size cones in a row, the bot weaves
// north / south / north / south through them, end to end. After each pass
// the bot ping-pongs back the other way. Replaces the old concentric-ring
// layout (which had no clear "start" or "end" and made the bot loop).

const CONE_GAUNTLET_DEFS: { x: number; z: number; scale: number }[] = [
  { x: -1.20, z: 0, scale: 1 },
  { x: -0.60, z: 0, scale: 1 },
  { x:  0.00, z: 0, scale: 1 },
  { x:  0.60, z: 0, scale: 1 },
  { x:  1.20, z: 0, scale: 1 },
];

// Slalom waypoints — north of cone 1, south of cone 2, north of 3, etc.
// Endpoints sit clear of the cone line so the bot enters and exits cleanly.
const ROBOT_PATH: [number, number][] = [
  [-1.65,  0.00],   // entry (west of cones)
  [-1.20,  0.45],   // north of cone @ x=-1.20
  [-0.60, -0.45],   // south of cone @ x=-0.60
  [ 0.00,  0.45],   // north of cone @ x= 0.00
  [ 0.60, -0.45],   // south of cone @ x= 0.60
  [ 1.20,  0.45],   // north of cone @ x= 1.20
  [ 1.65,  0.00],   // exit (east of cones)
];

export function ConeRingRun() {
  const botGrp  = useRef<THREE.Group>(null);
  const lRoll   = useRef<THREE.Group>(null);
  const rRoll   = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.PointLight>(null);

  // One THREE.Group ref per cone — used to update their transforms from physics
  const coneGrpsRef = useRef<(THREE.Group | null)[]>([]);

  // Physics bodies
  const botBody    = useRef<PhysicsBody | null>(null);
  const coneBodies = useRef<PhysicsBody[]>([]);

  useEffect(() => {
    // Smaller collision radius (0.13 not 0.20) so the bot fits between
    // cones spaced 0.6m apart without clipping. The body still pushes a
    // cone if it brushes one, but it can also weave through the slalom.
    botBody.current = new PhysicsBody(ROBOT_PATH[0][0], ROBOT_PATH[0][1], {
      mass: 1.0, radius: 0.13, restitution: 0.22, linDamp: 1.6, angDamp: 0,
    });
    coneBodies.current = CONE_GAUNTLET_DEFS.map(
      ({ x, z }) => new PhysicsBody(x, z, {
        mass: 0.18, radius: CONE_RADIUS, restitution: 0.42, linDamp: 3.5, angDamp: 4.2,
        isDynamic: true, bouncySpin: true,
      }),
    );
    return () => {
      botBody.current = null;
      coneBodies.current = [];
    };
  }, []);

  const pathIdxRef = useRef(0);
  /** +1 east-bound (entry → exit), -1 west-bound (exit → entry). Ping-pong
   *  at each end so the bot continuously slaloms back and forth instead of
   *  teleporting to the start. */
  const dirRef = useRef(1);

  useFrame((_, dt) => {
    const bot = botBody.current;
    if (!bot) return;

    // Hit each waypoint precisely (0.18 threshold) so the bot actually
    // weaves through the cones instead of sweeping a wide arc that goes
    // around them. Direct angVel steering means turns are immediate, so
    // tight thresholds work without stalling.
    const target = ROBOT_PATH[pathIdxRef.current]!;
    const dx = target[0] - bot.pos.x;
    const dz = target[1] - bot.pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.18) {
      const next = pathIdxRef.current + dirRef.current;
      if (next < 0 || next >= ROBOT_PATH.length) {
        dirRef.current *= -1;
        pathIdxRef.current += dirRef.current;
      } else {
        pathIdxRef.current = next;
      }
    } else {
      const desiredHeading = Math.atan2(dx, dz);
      const angErr = steerToHeading(bot, desiredHeading, 5.0);
      const fd = bot.forwardDir();
      const speed = 4.5 * Math.max(0.45, 1 - Math.abs(angErr) * 0.55);
      bot.applyForce(fd.x * speed, fd.z * speed, dt);
    }

    bot.integrate(dt);

    // ── Robot-cone collisions ──
    for (const cone of coneBodies.current) {
      cone.integrate(dt);
      resolveCircleCircle(bot, cone);
    }

    // ── Update robot mesh ──
    if (botGrp.current) {
      botGrp.current.position.set(bot.pos.x, 0, bot.pos.z);
      botGrp.current.rotation.y = bot.angle;
    }
    applyWheelRoll(lRoll, rRoll, bot, dt);
    if (glowRef.current) glowRef.current.intensity = 0.4 + bot.forwardSpeed() * 0.4;

    // ── Update cone meshes ──
    coneBodies.current.forEach((cone, i) => {
      const grp = coneGrpsRef.current[i];
      if (!grp) return;
      grp.position.set(cone.pos.x, 0, cone.pos.z);
      grp.rotation.y = cone.angle;
      // Tilt toward velocity direction when moving
      const spd = Math.hypot(cone.vel.x, cone.vel.z);
      if (!cone.sleeping && spd > 0.02) {
        const tilt = Math.min(spd * 1.4, 0.75);
        const tx = (cone.vel.z / spd) * tilt;
        const tz = (-cone.vel.x / spd) * tilt;
        grp.rotation.x += (tx - grp.rotation.x) * 0.2;
        grp.rotation.z += (tz - grp.rotation.z) * 0.2;
      } else {
        // Settle upright
        grp.rotation.x *= 0.9;
        grp.rotation.z *= 0.9;
      }
    });
  });

  return (
    <>
      {/* Physics cones */}
      {CONE_GAUNTLET_DEFS.map((def, i) => (
        <PhysicsCone
          key={i}
          scale={def.scale}
          groupRef={el => { coneGrpsRef.current[i] = el; }}
        />
      ))}
      {/* Robot */}
      <group ref={botGrp}>
        <DifferentialBot color="default" variant="standard" glowRef={glowRef} lRollRef={lRoll} rRollRef={rRoll} />
      </group>
    </>
  );
}

// ─── MAZE RUN ─────────────────────────────────────────────────────────────────

// Z-maze solve: S(-1.25,-1.25) → bottom corridor → wrap right around
// wall1's east end → middle corridor → wrap left around wall2's west end →
// top corridor → E(+1.25,+1.25). Visited forward then reverse (ping-pong)
// so the bot continually solves the maze in alternating directions.
const MAZE_WAYPOINTS: [number, number][] = [
  [-1.27, -1.27],   // near S
  [ 1.27, -1.27],   // bottom-right (under wall1)
  [ 1.27,  0.00],   // middle-right (between walls, around wall1's east end)
  [-1.27,  0.00],   // middle-left (across the middle corridor)
  [-1.27,  1.27],   // top-left (above wall2's west end)
  [ 1.27,  1.27],   // near E (top-right)
];

export function MazeRun() {
  const botGrp    = useRef<THREE.Group>(null);
  const sensorL   = useRef<THREE.PointLight>(null);
  const sensorR   = useRef<THREE.PointLight>(null);
  const lRoll     = useRef<THREE.Group>(null);
  const rRoll     = useRef<THREE.Group>(null);

  const botBody   = useRef<PhysicsBody | null>(null);
  const segRef    = useRef(0);
  /** +1 forward (S → E), -1 reverse (E → S). Ping-pongs at each endpoint
   *  so the bot keeps solving the maze in alternating directions instead
   *  of teleporting from E back to S between cycles. */
  const dirRef    = useRef(1);

  // Build wall rects once from the environment data (exact same walls as the visual renderer)
  const walls = useMemo<WallRect[]>(() => {
    const envWalls = getEnvironment('maze-marathon').walls ?? [];
    return envWalls.map(w => ({
      x: w.x, z: w.z, w: w.width, d: w.depth, rot: w.rotation,
    }));
  }, []);

  useEffect(() => {
    // angDamp 0 → steerToHeading isn't chewed up by integrate damping.
    botBody.current = new PhysicsBody(MAZE_WAYPOINTS[0][0], MAZE_WAYPOINTS[0][1], {
      mass: 1.0, radius: ROBOT_RADIUS, restitution: 0.18, linDamp: 1.6, angDamp: 0,
    });
    segRef.current = 0;
    dirRef.current = 1;
    return () => { botBody.current = null; };
  }, []);

  useFrame(({ clock }, dt) => {
    const bot = botBody.current;
    if (!bot) return;
    const t = clock.elapsedTime;

    // Advance to next waypoint EARLY — start turning before reaching the
    // corner so the bot rounds it cleanly instead of slamming the wall
    // ahead and then trying to recover.
    const target = MAZE_WAYPOINTS[segRef.current]!;
    const dx = target[0] - bot.pos.x;
    const dz = target[1] - bot.pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.45) {
      const next = segRef.current + dirRef.current;
      if (next < 0 || next >= MAZE_WAYPOINTS.length) {
        dirRef.current *= -1;
        segRef.current += dirRef.current;
      } else {
        segRef.current = next;
      }
    } else {
      const desiredHeading = Math.atan2(dx, dz);
      const angErr = steerToHeading(bot, desiredHeading, 4.5);
      // Forward thrust is moderate so the bot tracks the corridor centre
      // rather than rocketing into walls. Tapers with heading error so
      // turns are tighter, but never zero so the bot never stalls.
      const fd = bot.forwardDir();
      const speed = 4.0 * Math.max(0.4, 1 - Math.abs(angErr) * 0.6);
      bot.applyForce(fd.x * speed, fd.z * speed, dt);
    }

    // ── Physics integration ──
    bot.integrate(dt);

    // ── Wall collisions ──
    for (const wall of walls) {
      resolveCircleAABB(bot, wall);
    }

    // ── Mesh update ──
    if (botGrp.current) {
      botGrp.current.position.set(bot.pos.x, 0, bot.pos.z);
      botGrp.current.rotation.y = bot.angle;
    }
    applyWheelRoll(lRoll, rRoll, bot, dt);

    // ── Pulse sensor lights ──
    if (sensorL.current) sensorL.current.intensity = 0.5 + Math.sin(t * 4) * 0.2;
    if (sensorR.current) sensorR.current.intensity = 0.5 + Math.sin(t * 4 + Math.PI) * 0.2;
  });

  return (
    <group ref={botGrp}>
      <DifferentialBot color="blue" variant="maze-scout" lRollRef={lRoll} rRollRef={rRoll} />
      <pointLight ref={sensorL} position={[-0.18, 0.12, -0.18]} color="#00ff66" intensity={0.5} distance={0.4} />
      <pointLight ref={sensorR} position={[ 0.18, 0.12, -0.18]} color="#00ff66" intensity={0.5} distance={0.4} />
    </group>
  );
}

// ─── WAYPOINT CHASE (line follower) ───────────────────────────────────────────

const WAYPOINTS: [number, number][] = [
  [-1.0, -0.8], [0.2, -1.0], [1.0, -0.2], [0.6, 0.8], [-0.5, 0.9],
];

/** Look-ahead distance for the pursuit target — bigger = smoother corners
 *  but more cut on the inside of the turn. 0.55 is tuned to ride the
 *  segments between waypoints rather than aiming at each waypoint
 *  individually. */
const PURSUIT_LOOKAHEAD = 0.55;

export function WaypointChase() {
  const botGrp    = useRef<THREE.Group>(null);
  const glowRef   = useRef<THREE.PointLight>(null);
  const lRoll     = useRef<THREE.Group>(null);
  const rRoll     = useRef<THREE.Group>(null);

  const botBody   = useRef<PhysicsBody | null>(null);
  /** Continuous track parameter — integer part is the segment index, the
   *  fractional part is how far along that segment the pursuit target sits.
   *  Advancing this monotonically (rather than jumping waypoint-to-waypoint)
   *  is what makes the line-follower glide instead of stop-and-spin. */
  const sRef      = useRef(0);

  useEffect(() => {
    botBody.current = new PhysicsBody(WAYPOINTS[0][0], WAYPOINTS[0][1], {
      mass: 1.0, radius: ROBOT_RADIUS, restitution: 0.2, linDamp: 1.6, angDamp: 0,
    });
    sRef.current = 0;
    return () => { botBody.current = null; };
  }, []);

  useFrame((_, dt) => {
    const bot = botBody.current;
    if (!bot) return;

    // Pure-pursuit on a closed polyline: pick a target a fixed distance
    // ahead of the bot's current track position. As the bot advances, the
    // target slides smoothly along the path with it — no waypoint stops,
    // no spin-in-place. The bot eases through corners instead of pivoting.
    const segCount = WAYPOINTS.length;

    // Advance s based on actual progress along the segment.
    const segIdx   = Math.floor(sRef.current) % segCount;
    const segNext  = (segIdx + 1) % segCount;
    const a = WAYPOINTS[segIdx]!;
    const b = WAYPOINTS[segNext]!;
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // Project the bot onto the current segment to find how far along it sits.
    const px = bot.pos.x - a[0];
    const pz = bot.pos.z - a[1];
    const segDx = (b[0] - a[0]) / segLen;
    const segDz = (b[1] - a[1]) / segLen;
    const proj = Math.max(0, Math.min(segLen, px * segDx + pz * segDz));
    sRef.current = segIdx + proj / segLen;

    // Compute look-ahead target by walking PURSUIT_LOOKAHEAD metres along
    // the polyline from the bot's projected position.
    let remain = PURSUIT_LOOKAHEAD;
    let walkSeg = segIdx;
    let walkPos = proj;
    let tx = bot.pos.x;
    let tz = bot.pos.z;
    for (let i = 0; i < segCount + 1; i++) {
      const wa = WAYPOINTS[walkSeg % segCount]!;
      const wb = WAYPOINTS[(walkSeg + 1) % segCount]!;
      const wLen = Math.hypot(wb[0] - wa[0], wb[1] - wa[1]);
      const left = wLen - walkPos;
      if (remain <= left) {
        const f = (walkPos + remain) / wLen;
        tx = wa[0] + (wb[0] - wa[0]) * f;
        tz = wa[1] + (wb[1] - wa[1]) * f;
        break;
      }
      remain -= left;
      walkSeg++;
      walkPos = 0;
    }

    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const desiredHeading = Math.atan2(dx, dz);
    // Direct angVel control — pure-pursuit needs immediate heading
    // response so the bot tracks the look-ahead point smoothly.
    const angErr = steerToHeading(bot, desiredHeading, 4.5);
    // Always drive forward; speed tapers with heading error so the bot
    // eases through corners rather than yanking through them.
    const fd = bot.forwardDir();
    const speed = 4.5 * Math.max(0.5, 1 - Math.abs(angErr) * 0.45);
    bot.applyForce(fd.x * speed, fd.z * speed, dt);

    bot.integrate(dt);

    if (botGrp.current) {
      botGrp.current.position.set(bot.pos.x, 0, bot.pos.z);
      botGrp.current.rotation.y = bot.angle;
    }
    applyWheelRoll(lRoll, rRoll, bot, dt);
    if (glowRef.current) glowRef.current.intensity = 0.4 + bot.forwardSpeed() * 0.25;
  });

  return (
    <group ref={botGrp}>
      <DifferentialBot color="default" variant="standard" glowRef={glowRef} lRollRef={lRoll} rRollRef={rRoll} />
    </group>
  );
}

// ─── CIRCLE / TRIG DANCE ──────────────────────────────────────────────────────

const TRAIL_LEN = 40;

export function CircleDance() {
  const botGrp  = useRef<THREE.Group>(null);
  const lRoll   = useRef<THREE.Group>(null);
  const rRoll   = useRef<THREE.Group>(null);
  const botBody = useRef<PhysicsBody | null>(null);
  const trailBuf = useRef<{ x: number; z: number }[]>([]);

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

  useEffect(() => {
    botBody.current = new PhysicsBody(0.3, 0, {
      mass: 1.2, radius: ROBOT_RADIUS, restitution: 0.2, linDamp: 1.2, angDamp: 2.5,
    });
    trailBuf.current = [];
    return () => { botBody.current = null; };
  }, []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const phase = (t * 0.3) % (Math.PI * 2);
    const r = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(phase));
    const angle = t * 1.4;
    const targetX = Math.cos(angle) * r;
    const targetZ = Math.sin(angle) * r;

    const bot = botBody.current;
    if (!bot) return;

    // Strong spring toward target point
    const dx = targetX - bot.pos.x;
    const dz = targetZ - bot.pos.z;
    bot.applyForce(dx * 18, dz * 18, dt);
    bot.integrate(dt);

    // Heading follows velocity
    const spd = Math.hypot(bot.vel.x, bot.vel.z);
    if (spd > 0.05) bot.angle = Math.atan2(bot.vel.x, bot.vel.z);

    if (botGrp.current) {
      botGrp.current.position.set(bot.pos.x, 0, bot.pos.z);
      botGrp.current.rotation.y = bot.angle;
    }
    applyWheelRoll(lRoll, rRoll, bot, dt);

    // Trail
    trailBuf.current.push({ x: bot.pos.x, z: bot.pos.z });
    if (trailBuf.current.length > TRAIL_LEN) trailBuf.current.shift();
    trailBuf.current.forEach((p, i) => {
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
      <group ref={botGrp}>
        <DifferentialBot color="blue" variant="standard" lRollRef={lRoll} rRollRef={rRoll} />
      </group>
    </>
  );
}

// ─── PID APPROACH ─────────────────────────────────────────────────────────────

const TARGET_X = 0.8;
const Kp = 3.5, Ki = 0.4, Kd = 1.8;

export function PIDApproach() {
  const botGrp         = useRef<THREE.Group>(null);
  const glowRef        = useRef<THREE.PointLight>(null);
  const targetMarker   = useRef<THREE.Mesh>(null);
  const lRoll          = useRef<THREE.Group>(null);
  const rRoll          = useRef<THREE.Group>(null);

  const botBody    = useRef<PhysicsBody | null>(null);
  const integralR  = useRef(0);
  const prevErrR   = useRef(0);
  const resetTick  = useRef(0);

  useEffect(() => {
    botBody.current = new PhysicsBody(-1.0, 0, {
      mass: 1.2, radius: ROBOT_RADIUS, restitution: 0.2, linDamp: 0.8, angDamp: 2.0,
      angle: -Math.PI / 2, // face right
    });
    integralR.current = 0; prevErrR.current = 0; resetTick.current = 0;
    return () => { botBody.current = null; };
  }, []);

  useFrame(({ clock }, dt) => {
    const bot = botBody.current;
    if (!bot) return;

    resetTick.current += dt;
    if (resetTick.current > 8) {
      resetTick.current = 0;
      bot.pos.x = -1.0; bot.pos.z = 0;
      bot.vel.x = 0; bot.vel.z = 0;
      bot.angle = -Math.PI / 2;
      integralR.current = 0; prevErrR.current = 0;
    }

    // PID controller in X dimension
    const err = TARGET_X - bot.pos.x;
    integralR.current += err * dt;
    const derivative = (err - prevErrR.current) / Math.max(dt, 0.001);
    prevErrR.current = err;

    const rawForce = Kp * err + Ki * integralR.current + Kd * derivative;
    const force = Math.max(-5, Math.min(5, rawForce));

    bot.applyForce(force, 0, dt);
    bot.integrate(dt);

    // Keep on Z=0 rail
    bot.pos.z = 0; bot.vel.z = 0;
    bot.angle = bot.vel.x > 0 ? -Math.PI / 2 : Math.PI / 2;

    if (botGrp.current) {
      botGrp.current.position.set(bot.pos.x, 0, bot.pos.z);
      botGrp.current.rotation.y = bot.angle;
    }
    applyWheelRoll(lRoll, rRoll, bot, dt);

    if (targetMarker.current) {
      const m = targetMarker.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 0.4 + Math.sin(clock.elapsedTime * 3) * 0.2;
    }
    if (glowRef.current) glowRef.current.intensity = Math.abs(bot.forwardSpeed()) * 0.8 + 0.2;
  });

  return (
    <>
      <group position={[TARGET_X, 0, 0]}>
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.5, 8]} />
          <meshStandardMaterial color="#303040" />
        </mesh>
        <mesh ref={targetMarker} position={[0, 0.5, 0]}>
          <sphereGeometry args={[0.06, 12, 10]} />
          <meshStandardMaterial color="#ff4060" emissive={new THREE.Color('#ff4060')} emissiveIntensity={0.4} />
        </mesh>
        <pointLight position={[0, 0.5, 0]} color="#ff4060" intensity={0.5} distance={0.8} />
      </group>
      <group ref={botGrp}>
        <DifferentialBot color="default" variant="standard" glowRef={glowRef} lRollRef={lRoll} rRollRef={rRoll} />
      </group>
    </>
  );
}

// ─── Top-level selector ───────────────────────────────────────────────────────

export function ChallengeSim({ mode, sumoRingRadius = 1.2 }: { mode: SimMode; sumoRingRadius?: number }) {
  if (mode === 'sumo')         return <SumoFight ringRadius={sumoRingRadius} />;
  if (mode === 'cone-ring')    return <ConeRingRun />;
  if (mode === 'maze')         return <MazeRun />;
  if (mode === 'waypoint')     return <WaypointChase />;
  if (mode === 'circle-dance') return <CircleDance />;
  if (mode === 'pid-approach') return <PIDApproach />;
  return null;
}
