'use client';

/**
 * Renderers for user-placed scene objects (course builder output).
 *
 * Visual style is intentionally close to the existing concept-environment
 * props (cones, walls, waypoints) so a user-built course feels native.
 */

import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

import {
  GRID_SIZE,
  STACK_HEIGHT,
  gridToWorld,
  rotationToRadians,
  type SceneObject,
  type ToolDef,
} from '@/lib/scene-builder';

// ─── Selection ring under selected objects ───────────────────────────────────

function SelectionRing({ x, z }: { x: number; z: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.55 + Math.sin(clock.elapsedTime * 4) * 0.25;
  });
  return (
    <mesh ref={ref} position={[x, 0.005, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[GRID_SIZE * 0.55, GRID_SIZE * 0.7, 32]} />
      <meshBasicMaterial color="#5de4ff" transparent opacity={0.5} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Per-type renderers ──────────────────────────────────────────────────────

function WallObject({ x, y, z, rotY }: { x: number; y: number; z: number; rotY: number }) {
  return (
    <mesh position={[x, y + 0.08, z]} rotation={[0, rotY, 0]} castShadow receiveShadow>
      <boxGeometry args={[GRID_SIZE * 0.95, 0.16, GRID_SIZE * 0.18]} />
      <meshStandardMaterial color="#0a2a10" emissive="#002200" emissiveIntensity={0.3} roughness={0.8} />
    </mesh>
  );
}

function BlockObject({ x, y, z, rotY, color = '#3a4d8a' }: { x: number; y: number; z: number; rotY: number; color?: string }) {
  return (
    <mesh position={[x, y + 0.08, z]} rotation={[0, rotY, 0]} castShadow receiveShadow>
      <boxGeometry args={[GRID_SIZE * 0.85, 0.16, GRID_SIZE * 0.85]} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.15} />
    </mesh>
  );
}

function ConeObject({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.016, 16]} />
        <meshStandardMaterial color="#111" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.14, 0]} castShadow>
        <coneGeometry args={[0.06, 0.26, 16]} />
        <meshStandardMaterial color="#ff5500" emissive="#ff3300" emissiveIntensity={0.2} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.03, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
    </group>
  );
}

function SphereObject({ x, y, z, color = '#a855f7' }: { x: number; y: number; z: number; color?: string }) {
  return (
    <mesh position={[x, y + 0.1, z]} castShadow>
      <sphereGeometry args={[0.1, 24, 24]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.25} />
    </mesh>
  );
}

function CylinderObject({ x, y, z, color = '#cccccc' }: { x: number; y: number; z: number; color?: string }) {
  return (
    <mesh position={[x, y + 0.12, z]} castShadow>
      <cylinderGeometry args={[0.07, 0.07, 0.24, 16]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.2} />
    </mesh>
  );
}

function WaypointObject({ x, y, z, color = '#4dffb8' }: { x: number; y: number; z: number; color?: string }) {
  const sphereRef = useRef<THREE.Mesh>(null);
  const off = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    if (!sphereRef.current) return;
    const mat = sphereRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * 2 + off.current) * 0.35;
    sphereRef.current.position.y = 0.32 + Math.sin(clock.elapsedTime * 1.8 + off.current) * 0.025;
  });
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.30, 8]} />
        <meshStandardMaterial color="#303040" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh ref={sphereRef} position={[0, 0.32, 0]}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.3} />
      </mesh>
      <pointLight position={[0, 0.32, 0]} color={color} intensity={0.35} distance={0.8} />
    </group>
  );
}

function AprilTagObject({ x, y, z, rotY }: { x: number; y: number; z: number; rotY: number }) {
  // Simplified flat marker — black border + white inner + checkerboard
  return (
    <group position={[x, y + 0.001, z]} rotation={[0, rotY, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.18, 0.18]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.13, 0.13]} />
        <meshStandardMaterial color="#f3eee0" roughness={0.85} />
      </mesh>
      {/* Tiny checker dots */}
      {[
        [-0.035, -0.035], [0, -0.035], [0.035, -0.035],
        [-0.035, 0],                   [0.035, 0],
        [-0.035, 0.035],  [0,  0.035], [0.035, 0.035],
      ].map(([dx, dz], i) => (
        <mesh key={i} position={[dx, 0.002, dz]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.024, 0.024]} />
          <meshStandardMaterial color={(i + Math.floor(i / 3)) % 2 === 0 ? '#0a0a0a' : '#f3eee0'} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function BotObject({ x, y, z, rotY, variant = 'standard' }: { x: number; y: number; z: number; rotY: number; variant?: 'standard' | 'sumo' }) {
  const isSumo = variant === 'sumo';
  const bodyColor    = isSumo ? '#cc1818' : '#3a4d8a';
  const accentColor  = isSumo ? '#ffaa00' : '#5de4ff';
  const radius       = isSumo ? 0.13     : 0.10;
  const height       = isSumo ? 0.10     : 0.09;
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      {/* Chassis */}
      <mesh position={[0, height / 2 + 0.01, 0]} castShadow>
        <cylinderGeometry args={[radius, radius * 0.95, height, 24]} />
        <meshStandardMaterial color={bodyColor} roughness={0.55} metalness={0.25} />
      </mesh>
      {/* Accent ring */}
      <mesh position={[0, height + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.65, radius * 0.85, 32]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* Direction nub */}
      <mesh position={[radius * 0.55, height / 2 + 0.01, 0]} castShadow>
        <boxGeometry args={[radius * 0.4, 0.025, radius * 0.5]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

// ─── Single object dispatcher ────────────────────────────────────────────────

function PlacedObjectMesh({ obj }: { obj: SceneObject }) {
  const { x, y, z } = gridToWorld(obj);
  const rotY = rotationToRadians(obj.rotY ?? 0);

  switch (obj.type) {
    case 'wall':     return <WallObject x={x} y={y} z={z} rotY={rotY} />;
    case 'block':    return <BlockObject x={x} y={y} z={z} rotY={rotY} color={obj.color} />;
    case 'cone':     return <ConeObject x={x} y={y} z={z} />;
    case 'sphere':   return <SphereObject x={x} y={y} z={z} color={obj.color} />;
    case 'cylinder': return <CylinderObject x={x} y={y} z={z} color={obj.color} />;
    case 'waypoint': return <WaypointObject x={x} y={y} z={z} color={obj.color} />;
    case 'apriltag': return <AprilTagObject x={x} y={y} z={z} rotY={rotY} />;
    case 'bot':      return <BotObject x={x} y={y} z={z} rotY={rotY} variant={obj.botVariant} />;
    default:         return null;
  }
}

// ─── Public renderer for a list of scene objects ─────────────────────────────

export function SceneObjectsRenderer({
  objects,
  selectedId,
  onSelect,
}: {
  objects: SceneObject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <group>
      {objects.map((obj) => {
        const { x, z } = gridToWorld(obj);
        const isSelected = obj.id === selectedId;
        return (
          <group
            key={obj.id}
            onPointerDown={(e) => {
              // Prevent scene click handler from clearing the selection.
              e.stopPropagation();
              onSelect(obj.id);
            }}
          >
            <PlacedObjectMesh obj={obj} />
            {isSelected && <SelectionRing x={x} z={z} />}
          </group>
        );
      })}
    </group>
  );
}

// ─── Cursor / ghost preview for the active tool ──────────────────────────────

export function BuilderCursor({
  tool,
  gx,
  gz,
  visible,
}: {
  tool: ToolDef | null;
  gx: number;
  gz: number;
  visible: boolean;
}) {
  if (!tool || !visible) return null;
  const { x, z } = gridToWorld({ gx, gz });
  return (
    <group position={[x, 0, z]}>
      {/* Highlight cell */}
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GRID_SIZE * 0.98, GRID_SIZE * 0.98]} />
        <meshBasicMaterial color="#5de4ff" transparent opacity={0.25} />
      </mesh>
      {/* Floating tool emoji marker */}
      <mesh position={[0, STACK_HEIGHT + 0.02, 0]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshBasicMaterial color="#5de4ff" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}
