'use client';

/**
 * Renderers for user-placed scene objects (course builder output).
 *
 * Visual style is intentionally close to the existing concept-environment
 * props (cones, walls, waypoints) so a user-built course feels native.
 *
 * Phase 3 additions:
 *  - GhostObject — translucent preview of the actual tool's object at cursor
 *  - Stack-target hover highlight — top face of a hovered object glows
 *    when a tool is active so the user knows where it'll land
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';

import {
  GRID_SIZE,
  GRID_SNAP_TYPES,
  STACK_HEIGHT,
  gridToWorld,
  rotationToRadians,
  type SceneObject,
  type ToolDef,
} from '@/lib/scene-builder';

const GHOST_COLOR    = '#5de4ff';
const STACK_COLOR    = '#a855f7';
const GHOST_OPACITY  = 0.45;

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

// ─── Floating action toolbar above the selected object ──────────────────────
//
// Renders rotate / delete buttons in screen-space anchored to the selected
// object's world position. Drei's <Html> handles the projection + DOM
// pointer events, so the kid doesn't have to know R / Delete keys exist.

function SelectionToolbar({
  obj,
  onRotate,
  onDelete,
}: {
  obj: SceneObject;
  onRotate?: () => void;
  onDelete?: () => void;
}) {
  const { x, y, z } = gridToWorld(obj);
  // Park the toolbar a bit above each object's top face. Same offsets the
  // stack-target highlight uses, plus a small clearance.
  const topY = (() => {
    switch (obj.type) {
      case 'wall':
      case 'block':         return y + 0.16;
      case 'cone':          return y + 0.26;
      case 'sphere':        return y + 0.20;
      case 'cylinder':      return y + 0.24;
      case 'bot':           return y + 0.10;
      case 'studio-light':  return y + 1.7;
      case 'mat':           return y + 0.05;
      default:              return y + 0.10;
    }
  })();

  return (
    <Html
      position={[x, topY + 0.18, z]}
      center
      // Scale with distance so the toolbar stays a comfortable size on screen
      // regardless of camera zoom — without this, near objects get a giant
      // toolbar and far ones get a tiny unreadable one.
      distanceFactor={5}
      // Sit above 3D content of the same depth — these are UI controls.
      zIndexRange={[100, 0]}
      // Don't intercept floor pointer events for the surrounding hit area.
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="sandbox-selection-toolbar"
        // Stop drag/scroll bleed-through on the actual buttons.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{ pointerEvents: 'auto' }}
      >
        <button
          type="button"
          className="sandbox-selection-toolbar-btn"
          onClick={onRotate}
          title="Rotate (R)"
          aria-label="Rotate"
        >↻</button>
        <button
          type="button"
          className="sandbox-selection-toolbar-btn sandbox-selection-toolbar-btn--danger"
          onClick={onDelete}
          title="Delete (Del)"
          aria-label="Delete"
        >✕</button>
      </div>
    </Html>
  );
}

// ─── Top-face hover highlight (stack target indicator) ───────────────────────

function StackTargetHighlight({
  x,
  y,
  z,
  rotY,
  type,
}: {
  x: number;
  y: number;
  z: number;
  rotY: number;
  type: SceneObject['type'];
}) {
  const ref = useRef<THREE.Mesh>(null);
  // Top-face Y position depends on object's height
  const topY = (() => {
    switch (type) {
      case 'wall':
      case 'block':         return y + 0.16;
      case 'cone':          return y + 0.26;
      case 'sphere':        return y + 0.20;
      case 'cylinder':      return y + 0.24;
      case 'bot':           return y + 0.10;
      case 'studio-light':  return y + 1.7;
      default:              return y + 0.05;
    }
  })();

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.45 + Math.sin(clock.elapsedTime * 5) * 0.25;
  });

  // Use slightly oversized cell footprint
  const w = (type === 'wall') ? GRID_SIZE * 1.0 : GRID_SIZE * 0.95;
  const d = (type === 'wall') ? GRID_SIZE * 0.22 : GRID_SIZE * 0.95;

  return (
    <mesh ref={ref} position={[x, topY + 0.002, z]} rotation={[-Math.PI / 2, 0, rotY]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial color={STACK_COLOR} transparent opacity={0.5} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Per-type renderers (real, opaque) ───────────────────────────────────────

function WallObject({ x, y, z, rotY }: { x: number; y: number; z: number; rotY: number }) {
  // Offset along the wall's long axis by half a cell so the wall's ENDS
  // land on grid intersections (real maze-on-edge geometry) instead of
  // its CENTER landing on intersections. Walls along X (rotY=0 or PI)
  // shift in X; walls along Z (rotY=PI/2 or 3PI/2) shift in Z.
  const isXAxis = Math.abs(Math.cos(rotY)) > 0.5;
  const offX = isXAxis ? GRID_SIZE / 2 : 0;
  const offZ = isXAxis ? 0 : GRID_SIZE / 2;
  return (
    <mesh position={[x + offX, y + 0.08, z + offZ]} rotation={[0, rotY, 0]} castShadow receiveShadow>
      {/* Length = full GRID_SIZE so walls in adjacent cells meet edge-to-edge
          with no visible seam — the maze reads as a continuous corridor. */}
      <boxGeometry args={[GRID_SIZE, 0.16, GRID_SIZE * 0.18]} />
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

function MatObject({ x, y, z, rotY, color = '#a855f7' }: { x: number; y: number; z: number; rotY: number; color?: string }) {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const mat = ringRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * 0.7) * 0.18;
  });
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      {/* Bright glowing inner disc — defines the play surface */}
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2.0, 64]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.18}
          transparent
          opacity={0.32}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>
      {/* Pulsing outer ring */}
      <mesh ref={ringRef} position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.97, 2.10, 64]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.55}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Placeable studio light. Same shape as the four fixed corner lights
 * (tripod base + pole + softbox head), but the head re-aims at the
 * world origin every frame so wherever the kid drops it, the beam
 * still points at the build. The spotlight target is wired manually
 * because R3F doesn't promote the default target Object3D into the
 * scene graph.
 */
function StudioLightObject({ x, y, z }: { x: number; y: number; z: number }) {
  const headRef   = useRef<THREE.Group>(null);
  const lightRef  = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const headY = 1.6;

  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
      lightRef.current.target.updateMatrixWorld();
    }
  }, []);

  useFrame(() => {
    if (headRef.current) headRef.current.lookAt(0, 0.1, 0);
  });

  return (
    <>
      <group position={[x, y, z]}>
        {/* Tripod base */}
        <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.13, 0.17, 0.04, 16]} />
          <meshStandardMaterial color="#1a1f2e" roughness={0.85} metalness={0.3} />
        </mesh>
        {/* Pole — stops below the head bulk */}
        <mesh position={[0, (headY - 0.18) * 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, headY - 0.18, 8]} />
          <meshStandardMaterial color="#252b40" roughness={0.6} metalness={0.5} />
        </mesh>
        {/* Mount knuckle */}
        <mesh position={[0, headY - 0.16, 0]} castShadow>
          <boxGeometry args={[0.05, 0.06, 0.05]} />
          <meshStandardMaterial color="#2f3550" roughness={0.5} metalness={0.6} />
        </mesh>
        {/* Yoke ring at head pivot */}
        <mesh position={[0, headY - 0.11, 0]}>
          <torusGeometry args={[0.05, 0.014, 8, 16]} />
          <meshStandardMaterial color="#2f3550" roughness={0.5} metalness={0.6} />
        </mesh>
        {/* Aim-at-origin softbox head */}
        <group ref={headRef} position={[0, headY, 0]}>
          <mesh position={[0, 0, -0.05]} castShadow>
            <boxGeometry args={[0.20, 0.18, 0.12]} />
            <meshStandardMaterial color="#2a3148" roughness={0.55} metalness={0.45} />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <boxGeometry args={[0.24, 0.22, 0.025]} />
            <meshStandardMaterial color="#ffffff" emissive="#fff4d6" emissiveIntensity={1.6} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0, 0.005]}>
            <boxGeometry args={[0.26, 0.24, 0.012]} />
            <meshStandardMaterial color="#1a1f2e" roughness={0.8} />
          </mesh>
        </group>
      </group>
      <spotLight
        ref={lightRef}
        position={[x, y + headY, z]}
        intensity={10}
        color="#ffffff"
        distance={12}
        angle={Math.PI / 4.5}
        penumbra={0.55}
        decay={1.2}
      />
      <object3D ref={targetRef} position={[0, 0.1, 0]} />
    </>
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
      <mesh position={[0, height / 2 + 0.01, 0]} castShadow>
        <cylinderGeometry args={[radius, radius * 0.95, height, 24]} />
        <meshStandardMaterial color={bodyColor} roughness={0.55} metalness={0.25} />
      </mesh>
      <mesh position={[0, height + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.65, radius * 0.85, 32]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[radius * 0.55, height / 2 + 0.01, 0]} castShadow>
        <boxGeometry args={[radius * 0.4, 0.025, radius * 0.5]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

// ─── Per-type ghost renderers (translucent preview shapes) ───────────────────

function GhostMaterial({ color = GHOST_COLOR }: { color?: string }) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={0.6}
      transparent
      opacity={GHOST_OPACITY}
      depthWrite={false}
    />
  );
}

function GhostShape({
  type,
  rotY,
  variant,
}: {
  type: SceneObject['type'];
  rotY: number;
  variant?: 'standard' | 'sumo';
}) {
  switch (type) {
    case 'wall': {
      // Mirror WallObject's half-cell offset so the ghost matches where
      // the wall will actually land.
      const isXAxis = Math.abs(Math.cos(rotY)) > 0.5;
      const offX = isXAxis ? GRID_SIZE / 2 : 0;
      const offZ = isXAxis ? 0 : GRID_SIZE / 2;
      return (
        <mesh position={[offX, 0.08, offZ]} rotation={[0, rotY, 0]}>
          <boxGeometry args={[GRID_SIZE, 0.16, GRID_SIZE * 0.18]} />
          <GhostMaterial />
        </mesh>
      );
    }
    case 'block':
      return (
        <mesh position={[0, 0.08, 0]} rotation={[0, rotY, 0]}>
          <boxGeometry args={[GRID_SIZE * 0.85, 0.16, GRID_SIZE * 0.85]} />
          <GhostMaterial />
        </mesh>
      );
    case 'cone':
      return (
        <mesh position={[0, 0.14, 0]}>
          <coneGeometry args={[0.06, 0.26, 16]} />
          <GhostMaterial color="#ff8c00" />
        </mesh>
      );
    case 'sphere':
      return (
        <mesh position={[0, 0.1, 0]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <GhostMaterial color="#a855f7" />
        </mesh>
      );
    case 'cylinder':
      return (
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.24, 16]} />
          <GhostMaterial />
        </mesh>
      );
    case 'waypoint':
      return (
        <group>
          <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.30, 8]} />
            <GhostMaterial color="#4dffb8" />
          </mesh>
          <mesh position={[0, 0.32, 0]}>
            <sphereGeometry args={[0.055, 12, 12]} />
            <GhostMaterial color="#4dffb8" />
          </mesh>
        </group>
      );
    case 'apriltag':
      return (
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, rotY]}>
          <planeGeometry args={[0.18, 0.18]} />
          <meshBasicMaterial color={GHOST_COLOR} transparent opacity={GHOST_OPACITY} side={THREE.DoubleSide} />
        </mesh>
      );
    case 'mat':
      return (
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, rotY]}>
          <ringGeometry args={[1.95, 2.05, 48]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      );
    case 'bot': {
      const isSumo = variant === 'sumo';
      const radius = isSumo ? 0.13 : 0.10;
      const height = isSumo ? 0.10 : 0.09;
      return (
        <mesh position={[0, height / 2 + 0.01, 0]} rotation={[0, rotY, 0]}>
          <cylinderGeometry args={[radius, radius * 0.95, height, 24]} />
          <GhostMaterial color={isSumo ? '#ff6060' : '#5de4ff'} />
        </mesh>
      );
    }
    case 'studio-light':
      // Vertical pole + softbox preview
      return (
        <group>
          <mesh position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 1.4, 8]} />
            <GhostMaterial color="#fff4d6" />
          </mesh>
          <mesh position={[0, 1.55, 0]}>
            <boxGeometry args={[0.26, 0.22, 0.13]} />
            <GhostMaterial color="#fff4d6" />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

// ─── Single placed-object dispatcher ─────────────────────────────────────────

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
    case 'mat':      return <MatObject x={x} y={y} z={z} rotY={rotY} color={obj.color} />;
    case 'studio-light': return <StudioLightObject x={x} y={y} z={z} />;
    default:         return null;
  }
}

// ─── Public renderer for a list of scene objects ─────────────────────────────

export function SceneObjectsRenderer({
  objects,
  selectedId,
  draggedId,
  hoveredId,
  toolActive,
  onSelect,
  onStackOnTop,
  onStartDrag,
  onHoverObject,
  onRotate,
  onDelete,
}: {
  objects: SceneObject[];
  selectedId: string | null;
  draggedId: string | null;
  hoveredId: string | null;
  /** True when a placement tool is active — face highlight + stack-on-top click. */
  toolActive: boolean;
  onSelect: (id: string | null) => void;
  onStackOnTop: (objectId: string) => void;
  onStartDrag: (objectId: string) => void;
  onHoverObject: (id: string | null) => void;
  /** Floating-toolbar callbacks — operate on the currently selected object. */
  onRotate?: () => void;
  onDelete?: () => void;
}) {
  return (
    <group>
      {objects.map((obj) => {
        const { x, y, z } = gridToWorld(obj);
        const rotY = rotationToRadians(obj.rotY ?? 0);
        const isSelected = obj.id === selectedId;
        const isDragging = obj.id === draggedId;
        const isHovered  = obj.id === hoveredId && toolActive;
        return (
          <group
            key={obj.id}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(obj.id);
              onStartDrag(obj.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onStackOnTop(obj.id);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHoverObject(obj.id);
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              // Only clear hover if pointer truly left this object
              onHoverObject(null);
            }}
          >
            <PlacedObjectMesh obj={obj} />
            {(isSelected || isDragging) && <SelectionRing x={x} z={z} />}
            {isHovered && (
              <StackTargetHighlight x={x} y={y} z={z} rotY={rotY} type={obj.type} />
            )}
            {/* Toolbar only on the selected object, and not while it's being
                dragged (to prevent accidental click-on-button while moving). */}
            {isSelected && !isDragging && (
              <SelectionToolbar obj={obj} onRotate={onRotate} onDelete={onDelete} />
            )}
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
  gy,
  visible,
  rotY = 0,
}: {
  tool: ToolDef | null;
  gx: number;
  gz: number;
  gy?: number;
  visible: boolean;
  rotY?: number;
}) {
  if (!tool || !visible) return null;
  const { x, y, z } = gridToWorld({ gx, gz, gy });
  // Floor cell rectangle reads as "drop into this cell". For free-place
  // tools (anything that doesn't snap) the rect would slide around at
  // sub-cell granularity, which is misleading — show only the ghost
  // shape for those.
  const showCellRect = (!gy || gy === 0) && GRID_SNAP_TYPES.has(tool.type);

  return (
    <group position={[x, y, z]}>
      {showCellRect && (
        <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[GRID_SIZE * 0.98, GRID_SIZE * 0.98]} />
          <meshBasicMaterial color={GHOST_COLOR} transparent opacity={0.22} />
        </mesh>
      )}

      {/* Translucent preview of the actual object that'll be placed */}
      <GhostShape
        type={tool.type}
        rotY={rotY}
        variant={tool.botVariant}
      />
    </group>
  );
}

// Re-export so other modules can render placement-time previews via this dispatcher
export { GhostShape, STACK_HEIGHT };
