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
import { getPose } from './bot-drive';

type Props = {
  /** The bot id whose pose anchors the program preview. Usually the
   *  first bot in the scene. Null suppresses the overlay. */
  activeBotId: string | null;
};

const HOVER_HEIGHT = 0.18;       // m above the floor where arrows float
const ARROW_HEAD_SIZE = 0.06;
const ARROW_SHAFT_RADIUS = 0.012;

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

export function ProgramOverlay3D({ activeBotId }: Props) {
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

  // Watch the bot's pose so the preview chain re-anchors as it moves.
  useFrame(() => {
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
    if (!activeBotId || program.blocks.length === 0) return [];
    const pose = getPose(activeBotId);
    if (!pose) return [];
    return simulateTrajectory(program, {
      x: pose.worldX, z: pose.worldZ, heading: pose.heading,
    });
    // anchorTick re-runs the simulator when the bot moves enough. Keeping
    // it in deps even though it isn't read inside — the dependency itself
    // is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, activeBotId, anchorTick]);

  if (!activeBotId || segments.length === 0) return null;

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

  // The shaft cylinder is built along +Y by default; rotate it to point
  // along the direction (dx, dz) on the floor plane.
  const shaftLen = Math.max(0.0001, length - ARROW_HEAD_SIZE);
  const midX = x0 + (dx * shaftLen) / (2 * length);
  const midZ = z0 + (dz * shaftLen) / (2 * length);
  const tipX = x0 + (dx * (length - ARROW_HEAD_SIZE * 0.5)) / length;
  const tipZ = z0 + (dz * (length - ARROW_HEAD_SIZE * 0.5)) / length;
  // Cylinder default axis = +Y. We want it lying flat along (dx,dz) with
  // length running in that direction. Rotate by Math.atan2 to align in
  // the XZ plane, then tip the cylinder so its length axis is in-plane.
  const yaw = Math.atan2(-dz, dx); // world XZ-plane angle
  const shaftRot: [number, number, number] = [Math.PI / 2, 0, -yaw];

  return (
    <group>
      {/* Shaft */}
      <mesh position={[midX, HOVER_HEIGHT, midZ]} rotation={shaftRot}>
        <cylinderGeometry args={[ARROW_SHAFT_RADIUS, ARROW_SHAFT_RADIUS, shaftLen, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 0.85 : 0.45}
          transparent
          opacity={dashed ? opacity * 0.65 : opacity}
        />
      </mesh>
      {/* Head — cone pointing along the path direction */}
      <mesh position={[tipX, HOVER_HEIGHT, tipZ]} rotation={shaftRot}>
        <coneGeometry args={[ARROW_HEAD_SIZE * 0.7, ARROW_HEAD_SIZE, 14]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 0.95 : 0.55}
          transparent
          opacity={opacity}
        />
      </mesh>
      {/* Dash tick marks for indicator (motor.until) — shows the path
          continues conditionally past the visible arrow. */}
      {dashed && <DashTicks x0={x0} z0={z0} dx={dx / length} dz={dz / length} length={length} color={color} opacity={opacity} />}
      {/* Step number puck floating just above the start, billboarded */}
      <StepLabel x={x0} z={z0} number={stepNumber} color={color} isActive={isActive} />
      {/* Sub-label ("12 in") near the midpoint, rendered as an HTML
          overlay so we don't need to load a 3D font (which can suspend
          the whole canvas). */}
      <Html position={[midX, HOVER_HEIGHT + 0.10, midZ]} center distanceFactor={3}>
        <div className="program-overlay-label" style={{ color: labelColor }}>{label}</div>
      </Html>
    </group>
  );
}

function DashTicks({
  x0, z0, dx, dz, length, color, opacity,
}: {
  x0: number; z0: number; dx: number; dz: number; length: number; color: string; opacity: number;
}) {
  // Three small perpendicular bars across the shaft to read as "dashed".
  const bars = [0.25, 0.55, 0.85].map((t) => ({
    x: x0 + dx * length * t,
    z: z0 + dz * length * t,
  }));
  // Perpendicular direction in the XZ plane.
  const px = -dz, pz = dx;
  return (
    <group>
      {bars.map((b, i) => {
        const half = 0.025;
        return (
          <mesh
            key={i}
            position={[b.x, HOVER_HEIGHT + 0.001, b.z]}
            rotation={[Math.PI / 2, 0, -Math.atan2(pz, px)]}
          >
            <cylinderGeometry args={[0.005, 0.005, half * 2, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={opacity} />
          </mesh>
        );
      })}
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
  // Build a thin tube along an arc of radius ~0.18 m centred on the bot.
  // Radius small enough to read as "pivot in place" rather than "drive
  // around a circle".
  const radius = 0.18;
  const segments = 32;
  const points: THREE.Vector3[] = [];
  // We want the arc to start at a direction perpendicular to the bot's
  // forward axis, so it visually sits beside the bot. Use bot's forward
  // as the chord direction reference.
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const h = h0 + (h1 - h0) * t;
    // Place arc points to the LEFT of the heading (positive Z in local).
    const px = x + radius * Math.sin(h);
    const pz = z + radius * Math.cos(h);
    points.push(new THREE.Vector3(px, HOVER_HEIGHT, pz));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const tubeRadius = isActive ? 0.014 : 0.011;

  // Arrowhead at the end of the arc — points along the tangent of the
  // ending direction.
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const tDx = last.x - prev.x;
  const tDz = last.z - prev.z;
  const tipYaw = Math.atan2(-tDz, tDx);

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, segments, tubeRadius, 10, false]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isActive ? 0.85 : 0.5} transparent opacity={opacity} />
      </mesh>
      <mesh position={[last.x, last.y, last.z]} rotation={[Math.PI / 2, 0, -tipYaw]}>
        <coneGeometry args={[ARROW_HEAD_SIZE * 0.65, ARROW_HEAD_SIZE * 0.85, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isActive ? 0.95 : 0.55} transparent opacity={opacity} />
      </mesh>
      <StepLabel x={x} z={z} number={stepNumber} color={color} isActive={isActive} yOffset={0.04} />
      <Html position={[(x + last.x) / 2, HOVER_HEIGHT + 0.12, (z + last.z) / 2]} center distanceFactor={3}>
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
      <mesh position={[x, HOVER_HEIGHT, z]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.075, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isActive ? 0.9 : 0.5} transparent opacity={opacity} side={THREE.DoubleSide} />
      </mesh>
      <StepLabel x={x} z={z} number={stepNumber} color={color} isActive={isActive} />
      <Html position={[x, HOVER_HEIGHT + 0.13, z]} center distanceFactor={3}>
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
  // The colored disc is still a real 3D mesh so it sits in-scene with
  // proper depth + lighting.
  return (
    <group position={[x, HOVER_HEIGHT + 0.18 + yOffset, z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.04, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 1.0 : 0.6}
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
