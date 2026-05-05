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

import { useEffect, useMemo, useRef } from 'react';
// (useMemo is used for the procedural ball texture below)
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Move } from 'lucide-react';

import {
  GRID_SIZE,
  GRID_SNAP_TYPES,
  STACK_HEIGHT,
  gridToWorld,
  gridToWorldRendered,
  rotationToRadians,
  type SceneObject,
  type ToolDef,
} from '@/lib/scene-builder';
import { ensurePose, getPose, syncPoseToPlacement } from './bot-drive';
import { SparkMiniBotMesh, SumoBotMesh } from './bot-meshes';
import {
  ensureKinematic, getKinematic, syncKinematicToPlacement,
  defaultKinematic,
} from './physics';

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
  onMove,
}: {
  obj: SceneObject;
  onRotate?: () => void;
  onDelete?: () => void;
  onMove?: () => void;
}) {
  // Use the rendered position so the toolbar floats over the actual mesh,
  // not the bare cell origin (matters for walls — half-cell offset).
  const { x, y, z } = gridToWorldRendered(obj);
  // Park the toolbar a bit above each object's top face. Same offsets the
  // stack-target highlight uses, plus a small clearance.
  const topY = (() => {
    switch (obj.type) {
      case 'wall':
      case 'ramp':
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
          onClick={onMove}
          title="Move — click anywhere on the floor to drop"
          aria-label="Move"
        ><Move size={14} /></button>
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
      case 'ramp':
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

/** Wall geometry. Length = GRID_SIZE exactly so adjacent same-direction
 *  walls meet edge-to-edge cleanly with no visible overlap. Perpendicular
 *  walls at L-corners will have a tiny seam at the inside corner — that's
 *  the acceptable trade-off for clean parallel runs. */
const WALL_THICKNESS = GRID_SIZE * 0.18;
const WALL_LENGTH = GRID_SIZE;
const WALL_HEIGHT = 0.16;

/**
 * Filler block at a grid intersection where multiple wall ends meet.
 * Walls placed in the +X+Z quadrant of their cell leave a small wedge
 * gap at L-corners (just NW of the intersection for an east-then-north
 * L). A thickness × thickness post centered at the cell-corner position
 * — same +X+Z quadrant offset as the walls themselves — fills the wedge
 * without poking outside the maze.
 */
function WallCornerPost({ gx, gz }: { gx: number; gz: number }) {
  const x = gx * GRID_SIZE + WALL_THICKNESS / 2;
  const z = gz * GRID_SIZE + WALL_THICKNESS / 2;
  return (
    <mesh position={[x, WALL_HEIGHT / 2, z]} castShadow receiveShadow>
      <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]} />
      <meshStandardMaterial color="#0a2a10" emissive="#002200" emissiveIntensity={0.3} roughness={0.8} />
    </mesh>
  );
}

function WallObject({ x, y, z, rotY }: { x: number; y: number; z: number; rotY: number }) {
  // Two offsets:
  //  • half-cell along the LONG axis so the wall's ENDS land on grid
  //    intersections (maze-on-edge geometry)
  //  • half-thickness along the PERPENDICULAR axis so the wall's long
  //    edge is flush with the grid line, not straddling it. This puts
  //    the wall fully inside one cell instead of half on each side, and
  //    L-corners overlap solidly in the cell-corner quadrant (no seam).
  const isXAxis = Math.abs(Math.cos(rotY)) > 0.5;
  const offLong = GRID_SIZE / 2;
  const offThick = WALL_THICKNESS / 2;
  const offX = isXAxis ? offLong : offThick;
  const offZ = isXAxis ? offThick : offLong;
  return (
    <mesh position={[x + offX, y + WALL_HEIGHT / 2, z + offZ]} rotation={[0, rotY, 0]} castShadow receiveShadow>
      <boxGeometry args={[WALL_LENGTH, WALL_HEIGHT, WALL_THICKNESS]} />
      <meshStandardMaterial color="#0a2a10" emissive="#002200" emissiveIntensity={0.3} roughness={0.8} />
    </mesh>
  );
}

/** Sloped ramp — triangular prism. Two cells long along its forward axis
 *  for a ~18° climb (atan(0.16/0.50)) — gradual enough that a bot can
 *  drive up onto a stack-1 platform. ~85% of a cell wide on the
 *  perpendicular. Treated as a solid AABB by the bot-collision system
 *  for now; the slanted top is purely visual until the drive-up code
 *  lands. Local +X = HIGH end (top of the ramp), -X = LOW end (where
 *  a bot at rotY=0 enters and climbs from). */
const RAMP_LENGTH = GRID_SIZE * 2;
const RAMP_WIDTH  = GRID_SIZE * 1.275;
const RAMP_HEIGHT = WALL_HEIGHT;

let _rampGeometry: THREE.BufferGeometry | null = null;
/** Cached extrude geometry — both RampObject and its ghost preview use
 *  this so we don't rebuild a 200-vert prism every cursor move. Triangle
 *  profile is the right-triangle (-L/2, 0) → (+L/2, 0) → (+L/2, H), so
 *  the hypotenuse rises from -X (low) toward +X (high). */
function getRampGeometry(): THREE.BufferGeometry {
  if (_rampGeometry) return _rampGeometry;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(RAMP_LENGTH, 0);
  shape.lineTo(RAMP_LENGTH, RAMP_HEIGHT);
  shape.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: RAMP_WIDTH, bevelEnabled: false });
  // Centre the prism on origin in X and Z. Y stays 0..H.
  g.translate(-RAMP_LENGTH / 2, 0, -RAMP_WIDTH / 2);
  _rampGeometry = g;
  return g;
}

function RampObject({ x, y, z, rotY }: { x: number; y: number; z: number; rotY: number }) {
  const geom = useMemo(() => getRampGeometry(), []);
  return (
    <mesh
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      geometry={geom}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#3a4060" roughness={0.55} metalness={0.30} />
    </mesh>
  );
}

function BlockObject({ id, x, y, z, rotY, color = '#3a4d8a' }: { id: string; x: number; y: number; z: number; rotY: number; color?: string }) {
  const groupRef = useLivePushable(id, 'block', x, z);
  return (
    <group ref={groupRef} position={[x, y, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[GRID_SIZE * 0.85, 0.16, GRID_SIZE * 0.85]} />
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.15} />
      </mesh>
    </group>
  );
}

/** Live-position pattern for pushable scene objects. Shared by cones,
 *  blocks, spheres, cylinders, and waypoints. The kinematic store carries
 *  the current world coords; useFrame writes them to the group ref every
 *  frame so the bot's physics push is visible in real time. The mesh's
 *  static prop position remains the placement so the first frame doesn't
 *  flash at origin and so external moves still resync properly. */
function useLivePushable(id: string, type: 'cone' | 'block' | 'sphere' | 'cylinder' | 'waypoint', x: number, z: number) {
  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => {
    const k = ensureKinematic(id, () => {
      const d = defaultKinematic(type);
      return {
        worldX: x, worldZ: z, vx: 0, vz: 0,
        radius: d.radius, pushFactor: d.pushFactor, damping: d.damping,
        restitution: d.restitution,
      };
    });
    const dx = Math.abs(k.worldX - x);
    const dz = Math.abs(k.worldZ - z);
    if (dx > 0.01 || dz > 0.01) {
      syncKinematicToPlacement(id, x, z);
    }
  }, [id, type, x, z]);
  useFrame(() => {
    const k = getKinematic(id);
    if (!k || !groupRef.current) return;
    groupRef.current.position.x = k.worldX;
    groupRef.current.position.z = k.worldZ;
  });
  return groupRef;
}

function ConeObject({ id, x, y, z }: { id: string; x: number; y: number; z: number }) {
  const groupRef = useLivePushable(id, 'cone', x, z);
  return (
    <group ref={groupRef} position={[x, y, z]}>
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

function SphereObject({ id, x, y, z, color = '#a855f7' }: { id: string; x: number; y: number; z: number; color?: string }) {
  const groupRef = useLivePushable(id, 'sphere', x, z);
  const ballRef = useRef<THREE.Mesh>(null);
  const ballR = 0.1;

  // Beach-ball style stripe texture, painted into a canvas once per
  // colour and re-used. A smooth sphere alone has no orientation tell;
  // the stripes give it one without any extra geometry.
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Six alternating wedges — vertical stripes on the canvas wrap
    // around the sphere as classic beach-ball segments.
    const N = 6;
    for (let i = 0; i < N; i++) {
      ctx.fillStyle = i % 2 === 0 ? color : '#fff4d6';
      ctx.fillRect((i / N) * 512, 0, 512 / N + 1, 256);
    }
    // Polar caps so the top/bottom are a single solid band, not stripes.
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0,    'rgba(255,244,214,1)');
    grad.addColorStop(0.07, 'rgba(255,244,214,0)');
    grad.addColorStop(0.93, 'rgba(255,244,214,0)');
    grad.addColorStop(1,    'rgba(255,244,214,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [color]);
  useEffect(() => () => { texture?.dispose(); }, [texture]);

  // Rolling visualisation — each frame compute angular velocity from the
  // ball's linear velocity and rotate the mesh in world space so it
  // actually rolls instead of sliding. rotateOnWorldAxis composes with
  // the existing quaternion so direction changes don't snap.
  useFrame((_, dt) => {
    const k = getKinematic(id);
    if (!k || !ballRef.current) return;
    const speed = Math.hypot(k.vx, k.vz);
    if (speed < 0.001) return;
    // ω axis = up × v then sign-flipped so forward velocity rolls the
    // ball forward (bottom of the ball sweeps backwards relative to motion).
    const ax = k.vz / speed;
    const az = -k.vx / speed;
    ballRef.current.rotateOnWorldAxis(_AXIS.set(ax, 0, az), (speed / ballR) * dt);
  });

  return (
    <group ref={groupRef} position={[x, y, z]}>
      <mesh ref={ballRef} position={[0, ballR, 0]} castShadow>
        <sphereGeometry args={[ballR, 32, 32]} />
        <meshStandardMaterial map={texture ?? undefined} color={texture ? '#ffffff' : color} roughness={0.45} metalness={0.15} />
      </mesh>
    </group>
  );
}
/** Reused Vector3 for ball roll axis — avoids a per-frame allocation. */
const _AXIS = new THREE.Vector3();

function CylinderObject({ id, x, y, z, color = '#cccccc' }: { id: string; x: number; y: number; z: number; color?: string }) {
  const groupRef = useLivePushable(id, 'cylinder', x, z);
  return (
    <group ref={groupRef} position={[x, y, z]}>
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.24, 16]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.2} />
      </mesh>
    </group>
  );
}

function WaypointObject({ x, y, z, color = '#4dffb8' }: { x: number; y: number; z: number; color?: string }) {
  // Waypoints are reference markers — placed deliberately, never displaced
  // by the bot. No live kinematic / no useLivePushable here.
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

/** Start marker — a green ring on the floor with a forward-pointing
 *  chevron arrow that anchors a voice-built program. Always rendered
 *  flat on the ground so it reads as "the bot launches from here facing
 *  THIS way", and the program-overlay arrows chain forward from the
 *  same pose. Rotates with rotY so the kid can aim the bot's start
 *  heading by rotating the marker. */
function StartMarkerObject({ x, y, z, rotY }: { x: number; y: number; z: number; rotY: number }) {
  const ringRef = useRef<THREE.Mesh>(null);
  // Subtle pulse so the start reads as "active anchor", not as a static prop.
  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const mat = ringRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.85 + Math.sin(clock.elapsedTime * 2.2) * 0.30;
  });
  // Chevron arrow geometry — built once. Two triangles forming a ">" shape
  // on the floor pointing along the marker's local +X (= forward).
  const chevronGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const verts = new Float32Array([
      // tip
      0.16, 0, 0,
      // upper inner
      0.04, 0,  0.06,
      // upper outer
      0.04, 0,  0.10,
      // tip (repeat for second triangle)
      0.16, 0, 0,
      // lower outer
      0.04, 0, -0.10,
      // lower inner
      0.04, 0, -0.06,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setIndex([0, 1, 2, 3, 4, 5]);
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      {/* Ring on the floor */}
      <mesh ref={ringRef} position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.16, 0.20, 32]} />
        <meshStandardMaterial
          color="#22c55e"
          emissive="#22c55e"
          emissiveIntensity={0.85}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Inner filled disc — fainter, anchors the eye to the spot */}
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.16, 32]} />
        <meshStandardMaterial
          color="#22c55e"
          emissive="#22c55e"
          emissiveIntensity={0.18}
          transparent
          opacity={0.20}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Forward-pointing chevron — sits inside the ring, indicates heading */}
      <mesh position={[0, 0.008, 0]} geometry={chevronGeom}>
        <meshStandardMaterial
          color="#ffffff"
          emissive="#22c55e"
          emissiveIntensity={1.2}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Soft green glow above the ring */}
      <pointLight position={[0, 0.10, 0]} color="#22c55e" intensity={0.45} distance={0.9} />
    </group>
  );
}

/** Pre-baked tag36h11-style 6×6 inner pattern. Procedural enough to read
 *  as a real AprilTag from above. The 1-cell black border is added by the
 *  texture generator; this string only describes the data area. */
const APRIL_PATTERN = [
  '##.#.#',
  '#..##.',
  '.#####',
  '##.#..',
  '.#..##',
  '#####.',
];
let _aprilTexture: THREE.CanvasTexture | null = null;
function getAprilTagTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (_aprilTexture) return _aprilTexture;
  // 8×8 cells × 16 px = 128 px texture. Fully black border + 6×6 data.
  const SIZE = 128;
  const CELL = SIZE / 8;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Inner 6×6 data: row r, col c at pixel (CELL*(c+1), CELL*(r+1)).
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      ctx.fillStyle = APRIL_PATTERN[r][c] === '#' ? '#0a0a0a' : '#f3eee0';
      ctx.fillRect(CELL * (c + 1), CELL * (r + 1), CELL + 0.5, CELL + 0.5);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;       // sharp pixel edges, no blur
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  _aprilTexture = tex;
  return tex;
}

function AprilTagObject({ x, y, z, rotY }: { x: number; y: number; z: number; rotY: number }) {
  // Markers are decals on the floor — bot rides over them, never displaces
  // them. Single textured plane keeps the mesh count low and lets the
  // canvas-painted pattern do the visual heavy lifting. lay flat, sit
  // 0.5 mm above the ground to avoid Z-fighting with the floor mesh.
  const tex = useMemo(() => getAprilTagTexture(), []);
  return (
    <group position={[x, y + 0.0005, z]} rotation={[0, rotY, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.20, 0.20]} />
        <meshStandardMaterial
          map={tex ?? undefined}
          color={tex ? '#ffffff' : '#0a0a0a'}
          roughness={0.85}
        />
      </mesh>
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
        intensity={9}
        color="#ffffff"
        distance={14}
        angle={Math.PI / 4.5}
        penumbra={0.85}
        decay={1.4}
      />
      <object3D ref={targetRef} position={[0, 0.1, 0]} />
    </>
  );
}

function BotObject({ id, x, y, z, rotY, variant = 'standard' }: { id: string; x: number; y: number; z: number; rotY: number; variant?: 'standard' | 'sumo' }) {
  if (variant === 'sumo') return <SumoBot id={id} x={x} y={y} z={z} rotY={rotY} />;
  return <SparkMiniBot id={id} x={x} y={y} z={z} rotY={rotY} />;
}



/**
 * Spark Mini — the standard sandbox bot. Models a basic Arduino-car kit:
 * round acrylic chassis lifted high off the ground, yellow TT-style gear
 * motors visible under the chassis sides, two rubber wheels with spokes,
 * a front caster ball on a drop bracket, an HC-SR04 ultrasonic mounted
 * on a small post at the bow, and an Arduino-shaped board sitting on top.
 * No face — recognizable by silhouette alone. Local +X is "forward".
 */
function SparkMiniBot({ id, x, y, z, rotY }: { id: string; x: number; y: number; z: number; rotY: number }) {
  // Differential-drive live state — pose drives the visible transform every
  // frame. ensurePose hydrates from props on first render; useEffect resyncs
  // whenever the placed position/heading change so external moves (Move tool,
  // session restore) snap the live pose to match instead of drifting.
  const groupRef      = useRef<THREE.Group>(null);
  const pitchRef      = useRef<THREE.Group>(null);
  const leftWheelRef  = useRef<THREE.Group>(null);
  const rightWheelRef = useRef<THREE.Group>(null);
  useEffect(() => {
    const pose = ensurePose(id, () => ({
      worldX: x, worldZ: z, worldY: 0, heading: rotY, pitch: 0, roll: 0,
      worldVY: 0, driftLocalVX: 0, driftLocalVZ: 0,
      leftWheelRot: 0, rightWheelRot: 0,
      motorTargetLeft: 0, motorTargetRight: 0,
      motorLeft: 0, motorRight: 0,
    }));
    // Only resync pose to props on SIGNIFICANT changes — e.g., the user
    // moved the bot via the Move tool, or the session was just restored.
    // Self-driven commits (where pose already matches gx/gz/headingRad
    // because the controller just wrote them) should NOT resync, otherwise
    // a frame's worth of motion gets snapped backwards every commit.
    const dx = Math.abs(pose.worldX - x);
    const dz = Math.abs(pose.worldZ - z);
    const dh = Math.abs(pose.heading - rotY);
    if (dx > 0.01 || dz > 0.01 || dh > 0.01) {
      syncPoseToPlacement(id, x, z, rotY);
    }
  }, [id, x, z, rotY]);
  useFrame(() => {
    const pose = getPose(id);
    if (!pose) return;
    if (groupRef.current) {
      groupRef.current.position.x = pose.worldX;
      groupRef.current.position.y = y + pose.worldY;
      groupRef.current.position.z = pose.worldZ;
      groupRef.current.rotation.y = pose.heading;
    }
    // Pitch is applied to an INNER group so it composes with heading
    // properly: tilts around the bot's local Z (perpendicular to its
    // forward direction), not around the world axis.
    if (pitchRef.current) {
      pitchRef.current.rotation.z = pose.pitch;
      pitchRef.current.rotation.x = pose.roll;
    }
    // Wheel axles run along the bot's local Z (the cylinder mesh is laid
    // flat with rotation [π/2, 0, 0]). Forward rolling = negative rotation
    // around Z (the bottom of the wheel sweeps from -Y to -X).
    if (leftWheelRef.current)  leftWheelRef.current.rotation.z  = -pose.leftWheelRot;
    if (rightWheelRef.current) rightWheelRef.current.rotation.z = -pose.rightWheelRot;
  });

  return (
    <group ref={groupRef} position={[x, y, z]} rotation={[0, rotY, 0]}>
      <group ref={pitchRef}>
        <SparkMiniBotMesh wheelRefs={{ left: leftWheelRef, right: rightWheelRef }} />
      </group>
    </group>
  );
}

/**
 * Sumo bot — heavier 4-wheel-drive Arduino combat chassis with a wedge plow
 * up front. Wider footprint than Spark Mini, lower stance, all four wheels
 * driven by visible TT-style motors. Front attachment is the iconic mini-sumo
 * scoop — the leading edge sits practically on the floor so it can wedge
 * under an opponent and lift them off the ring. Local +X is "forward".
 */
function SumoBot({ id, x, y, z, rotY }: { id: string; x: number; y: number; z: number; rotY: number }) {
  // Live-drive integration — Sumo is a 4WD bot, so all four wheels track
  // motorLeft/motorRight in sync with whichever side they're on.
  const groupRef       = useRef<THREE.Group>(null);
  const pitchRef       = useRef<THREE.Group>(null);
  const leftWheelRefs  = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const rightWheelRefs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  useEffect(() => {
    const pose = ensurePose(id, () => ({
      worldX: x, worldZ: z, worldY: 0, heading: rotY, pitch: 0, roll: 0,
      worldVY: 0, driftLocalVX: 0, driftLocalVZ: 0,
      leftWheelRot: 0, rightWheelRot: 0,
      motorTargetLeft: 0, motorTargetRight: 0,
      motorLeft: 0, motorRight: 0,
    }));
    // Only resync on big prop changes (Move tool, session restore) — see
    // SparkMiniBot's note for the self-driven-commit race this avoids.
    const dx = Math.abs(pose.worldX - x);
    const dz = Math.abs(pose.worldZ - z);
    const dh = Math.abs(pose.heading - rotY);
    if (dx > 0.01 || dz > 0.01 || dh > 0.01) {
      syncPoseToPlacement(id, x, z, rotY);
    }
  }, [id, x, z, rotY]);
  useFrame(() => {
    const pose = getPose(id);
    if (!pose) return;
    if (groupRef.current) {
      groupRef.current.position.x = pose.worldX;
      groupRef.current.position.y = y + pose.worldY;
      groupRef.current.position.z = pose.worldZ;
      groupRef.current.rotation.y = pose.heading;
    }
    if (pitchRef.current) {
      pitchRef.current.rotation.z = pose.pitch;
      pitchRef.current.rotation.x = pose.roll;
    }
    leftWheelRefs.forEach((r)  => { if (r.current) r.current.rotation.z  = -pose.leftWheelRot; });
    rightWheelRefs.forEach((r) => { if (r.current) r.current.rotation.z = -pose.rightWheelRot; });
  });

  return (
    <group ref={groupRef} position={[x, y, z]} rotation={[0, rotY, 0]}>
      <group ref={pitchRef}>
        <SumoBotMesh wheelRefs={{
          leftFront:  leftWheelRefs[0]!,
          leftRear:   leftWheelRefs[1]!,
          rightFront: rightWheelRefs[0]!,
          rightRear:  rightWheelRefs[1]!,
        }} />
      </group>
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
      // Mirror WallObject — half-cell offset along long axis, half-
      // thickness along perpendicular axis so the wall's edge sits on
      // the grid line (not straddling it).
      const isXAxis = Math.abs(Math.cos(rotY)) > 0.5;
      const offLong = GRID_SIZE / 2;
      const offThick = WALL_THICKNESS / 2;
      const offX = isXAxis ? offLong : offThick;
      const offZ = isXAxis ? offThick : offLong;
      return (
        <mesh position={[offX, WALL_HEIGHT / 2, offZ]} rotation={[0, rotY, 0]}>
          <boxGeometry args={[WALL_LENGTH, WALL_HEIGHT, WALL_THICKNESS]} />
          <GhostMaterial />
        </mesh>
      );
    }
    case 'ramp': {
      // Real wedge silhouette — same cached geometry as the placed mesh,
      // wrapped in GhostMaterial. The triangular profile reads as a ramp
      // immediately so the kid can see the slope direction at the cursor.
      return (
        <mesh position={[0, 0, 0]} rotation={[0, rotY, 0]} geometry={getRampGeometry()}>
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
    case 'start':
      return (
        <group rotation={[0, rotY, 0]}>
          <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.16, 0.20, 32]} />
            <GhostMaterial color="#22c55e" />
          </mesh>
          <mesh position={[0.10, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.10, 0.025]} />
            <GhostMaterial color="#22c55e" />
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
      if (variant === 'sumo') {
        // Sumo — wider 4-wheel chassis with wedge plow up front.
        const wheelR = 0.045, wheelT = 0.028;
        const axleY  = wheelR;
        const plateY = wheelR + 0.018;
        const plateT = 0.012;
        const plateRX = 0.130, plateRZ = 0.105;
        const wheelZouter = plateRZ + wheelT / 2 + 0.003;
        return (
          <group rotation={[0, rotY, 0]}>
            {/* Lower armor plate */}
            <mesh position={[0, plateY, 0]}>
              <boxGeometry args={[plateRX * 2, plateT, plateRZ * 2]} />
              <GhostMaterial color="#ff6060" />
            </mesh>
            {/* Top armor body */}
            <mesh position={[-0.005, plateY + plateT / 2 + 0.020, 0]}>
              <boxGeometry args={[0.190, 0.040, 0.180]} />
              <GhostMaterial color="#ff6060" />
            </mesh>
            {/* Wedge plow */}
            {(() => {
              const wedgeLen = 0.080;
              const wedgeWidth = plateRZ * 2 + 0.010;
              const tilt = Math.atan2(plateY + plateT / 2, wedgeLen);
              const cx = plateRX + (wedgeLen / 2) * Math.cos(tilt);
              const cy = (plateY + plateT / 2) - (wedgeLen / 2) * Math.sin(tilt);
              return (
                <mesh position={[cx, cy, 0]} rotation={[0, 0, -tilt]}>
                  <boxGeometry args={[wedgeLen, 0.005, wedgeWidth]} />
                  <GhostMaterial color="#ff6060" />
                </mesh>
              );
            })()}
            {/* Four wheels */}
            {[ [0.075, wheelZouter], [0.075, -wheelZouter], [-0.075, wheelZouter], [-0.075, -wheelZouter] ].map(([wx, wz], i) => (
              <mesh key={i} position={[wx, axleY, wz]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[wheelR, wheelR, wheelT, 20]} />
                <GhostMaterial color="#ff6060" />
              </mesh>
            ))}
          </group>
        );
      }
      // Spark Mini — simplified silhouette of the actual SparkMiniBot:
      // raised round chassis + wheels + caster bracket + sensor on a post.
      const wheelR = 0.052, wheelT = 0.024;
      const axleY = wheelR;
      const plateY = wheelR + 0.030;
      const plateRX = 0.110, plateRZ = 0.090;
      const wheelX = -0.020;
      const wheelZouter = plateRZ + wheelT / 2 + 0.003;
      return (
        <group rotation={[0, rotY, 0]}>
          {/* Chassis plate — stretched cylinder for the round-cornered look */}
          <mesh position={[0, plateY, 0]} scale={[plateRX / 0.090, 1, plateRZ / 0.090]}>
            <cylinderGeometry args={[0.090, 0.090, 0.008, 24]} />
            <GhostMaterial />
          </mesh>
          {/* Drive wheels */}
          {[wheelZouter, -wheelZouter].map((zPos, i) => (
            <mesh key={i} position={[wheelX, axleY, zPos]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[wheelR, wheelR, wheelT, 20]} />
              <GhostMaterial />
            </mesh>
          ))}
          {/* Caster bracket + ball */}
          <mesh position={[plateRX - 0.030, (plateY - 0.004) / 2 + 0.016, 0]}>
            <boxGeometry args={[0.018, plateY - 0.036, 0.018]} />
            <GhostMaterial />
          </mesh>
          <mesh position={[plateRX - 0.030, 0.018, 0]}>
            <sphereGeometry args={[0.018, 14, 10]} />
            <GhostMaterial />
          </mesh>
          {/* Sensor post + PCB */}
          <mesh position={[plateRX - 0.012, plateY + 0.022, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.036, 10]} />
            <GhostMaterial />
          </mesh>
          <mesh position={[plateRX - 0.012, plateY + 0.044, 0]}>
            <boxGeometry args={[0.018, 0.024, 0.075]} />
            <GhostMaterial />
          </mesh>
        </group>
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
    case 'ramp':     return <RampObject x={x} y={y} z={z} rotY={rotY} />;
    case 'block':    return <BlockObject id={obj.id} x={x} y={y} z={z} rotY={rotY} color={obj.color} />;
    case 'cone':     return <ConeObject id={obj.id} x={x} y={y} z={z} />;
    case 'sphere':   return <SphereObject id={obj.id} x={x} y={y} z={z} color={obj.color} />;
    case 'cylinder': return <CylinderObject id={obj.id} x={x} y={y} z={z} color={obj.color} />;
    case 'waypoint': return <WaypointObject x={x} y={y} z={z} color={obj.color} />;
    case 'start':    return <StartMarkerObject x={x} y={y} z={z} rotY={obj.headingRad ?? rotY} />;
    case 'apriltag': return <AprilTagObject x={x} y={y} z={z} rotY={rotY} />;
    case 'bot':      return <BotObject id={obj.id} x={x} y={y} z={z} rotY={obj.headingRad ?? rotY} variant={obj.botVariant} />;
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
  onMove,
  builderEnabled = false,
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
  onMove?: () => void;
  /** Builder mode is open. Floating ↻ / ✕ / ⤢ toolbar only appears in
   *  builder mode — outside it (just looking at a finished sandbox)
   *  the kid shouldn't see editing chrome at all. */
  builderEnabled?: boolean;
}) {
  // Auto corner posts. Walk every wall, count how many walls have an
  // endpoint at each grid intersection. Intersections visited by 2+
  // wall ends are corners — render a small filler block there to close
  // any visible inside-corner wedge.
  const cornerKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const obj of objects) {
      if (obj.type !== 'wall') continue;
      const isXAxis = ((obj.rotY ?? 0) % 2) === 0;
      const ends: Array<[number, number]> = isXAxis
        ? [[Math.round(obj.gx), Math.round(obj.gz)], [Math.round(obj.gx) + 1, Math.round(obj.gz)]]
        : [[Math.round(obj.gx), Math.round(obj.gz)], [Math.round(obj.gx), Math.round(obj.gz) + 1]];
      for (const [ex, ez] of ends) {
        const k = `${ex},${ez}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .map(([k]) => k.split(',').map(Number) as [number, number]);
  }, [objects]);

  return (
    <group>
      {cornerKeys.map(([gx, gz]) => (
        <WallCornerPost key={`corner-${gx},${gz}`} gx={gx} gz={gz} />
      ))}
      {objects.map((obj) => {
        const { x, y, z } = gridToWorld(obj);
        // Selection ring + hover highlight need the actual rendered
        // position, which for walls is offset half a cell so the ring
        // sits around the wall rather than beside it.
        const rendered = gridToWorldRendered(obj);
        const rotY = rotationToRadians(obj.rotY ?? 0);
        const isSelected = obj.id === selectedId;
        const isDragging = obj.id === draggedId;
        const isHovered  = obj.id === hoveredId && toolActive;
        return (
          <group
            key={obj.id}
            onPointerDown={(e) => {
              e.stopPropagation();
              // While a placement tool is active, clicks on existing
              // objects do NOT switch to selection mode. The kid stays in
              // placement mode (most likely they accidentally clicked an
              // existing wall while sweeping out a row); selection is
              // entered only via the explicit Select tool. The onClick
              // handler below still routes to stack-on-top (which itself
              // is gated against meaningless cases like wall-on-wall).
              if (toolActive) return;
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
            {/* Selection / hover affordances are builder-mode only. Outside
                Builder there's nothing the kid can do with a selected object,
                so the chrome would just be visual noise on every click. */}
            {builderEnabled && (isSelected || isDragging) && <SelectionRing x={x} z={z} />}
            {builderEnabled && isHovered && (
              <StackTargetHighlight x={x} y={y} z={z} rotY={rotY} type={obj.type} />
            )}
            {/* Toolbar only when in select mode (no placement tool active),
                and only on the selected object that isn't being dragged.
                Hiding it during placement keeps the kid from accidentally
                clicking ↻/✕ while rapidly dropping more objects. */}
            {builderEnabled && isSelected && !isDragging && !toolActive && (
              <SelectionToolbar obj={obj} onRotate={onRotate} onDelete={onDelete} onMove={onMove} />
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
