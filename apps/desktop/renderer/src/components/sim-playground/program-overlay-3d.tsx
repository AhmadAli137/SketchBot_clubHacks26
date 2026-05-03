/**
 * Program 3D overlay — renders the kid's voice-built program as numbered
 * arrows + gizmos in the scene, anchored to the active bot's current
 * pose. Each top-level block becomes one segment chained from where the
 * previous one ended. Active step (during execution) glows; conditional
 * blocks (motor.until) draw as dashed arrows since their actual end
 * point is sensor-dependent.
 *
 * Mounted inside Scene3D so it lives in the same R3F tree as the bot
 * and walls. Subscribes to the program store + the executor's
 * tutor.program.event bus, and to `getPose(activeBotId)` so the chain
 * follows the bot as it drives around.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';

import { subscribeProgram } from '@/lib/program-store';
import { simulateTrajectory, type TrajectorySegment } from '@/lib/program-trajectory';
import { type Program } from '@/lib/program-schema';
import { onSparkEvent } from '@/lib/spark-events';
import { gridToWorldRendered, type SceneObject } from '@/lib/scene-builder';
import { getPose } from './bot-drive';

type Props = {
  /** The bot id whose pose anchors the program preview when no Start
   *  marker has been placed. Usually the first bot in the scene. */
  activeBotId: string | null;
  /** Placed Start marker — when present, takes precedence over the bot
   *  pose so the preview is locked to a fixed launch point regardless
   *  of how the bot has drifted around. */
  startObject?: SceneObject | null;
};

// Painted-on-floor aesthetic — arrows sit just above the ground so
// they read as a path the bot will trace, not as floating gizmos that
// embed in scene objects. Heights staggered by a fraction of a mm to
// avoid Z-fighting between overlapping segment ribbons.
const FLOOR_HEIGHT = 0.012;       // m above the floor where the ribbon paint lives
const ARROW_HEAD_LEN = 0.10;      // length of the arrowhead triangle
const ARROW_HEAD_HALF_W = 0.06;   // half-width of the arrowhead base
const ARROW_RIBBON_HALF_W = 0.025; // half-width of the shaft ribbon
const BOT_RADIUS_FOR_OFFSET = 0.13; // start arrow past the bot's chassis edge

const COLOR_BY_KIND: Record<string, string> = {
  drive:        '#22c55e',
  turn:         '#f59e0b',
  'motor.set':  '#3b82f6',
  'motor.until':'#a855f7',
  wait:         '#94a3b8',
  stop:         '#ef4444',
  loop:         '#ec4899',
  if:           '#06b6d4',
};

export function ProgramOverlay3D({ activeBotId, startObject }: Props) {
  const [program, setProgram] = useState<Program>({ id: 'p-default', blocks: [] });
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  // Re-anchor when the bot pose drifts more than 1 cm or rotates more
  // than 1° — keeps the preview up-to-date without rebuilding every
  // frame. Stored as raw nums so the comparator below is allocation-free.
  const lastAnchor = useRef({ x: NaN, z: NaN, h: NaN });
  const [anchorTick, setAnchorTick] = useState(0);

  useEffect(() => subscribeProgram(setProgram), []);

  useEffect(() => {
    return onSparkEvent((d) => {
      if (d.kind !== 'tutor.program.event') return;
      const ev = d.payload as Record<string, unknown> | undefined;
      if (!ev) return;
      if (ev.kind === 'block.enter' && typeof ev.blockId === 'string') {
        setActiveBlockId(ev.blockId);
      } else if (ev.kind === 'block.exit' && typeof ev.blockId === 'string') {
        setActiveBlockId((cur) => (cur === ev.blockId ? null : cur));
      } else if (ev.kind === 'program.done' || ev.kind === 'program.aborted') {
        setActiveBlockId(null);
      }
    });
  }, []);

  // Watch the bot's pose so the preview chain re-anchors as it moves —
  // only relevant when there's no Start marker. With a Start, the
  // trajectory anchor is fixed to the marker's grid position.
  useFrame(() => {
    if (startObject) return;          // start marker takes precedence; no need to poll bot
    if (!activeBotId) return;
    const pose = getPose(activeBotId);
    if (!pose) return;
    const dx = Math.abs(pose.worldX - lastAnchor.current.x);
    const dz = Math.abs(pose.worldZ - lastAnchor.current.z);
    const dh = Math.abs(pose.heading - lastAnchor.current.h);
    if (Number.isNaN(lastAnchor.current.x) || dx > 0.01 || dz > 0.01 || dh > 0.017) {
      lastAnchor.current = { x: pose.worldX, z: pose.worldZ, h: pose.heading };
      setAnchorTick((t) => (t + 1) & 0xffff);
    }
  });

  const segments = useMemo<TrajectorySegment[]>(() => {
    if (program.blocks.length === 0) return [];
    // Anchor preference: placed Start marker → bot pose → nothing.
    if (startObject) {
      const { x, z } = gridToWorldRendered(startObject);
      const heading = startObject.headingRad ?? ((startObject.rotY ?? 0) * Math.PI) / 2;
      return simulateTrajectory(program, { x, z, heading });
    }
    if (!activeBotId) return [];
    const pose = getPose(activeBotId);
    if (!pose) return [];
    return simulateTrajectory(program, {
      x: pose.worldX, z: pose.worldZ, heading: pose.heading,
    });
    // anchorTick re-runs the simulator when the bot moves enough. Keeping
    // it in deps even though it isn't read inside — the dependency itself
    // is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, activeBotId, anchorTick, startObject]);

  if (segments.length === 0) return null;

  return (
    <group>
      {segments.map((seg) => (
        <SegmentGizmo
          key={seg.blockId}
          seg={seg}
          isActive={activeBlockId === seg.blockId}
        />
      ))}
    </group>
  );
}

function SegmentGizmo({ seg, isActive }: { seg: TrajectorySegment; isActive: boolean }) {
  const color = COLOR_BY_KIND[seg.sourceKind] ?? '#5de4ff';
  const opacity = isActive ? 1.0 : 0.85;
  const labelColor = isActive ? '#ffffff' : color;

  switch (seg.kind) {
    case 'translate': return (
      <ArrowSegment
        x0={seg.x0} z0={seg.z0}
        x1={seg.x1} z1={seg.z1}
        color={color}
        opacity={opacity}
        dashed={seg.isIndicator}
        isActive={isActive}
        stepNumber={seg.stepNumber}
        label={seg.label}
        labelColor={labelColor}
      />
    );
    case 'rotate': return (
      <TurnArc
        x={seg.x0} z={seg.z0}
        h0={seg.heading0} h1={seg.heading1}
        color={color}
        opacity={opacity}
        isActive={isActive}
        stepNumber={seg.stepNumber}
        label={seg.label}
        labelColor={labelColor}
      />
    );
    case 'pause': return (
      <PausePuck
        x={seg.x} z={seg.z} heading={seg.heading}
        color={color}
        opacity={opacity}
        isActive={isActive}
        stepNumber={seg.stepNumber}
        label={seg.label}
        labelColor={labelColor}
      />
    );
  }
}

// ─── Arrow (drive / motor.set both / motor.until) ────────────────────────

function ArrowSegment({
  x0, z0, x1, z1, color, opacity, dashed, isActive, stepNumber, label, labelColor,
}: {
  x0: number; z0: number; x1: number; z1: number;
  color: string; opacity: number; dashed: boolean; isActive: boolean;
  stepNumber: number; label: string; labelColor: string;
}) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return null;
  // Direction unit vector along the path.
  const ux = dx / length;
  const uz = dz / length;
  // Offset the start past the bot's chassis edge so the arrow visibly
  // begins where the bot's nose is, not buried inside the mesh.
  const startX = x0 + ux * BOT_RADIUS_FOR_OFFSET;
  const startZ = z0 + uz * BOT_RADIUS_FOR_OFFSET;
  const ribbonLen = Math.max(0.001, length - BOT_RADIUS_FOR_OFFSET - ARROW_HEAD_LEN);
  const ribbonMidX = startX + ux * (ribbonLen / 2);
  const ribbonMidZ = startZ + uz * (ribbonLen / 2);
  const headTipX = x1;
  const headTipZ = z1;
  const headBaseX = x1 - ux * ARROW_HEAD_LEN;
  const headBaseZ = z1 - uz * ARROW_HEAD_LEN;
  // World XZ-plane angle of the path. plane is built in XY then we
  // rotate −90° around X to lay it flat, then yaw around Y.
  const yaw = Math.atan2(-dz, dx);
  const flatRibbonRot: [number, number, number] = [-Math.PI / 2, 0, yaw];

  // Triangular arrowhead — generated each render via memoised geometry.
  const headGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    // In local XY (will be rotated flat onto XZ): tip points +X, base
    // straddles the X axis at x=0.
    const verts = new Float32Array([
      ARROW_HEAD_LEN, 0, 0,                     // tip
      0,  ARROW_HEAD_HALF_W, 0,                 // base left
      0, -ARROW_HEAD_HALF_W, 0,                 // base right
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setIndex([0, 1, 2]);
    g.computeVertexNormals();
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <group>
      {/* Ribbon shaft — a flat rectangle painted on the floor. */}
      {ribbonLen > 0.001 && (
        <mesh position={[ribbonMidX, FLOOR_HEIGHT, ribbonMidZ]} rotation={flatRibbonRot}>
          <planeGeometry args={[ribbonLen, ARROW_RIBBON_HALF_W * 2]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={isActive ? 1.2 : 0.75}
            transparent
            opacity={dashed ? opacity * 0.70 : opacity}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      {/* Triangular arrowhead — flat on the floor, pointed at (x1,z1). */}
      <mesh
        position={[headBaseX, FLOOR_HEIGHT + 0.0005, headBaseZ]}
        rotation={flatRibbonRot}
        geometry={headGeom}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 1.4 : 0.85}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Dash tick marks for indicator (motor.until) — show the path
          continues conditionally past the visible arrow. */}
      {dashed && (
        <DashTicks x0={startX} z0={startZ} dx={ux} dz={uz} length={ribbonLen} color={color} opacity={opacity} />
      )}
      {/* Step number puck floating above the START of this segment. */}
      <StepLabel x={startX} z={startZ} number={stepNumber} color={color} isActive={isActive} />
      {/* Distance label hovering above the ribbon midpoint. */}
      <Html position={[ribbonMidX, FLOOR_HEIGHT + 0.12, ribbonMidZ]} center distanceFactor={3}>
        <div className="program-overlay-label" style={{ color: labelColor }}>{label}</div>
      </Html>
      {/* Subtle landing dot at the arrow tip so the kid can see exactly
          where the bot is heading — useful when the arrow runs through
          other scene objects that visually obscure the tip. */}
      <mesh position={[headTipX, FLOOR_HEIGHT + 0.0008, headTipZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.04, 0.06, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 1.1 : 0.65}
          transparent
          opacity={opacity * 0.85}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function DashTicks({
  x0, z0, dx, dz, length, color, opacity,
}: {
  x0: number; z0: number; dx: number; dz: number; length: number; color: string; opacity: number;
}) {
  // Three small perpendicular bars across the ribbon to read as "dashed".
  // Drawn as thin flat planes lying on the floor, just above the ribbon.
  const yaw = Math.atan2(-dz, dx);
  const bars = [0.25, 0.55, 0.85].map((t) => ({
    x: x0 + dx * length * t,
    z: z0 + dz * length * t,
  }));
  return (
    <group>
      {bars.map((b, i) => (
        <mesh
          key={i}
          position={[b.x, FLOOR_HEIGHT + 0.0006, b.z]}
          rotation={[-Math.PI / 2, 0, yaw]}
        >
          <planeGeometry args={[0.012, ARROW_RIBBON_HALF_W * 2.4]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.9}
            transparent
            opacity={opacity}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Turn arc (turn / single-side motor.set) ─────────────────────────────

function TurnArc({
  x, z, h0, h1, color, opacity, isActive, stepNumber, label, labelColor,
}: {
  x: number; z: number; h0: number; h1: number;
  color: string; opacity: number; isActive: boolean;
  stepNumber: number; label: string; labelColor: string;
}) {
  // Painted-on-floor arc: a tube laid on its side along the path, with
  // a flat triangular arrowhead at the tip pointing tangent.
  const radius = 0.22;
  const segments = 24;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const h = h0 + (h1 - h0) * t;
    const px = x + radius * Math.sin(h);
    const pz = z + radius * Math.cos(h);
    points.push(new THREE.Vector3(px, FLOOR_HEIGHT, pz));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const tubeRadius = isActive ? 0.020 : 0.016;

  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const tDx = last.x - prev.x;
  const tDz = last.z - prev.z;
  const tipYaw = Math.atan2(-tDz, tDx);

  // Flat triangular tip — same shape as the ArrowSegment head.
  const headGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const verts = new Float32Array([
      ARROW_HEAD_LEN * 0.7, 0, 0,
      0,  ARROW_HEAD_HALF_W * 0.85, 0,
      0, -ARROW_HEAD_HALF_W * 0.85, 0,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setIndex([0, 1, 2]);
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, segments, tubeRadius, 10, false]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 1.2 : 0.75}
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </mesh>
      <mesh
        position={[last.x, FLOOR_HEIGHT + 0.0008, last.z]}
        rotation={[-Math.PI / 2, 0, tipYaw]}
        geometry={headGeom}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 1.4 : 0.85}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <StepLabel x={x} z={z} number={stepNumber} color={color} isActive={isActive} yOffset={0.04} />
      <Html position={[(x + last.x) / 2, FLOOR_HEIGHT + 0.14, (z + last.z) / 2]} center distanceFactor={3}>
        <div className="program-overlay-label" style={{ color: labelColor }}>{label}</div>
      </Html>
    </group>
  );
}

// ─── Pause puck (wait / stop) ────────────────────────────────────────────

function PausePuck({
  x, z, color, opacity, isActive, stepNumber, label, labelColor,
}: {
  x: number; z: number; heading: number; color: string; opacity: number; isActive: boolean;
  stepNumber: number; label: string; labelColor: string;
}) {
  return (
    <group>
      <mesh position={[x, FLOOR_HEIGHT, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.07, 0.10, 28]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 1.2 : 0.7}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <StepLabel x={x} z={z} number={stepNumber} color={color} isActive={isActive} />
      <Html position={[x, FLOOR_HEIGHT + 0.13, z]} center distanceFactor={3}>
        <div className="program-overlay-label" style={{ color: labelColor }}>{label}</div>
      </Html>
    </group>
  );
}

// ─── Step number puck — small floating disc with the step number ─────────

function StepLabel({
  x, z, number, color, isActive, yOffset = 0.0,
}: {
  x: number; z: number; number: number; color: string; isActive: boolean; yOffset?: number;
}) {
  // Number rendered as an HTML overlay so we don't pull in a 3D font.
  // The disc floats above the segment start, attached by a short stem,
  // so the kid can quickly count steps without the disc getting buried
  // under other floor objects.
  const HEIGHT = 0.20 + yOffset;
  return (
    <group position={[x, HEIGHT, z]}>
      {/* Stem from the floor up to the disc — a thin vertical line. */}
      <mesh position={[0, -HEIGHT / 2 + FLOOR_HEIGHT, 0]}>
        <cylinderGeometry args={[0.003, 0.003, HEIGHT - FLOOR_HEIGHT, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.045, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 1.2 : 0.75}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Html position={[0, 0.002, 0]} center distanceFactor={3}>
        <div className={`program-overlay-step${isActive ? ' is-active' : ''}`}>{number}</div>
      </Html>
    </group>
  );
}
