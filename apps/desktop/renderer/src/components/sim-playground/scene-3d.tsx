'use client';

/**
 * Scene3D — concept-aware 3D scene.
 * Drawing concepts → RobotGantry follows SVG path on paper canvas.
 * Competition/nav concepts → ChallengeSim runs autonomous robot behaviour.
 */

import { useMemo, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Grid, OrbitControls, GizmoHelper, GizmoViewcube } from '@react-three/drei';
import * as THREE from 'three';

import { RobotGantry } from './robot-gantry';
import { CanvasSurface } from './canvas-surface';
import { ChallengeSim, getSimMode } from './challenge-sim';
import { SceneObjectsRenderer, BuilderCursor } from './scene-objects';
import { ProgramOverlay3D } from './program-overlay-3d';
import { GRID_SIZE, worldToGridFloat, clampToArena, rotationStepsForType, type SceneObject, type ToolDef } from '@/lib/scene-builder';
import type { SimPoint } from '@/lib/sim-path-utils';
import { CANVAS_W, CANVAS_H } from '@/lib/sim-path-utils';
import { getEnvironment, type ConceptEnvironment } from '@/lib/concept-environments';

// ─── Utility line ─────────────────────────────────────────────────────────────

function NativeLine({ points, color, opacity = 1 }: { points: [number, number, number][]; color: string; opacity?: number }) {
  const obj = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const mat = new THREE.LineBasicMaterial({ color, opacity, transparent: opacity < 1 });
    return new THREE.Line(geo, mat);
  }, [points, color, opacity]);
  useEffect(() => () => { obj.geometry.dispose(); (obj.material as THREE.Material).dispose(); }, [obj]);
  return <primitive object={obj} />;
}

// ─── AprilTag marker ──────────────────────────────────────────────────────────

const APRIL_DOTS: [number, number, string][] = [
  [-0.055, -0.055, '#111'], [0, -0.055, '#f5f0e6'], [0.055, -0.055, '#111'],
  [-0.055, 0, '#f5f0e6'], [0.055, 0, '#111'],
  [-0.055, 0.055, '#111'], [0, 0.055, '#111'], [0.055, 0.055, '#f5f0e6'],
];

function AprilTagMarker({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.3, 0.3]} />
        <meshStandardMaterial color="#111" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.21, 0.21]} />
        <meshStandardMaterial color="#f5f0e6" roughness={0.85} />
      </mesh>
      {APRIL_DOTS.map(([dx, dz, col], i) => (
        <mesh key={i} position={[dx, 0.004, dz]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.03, 0.03]} />
          <meshStandardMaterial color={col} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Coordinate axes ──────────────────────────────────────────────────────────

function CoordAxes() {
  const L = 0.8; const cr = 0.04; const ch = 0.12;
  return (
    <group position={[-CANVAS_W / 2 - 0.05, 0.01, CANVAS_H / 2 + 0.05]}>
      {[
        { pos: [L / 2, 0, 0] as [number,number,number], size: [L, 0.018, 0.018] as [number,number,number], cone: [L + ch/2, 0, 0] as [number,number,number], rot: [0, 0, -Math.PI/2] as [number,number,number], color: '#ff4060' },
        { pos: [0, 0, -L / 2] as [number,number,number], size: [0.018, 0.018, L] as [number,number,number], cone: [0, 0, -L - ch/2] as [number,number,number], rot: [Math.PI/2, 0, 0] as [number,number,number], color: '#4080ff' },
        { pos: [0, L / 2, 0] as [number,number,number], size: [0.018, L, 0.018] as [number,number,number], cone: [0, L + ch/2, 0] as [number,number,number], rot: [0, 0, 0] as [number,number,number], color: '#4dffb8' },
      ].map(({ pos, size, cone, rot, color }) => (
        <group key={color}>
          <mesh position={pos}><boxGeometry args={size} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} /></mesh>
          <mesh position={cone} rotation={rot}><coneGeometry args={[cr, ch, 8]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} /></mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Overhead camera ──────────────────────────────────────────────────────────

function OverheadCamera() {
  const H = 3.5;
  return (
    <group position={[0, H, 0]}>
      <mesh><boxGeometry args={[0.22, 0.16, 0.22]} /><meshStandardMaterial color="#1a1e2e" roughness={0.6} metalness={0.4} /></mesh>
      <mesh position={[0, -0.12, 0]}><cylinderGeometry args={[0.055, 0.065, 0.1, 16]} /><meshStandardMaterial color="#050808" roughness={0.2} metalness={0.6} /></mesh>
      <mesh position={[0, -0.175, 0]}><circleGeometry args={[0.045, 16]} /><meshStandardMaterial color="#1a3a6a" roughness={0.1} metalness={0.3} transparent opacity={0.8} /></mesh>
      {([-1, 1] as const).map(sx => ([-1, 1] as const).map(sz => (
        <NativeLine key={`${sx}${sz}`} points={[[0,0,0],[sx*CANVAS_W*0.55,-H+0.05,sz*CANVAS_H*0.55]]} color="#5de4ff" opacity={0.15} />
      )))}
      <mesh position={[0, 1.6, 0]}><cylinderGeometry args={[0.02, 0.02, 3.2, 8]} /><meshStandardMaterial color="#2a2e3e" roughness={0.7} /></mesh>
    </group>
  );
}

// ─── Animated traffic cone ────────────────────────────────────────────────────

function TrafficCone({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  const ref = useRef<THREE.Group>(null);
  const off = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.4 + off.current) * 0.015;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.6 + off.current) * 0.04;
  });
  return (
    <group ref={ref} position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI/2, 0, 0]}><cylinderGeometry args={[0.09, 0.09, 0.016, 16]} /><meshStandardMaterial color="#111" roughness={0.9} /></mesh>
      <mesh position={[0, 0.14, 0]}><coneGeometry args={[0.06, 0.26, 16]} /><meshStandardMaterial color="#ff5500" emissive="#ff3300" emissiveIntensity={0.2} roughness={0.6} /></mesh>
      <mesh position={[0, 0.08, 0]}><cylinderGeometry args={[0.065, 0.065, 0.03, 16]} /><meshStandardMaterial color="#ffffff" roughness={0.5} /></mesh>
    </group>
  );
}

// ─── Sumo ring ────────────────────────────────────────────────────────────────

function SumoRing({ radius }: { radius: number }) {
  const borderRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (borderRef.current) (borderRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + Math.sin(clock.elapsedTime * 1.5) * 0.2;
    if (glowRef.current) glowRef.current.intensity = 0.6 + Math.sin(clock.elapsedTime * 1.5) * 0.3;
  });
  return (
    <group>
      <mesh position={[0, -0.008, 0]} rotation={[-Math.PI/2, 0, 0]}><circleGeometry args={[radius, 64]} /><meshStandardMaterial color="#f0f0f0" roughness={0.7} /></mesh>
      <mesh ref={borderRef} position={[0, -0.004, 0]} rotation={[-Math.PI/2, 0, 0]}><ringGeometry args={[radius-0.06, radius, 64]} /><meshStandardMaterial color="#cc0000" emissive="#cc0000" emissiveIntensity={0.3} roughness={0.5} /></mesh>
      <mesh position={[0, -0.006, 0]} rotation={[-Math.PI/2, 0, 0]}><circleGeometry args={[0.06, 32]} /><meshStandardMaterial color="#cc0000" roughness={0.5} /></mesh>
      <pointLight ref={glowRef} position={[0, 0.5, 0]} color="#ff2000" intensity={0.6} distance={3} />
    </group>
  );
}

// ─── Sandbox atmosphere — studio lighting at four corners ────────────────────

/** Four studio light stands, one in each corner. headY is the top of the
 *  pole / center of the softbox. Each beam aims at the workspace centre
 *  (the world origin) so the eye lands on the build, not the corners.
 *  All four are white — colored beams tinted the build distractingly.
 *  Height + spotlight params kept in lockstep with the placeable
 *  studio-light prop (scene-objects.tsx → StudioLightObject) so the
 *  fixed corner lights and the user-placed ones look identical. */
const STUDIO_LIGHT_HEAD_Y = 1.6;
const SANDBOX_ORBS = [
  { x: -2.8, z: -2.8, headY: STUDIO_LIGHT_HEAD_Y }, // back-left
  { x:  2.8, z: -2.6, headY: STUDIO_LIGHT_HEAD_Y }, // back-right
  { x: -2.6, z:  2.8, headY: STUDIO_LIGHT_HEAD_Y }, // front-left
  { x:  2.8, z:  2.8, headY: STUDIO_LIGHT_HEAD_Y }, // front-right
];

/** Half-angle of the spotlight cone (in radians). Wider = more spill,
 *  narrower = more focused. */
const SPOT_ANGLE = Math.PI / 4.5;

function StudioLight({
  x, z, headY,
}: { x: number; z: number; headY: number }) {
  const headRef   = useRef<THREE.Group>(null);
  const bulbRef   = useRef<THREE.Mesh>(null);
  const lightRef  = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const off = useRef(Math.random() * Math.PI * 2);

  // Wire the spotlight target once on mount. R3F doesn't promote the
  // default spotLight.target Object3D into the scene graph, so without
  // this the light has no aim point and barely illuminates anything.
  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
      lightRef.current.target.updateMatrixWorld();
    }
  }, []);

  // Re-aim the head at the workspace centre EVERY frame. Doing this in
  // useEffect runs once before the parent's world matrix is settled,
  // which produces the wrong tilt; running it from useFrame guarantees
  // the head's world transform is up-to-date and correct each render.
  useFrame(({ clock }) => {
    if (headRef.current) {
      headRef.current.lookAt(0, 0.1, 0);
    }
    if (bulbRef.current) {
      const mat = bulbRef.current.material as THREE.MeshStandardMaterial;
      // Subtle bulb pulse so it reads as a live filament behind the
      // diffuser — but no bobbing, these are bolted to the floor.
      mat.emissiveIntensity = 1.6 + Math.sin(clock.elapsedTime * 1.3 + off.current) * 0.25;
    }
  });

  return (
    <>
      {/* Visible stand: tripod base + pole + light head, all stationary. */}
      <group position={[x, 0, z]}>
        {/* Disc base — slightly wider than the pole for stability look */}
        <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.13, 0.17, 0.04, 16]} />
          <meshStandardMaterial color="#1a1f2e" roughness={0.85} metalness={0.3} />
        </mesh>
        {/* Vertical pole — stops short of the head so the housing isn't
            speared by the cylinder. The head sits above the pole top
            with a knuckle + yoke in between like a real lighting rig. */}
        <mesh position={[0, (headY - 0.18) * 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, headY - 0.18, 8]} />
          <meshStandardMaterial color="#252b40" roughness={0.6} metalness={0.5} />
        </mesh>
        {/* Mounting knuckle — small cube at the top of the pole the head
            attaches to. Visible boundary between pole and head. */}
        <mesh position={[0, headY - 0.16, 0]} castShadow>
          <boxGeometry args={[0.05, 0.06, 0.05]} />
          <meshStandardMaterial color="#2f3550" roughness={0.5} metalness={0.6} />
        </mesh>
        {/* Yoke ring at the head's pivot — visual continuation of the
            mount bracket where the head tilts. Sits at the underside of
            the housing so it reads as a hinge, not a halo. */}
        <mesh position={[0, headY - 0.11, 0]}>
          <torusGeometry args={[0.05, 0.014, 8, 16]} />
          <meshStandardMaterial color="#2f3550" roughness={0.5} metalness={0.6} />
        </mesh>
        {/* Light head — lookAt(0, 0.1, 0) per frame tilts it down AND
            rotates around Y so it actually faces the build. Three.js
            Object3D.lookAt for non-camera/non-light objects orients +Z
            (not -Z) toward the target, so the softbox sits at +Z and
            the housing at -Z. */}
        <group ref={headRef} position={[0, headY, 0]}>
          {/* Housing — back of the light, away from origin */}
          <mesh position={[0, 0, -0.05]} castShadow>
            <boxGeometry args={[0.20, 0.18, 0.12]} />
            <meshStandardMaterial color="#2a3148" roughness={0.55} metalness={0.45} />
          </mesh>
          {/* Glowing softbox face — the front, shining at the build */}
          <mesh ref={bulbRef} position={[0, 0, 0.02]}>
            <boxGeometry args={[0.24, 0.22, 0.025]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#fff4d6"
              emissiveIntensity={1.6}
              roughness={0.25}
            />
          </mesh>
          {/* Thin frame around the softbox face for definition */}
          <mesh position={[0, 0, 0.005]}>
            <boxGeometry args={[0.26, 0.24, 0.012]} />
            <meshStandardMaterial color="#1a1f2e" roughness={0.8} />
          </mesh>
        </group>
      </group>

      {/* Real spot illuminating the workspace. Target is the helper
          object3D below at (0, 0.1, 0) — slightly above the floor so
          the beam lands on objects rather than disappearing into the
          grid. Params match StudioLightObject so corner + placed
          lights cast identical pools. */}
      <spotLight
        ref={lightRef}
        position={[x, headY, z]}
        intensity={9}
        color="#ffffff"
        distance={14}
        angle={SPOT_ANGLE}
        penumbra={0.85}
        decay={1.4}
      />
      <object3D ref={targetRef} position={[0, 0.1, 0]} />
    </>
  );
}

function StageLights() {
  return (
    <>
      {/* Very low ambient so the scene isn't pitch-black between spots
          but the spotlight cones are clearly the dominant source. */}
      <ambientLight intensity={0.12} color="#a9b2d8" />

      {SANDBOX_ORBS.map((o, i) => (
        <StudioLight key={i} {...o} />
      ))}
    </>
  );
}

// ─── Maze wall ────────────────────────────────────────────────────────────────

function MazeWall({ x, z, width, depth, rotation = 0 }: { x: number; z: number; width: number; depth: number; rotation?: number }) {
  return (
    <mesh position={[x, 0.08, z]} rotation={[0, rotation, 0]} castShadow receiveShadow>
      <boxGeometry args={[width, 0.16, depth]} />
      <meshStandardMaterial color="#0a2a10" emissive="#002200" emissiveIntensity={0.3} roughness={0.8} />
    </mesh>
  );
}

// ─── Waypoint prop ────────────────────────────────────────────────────────────

function WaypointProp({ x, z, color }: { x: number; z: number; color: string }) {
  const sphereRef = useRef<THREE.Mesh>(null);
  const off = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    if (!sphereRef.current) return;
    (sphereRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * 2 + off.current) * 0.35;
    sphereRef.current.position.y = 0.32 + Math.sin(clock.elapsedTime * 1.8 + off.current) * 0.025;
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.012, 0.012, 0.30, 8]} /><meshStandardMaterial color="#303040" roughness={0.6} metalness={0.5} /></mesh>
      <mesh ref={sphereRef} position={[0, 0.32, 0]}><sphereGeometry args={[0.055, 16, 16]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.3} /></mesh>
      <pointLight position={[0, 0.32, 0]} color={color} intensity={0.35} distance={0.8} />
    </group>
  );
}

// ─── Unit circle overlay ──────────────────────────────────────────────────────

function UnitCircleFloor() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15 + Math.sin(clock.elapsedTime * 0.8) * 0.08;
  });
  return (
    <group>
      <mesh ref={ref} position={[0, -0.006, 0]} rotation={[-Math.PI/2, 0, 0]}>
        <ringGeometry args={[0.88, 0.92, 64]} />
        <meshStandardMaterial color="#7040ff" emissive="#7040ff" emissiveIntensity={0.15} roughness={0.5} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

// ─── Circuit floor ────────────────────────────────────────────────────────────

function CircuitFloor() {
  const traces = useMemo(() => {
    const h: [number, number, number, number][] = [-0.8, -0.4, 0, 0.4, 0.8].map(z => [0, z, 2.2, 0.01]);
    const v: [number, number, number, number][] = [-0.8, -0.4, 0, 0.4, 0.8].map(x => [x, 0, 0.01, 2.2]);
    return [...h, ...v];
  }, []);
  return (
    <group>
      {traces.map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, -0.005, z]} rotation={[-Math.PI/2, 0, 0]}>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color="#00e870" emissive="#00e870" emissiveIntensity={0.25} transparent opacity={0.5} />
        </mesh>
      ))}
      {[-0.8, -0.4, 0, 0.4, 0.8].flatMap((x, xi) =>
        [-0.8, -0.4, 0, 0.4, 0.8].map((z, zi) => (
          <mesh key={`via-${xi}-${zi}`} position={[x, -0.004, z]} rotation={[-Math.PI/2, 0, 0]}>
            <circleGeometry args={[0.025, 8]} />
            <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={0.5} />
          </mesh>
        ))
      )}
    </group>
  );
}

// ─── Background lerper ────────────────────────────────────────────────────────

function BackgroundLerper({ targetColor }: { targetColor: string }) {
  const { scene, gl } = useThree();
  const target = useMemo(() => new THREE.Color(targetColor), [targetColor]);
  const cur = useRef(new THREE.Color(targetColor));
  useFrame(() => {
    cur.current.lerp(target, 0.04);
    scene.background = cur.current.clone();
    scene.fog = new THREE.Fog(cur.current, 10, 32);
    gl.setClearColor(cur.current, 1);
  });
  return null;
}

// ─── Concept-specific prop layer ──────────────────────────────────────────────

function ConceptArenaProps({ env, skipCones = false }: { env: ConceptEnvironment; skipCones?: boolean }) {
  const { arenaType, cones, walls, waypoints, sumoRingRadius } = env;
  return (
    <group>
      {!skipCones && cones?.map((c, i) => <TrafficCone key={i} {...c} />)}
      {walls?.map((w, i) => <MazeWall key={i} {...w} />)}
      {waypoints?.map((wp, i) => <WaypointProp key={i} x={wp.x} z={wp.z} color={wp.color} />)}
      {arenaType === 'sumo' && sumoRingRadius && <SumoRing radius={sumoRingRadius} />}
      {env.label === 'Unit Circle Field' && <UnitCircleFloor />}
    </group>
  );
}

// ─── Full scene content ───────────────────────────────────────────────────────

type SceneContentProps = {
  settledLines: SimPoint[][];
  activeLine: SimPoint[];
  penPos: SimPoint | null;
  isAnimating: boolean;
  showGrid: boolean;
  showAxes: boolean;
  showCamera: boolean;
  env: ConceptEnvironment;
  conceptId?: string | null;
  builderEnabled?: boolean;
  showPlacementGrid?: boolean;
  sceneObjects?: SceneObject[];
  selectedObjectId?: string | null;
  draggedObjectId?: string | null;
  hoveredObjectId?: string | null;
  activeTool?: ToolDef | null;
  onPlaceAt?: (gx: number, gz: number, rotY?: 0 | 1 | 2 | 3) => void;
  onSelectObject?: (id: string | null) => void;
  onStackOnTop?: (objectId: string) => void;
  onStartDrag?: (objectId: string) => void;
  onDragMove?: (gx: number, gz: number) => void;
  onEndDrag?: () => void;
  onHoverObject?: (id: string | null) => void;
  onRotateSelected?: () => void;
  onDeleteSelected?: () => void;
  /** Toolbar's move button — kicks the selected object into "follow the
   *  cursor until the next floor click" mode (no mouse-button hold needed). */
  onMoveSelected?: () => void;
  /** 'press' = traditional drag (mouse held); 'follow' = click-once / click-once. */
  dragMode?: 'press' | 'follow';
};

function SceneContent({
  settledLines, activeLine, penPos, isAnimating, showGrid, showAxes, showCamera, env, conceptId,
  builderEnabled = false, showPlacementGrid = false,
  sceneObjects = [], selectedObjectId = null, draggedObjectId = null, hoveredObjectId = null,
  activeTool = null,
  onPlaceAt, onSelectObject, onStackOnTop, onStartDrag, onDragMove, onEndDrag, onHoverObject,
  onRotateSelected, onDeleteSelected, onMoveSelected, dragMode = 'press',
}: SceneContentProps) {
  const simMode = getSimMode(conceptId);
  const isDrawingMode = simMode === 'drawing';
  // True for blank/sandbox sessions — no paper, no auto-anim, no demo robot.
  // These sessions are pure 3D workspaces where the user places scene objects.
  const isSandboxEnv = env.label === 'Sandbox';

  // Cursor grid coords for the builder ghost preview
  const [cursor, setCursor] = useState<{ gx: number; gz: number } | null>(null);
  // Ghost rotation while a tool is active — right-click to advance 90°.
  // Resets to 0 whenever the active tool changes so the cursor doesn't
  // start pre-rotated for the new tool.
  const [cursorRotY, setCursorRotY] = useState<0 | 1 | 2 | 3>(0);
  useEffect(() => { setCursorRotY(0); }, [activeTool?.id]);
  const isDragging = builderEnabled && draggedObjectId !== null;
  const showCursor = builderEnabled && activeTool !== null && cursor !== null && !isDragging;

  // End drag on global pointerup — only for traditional press-drags.
  // Toolbar-initiated 'follow' moves end on the next floor click instead,
  // so the mouse-up from clicking the Move button doesn't immediately
  // exit the move.
  useEffect(() => {
    if (!isDragging || dragMode !== 'press') return;
    const onUp = () => onEndDrag?.();
    window.addEventListener('pointerup', onUp);
    return () => window.removeEventListener('pointerup', onUp);
  }, [isDragging, dragMode, onEndDrag]);

  // Right-click anywhere during a drag rotates the object being moved.
  // Without this, the contextmenu handler on the floor only fires when
  // the cursor is over empty floor — but during follow-drag the dragged
  // object is right under the cursor, intercepting the event and
  // stopping propagation. Window-level listener bypasses that.
  useEffect(() => {
    if (!isDragging) return;
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onRotateSelected?.();
    };
    window.addEventListener('contextmenu', onContext);
    return () => window.removeEventListener('contextmenu', onContext);
  }, [isDragging, onRotateSelected]);


  return (
    <>
      <BackgroundLerper targetColor={env.background} />

      {/* Lighting */}
      <hemisphereLight args={[env.ambientColor as unknown as THREE.ColorRepresentation, '#121520', isSandboxEnv ? 0.6 : 0.42]} />
      <ambientLight intensity={isSandboxEnv ? 0.55 : 0.38} color={env.ambientColor} />
      <directionalLight position={[4.5, 9, 4]} intensity={1.55} color={env.keyLightColor} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.00025} shadow-normalBias={0.02}
        shadow-camera-far={22} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} />
      <directionalLight position={[-5, 5, -4]} intensity={0.35} color={env.fillLightColor} />

      {/* Stage lights — colourful corner lamps for the sandbox playspace.
          Concept envs keep their muted accent lighting. */}
      {isSandboxEnv ? (
        <StageLights />
      ) : (
        <>
          <pointLight position={[-3, 4, -2]} intensity={0.55} color={env.accentColor} />
          <pointLight position={[3.5, 2.2, 3]} intensity={0.28} color={env.accentColor} />
        </>
      )}

      {/* Ground — at exactly y=0 so placed objects (whose bottoms compute to
          y=0 by design) sit flush with the surface. Z-fight prevention for
          mat / canvas / shadow planes is handled per-object via tiny +y
          offsets (0.001–0.005), not by sinking the floor. */}
      <mesh
        rotation={[-Math.PI/2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onPointerMove={builderEnabled ? (e) => {
          // Float coords pass through to placement/drag handlers; the
          // index.tsx layer decides per-type whether to round (walls) or
          // keep float (everything else). Cursor preview snaps for walls
          // and follows the mouse for free-place props.
          const rawF = worldToGridFloat(e.point.x, e.point.z);
          const cF = clampToArena(rawF.gx, rawF.gz);
          if (isDragging) {
            onDragMove?.(cF.gx, cF.gz);
          } else if (activeTool) {
            const isWall = activeTool.type === 'wall';
            const cgx = isWall ? Math.round(cF.gx) : cF.gx;
            const cgz = isWall ? Math.round(cF.gz) : cF.gz;
            if (!cursor || cursor.gx !== cgx || cursor.gz !== cgz) {
              setCursor({ gx: cgx, gz: cgz });
            }
          }
        } : undefined}
        onPointerLeave={builderEnabled ? () => setCursor(null) : undefined}
        onClick={builderEnabled ? (e) => {
          e.stopPropagation();
          if (isDragging) {
            // Press-drag: floor click while dragging → no-op, pointerup
            // already ended the drag. Follow-drag: this click IS the
            // drop, so end the drag here.
            if (dragMode === 'follow') onEndDrag?.();
            return;
          }
          if (activeTool && onPlaceAt) {
            const rawF = worldToGridFloat(e.point.x, e.point.z);
            const cF = clampToArena(rawF.gx, rawF.gz);
            onPlaceAt(cF.gx, cF.gz, cursorRotY);
          } else if (onSelectObject) {
            // Click on empty floor in select mode → clear selection
            onSelectObject(null);
          }
        } : undefined}
        // Right-click while placing rotates the ghost 90°. Without this
        // the kid has to drop, click-select, then rotate — three steps
        // for what should be one. We swallow the browser context menu
        // by also handling onContextMenu on the canvas wrapper.
        onPointerDown={builderEnabled && activeTool ? (e) => {
          if (e.button === 2) {
            e.stopPropagation();
            // nativeEvent for preventDefault (R3F event doesn't expose it cleanly)
            (e.nativeEvent as MouseEvent).preventDefault?.();
            // Cycle through the active tool's visually-distinct rotations
            // (walls = 2, bots/apriltags = 4, symmetric props = 1 / no-op).
            // Clockwise step from above = decrement by 1 mod steps.
            if (activeTool) {
              const steps = rotationStepsForType(activeTool.type);
              if (steps > 1) {
                setCursorRotY((r) => ((r + (steps - 1)) % steps) as 0 | 1 | 2 | 3);
              }
            }
          }
        } : undefined}
      >
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={env.groundColor} roughness={0.92} metalness={0.05} />
      </mesh>
      {/* Sits just above the floor (y=0) so the shadow plane isn't occluded
          by it. Was previously at -0.015 when the floor was sunk to -0.018; both
          moved together when we lifted the floor to make placed objects flush. */}
      <ContactShadows position={[0, 0.002, 0]} opacity={0.45} scale={24} blur={2.8} far={5} color="#000000" />

      {/* Grid — gives spatial reference everywhere it's enabled, including
          inside builder mode in the sandbox so kids have alignment cues
          while placing walls / objects. The denser placement-grid overlay
          (cyan/purple, cellSize 0.25) is still available as a separate
          opt-in toggle for fine snapping. */}
      {showGrid && (
        <Grid position={[0, 0.001, 0]} args={[20, 20]} cellSize={GRID_SIZE} cellThickness={0.35}
          cellColor={env.gridColor} sectionSize={1} sectionThickness={0.65} sectionColor={env.sectionColor}
          fadeDistance={20} fadeStrength={1.65} infiniteGrid followCamera={false} />
      )}

      {/* Paper canvas only for drawing mode (and not for raw sandbox env) */}
      {isDrawingMode && !isSandboxEnv && (
        <CanvasSurface settledLines={settledLines} activeLine={activeLine} showGrid={showGrid} />
      )}

      {/* Concept-specific arena props — suppressed in builder mode so the user
          gets a clean canvas to build on */}
      {!builderEnabled && (
        <ConceptArenaProps env={env} skipCones={simMode === 'cone-ring'} />
      )}

      {/* User-placed sceneObjects (builder mode + any session that has them) */}
      {sceneObjects.length > 0 && (
        <SceneObjectsRenderer
          objects={sceneObjects}
          selectedId={selectedObjectId}
          draggedId={draggedObjectId}
          hoveredId={hoveredObjectId}
          toolActive={activeTool !== null}
          onSelect={(id) => onSelectObject?.(id)}
          onStackOnTop={(id) => onStackOnTop?.(id)}
          onStartDrag={(id) => onStartDrag?.(id)}
          onHoverObject={(id) => onHoverObject?.(id)}
          onRotate={onRotateSelected}
          onDelete={onDeleteSelected}
          onMove={onMoveSelected}
          builderEnabled={builderEnabled}
        />
      )}

      {/* Program preview — numbered arrows / arcs / pause pucks chained
          from the program origin. Prefers a placed Start marker when the
          kid has dropped one (so the preview is anchored regardless of
          where the bot has drifted to); falls back to the bot's current
          pose. Auto-disappears when the program is empty. */}
      <ProgramOverlay3D
        activeBotId={sceneObjects.find((o) => o.type === 'bot')?.id ?? null}
        startObject={sceneObjects.find((o) => o.type === 'start') ?? null}
      />

      {/* Ghost cursor preview while a tool is active.
          When hovering another object with a tool active, position the ghost
          on top of that object (stack target). */}
      {showCursor && cursor && activeTool && (() => {
        const stackTarget = hoveredObjectId
          ? sceneObjects.find((o) => o.id === hoveredObjectId) ?? null
          : null;
        const cgx = stackTarget ? stackTarget.gx : cursor.gx;
        const cgz = stackTarget ? stackTarget.gz : cursor.gz;
        const cgy = stackTarget ? (stackTarget.gy ?? 0) + 1 : 0;
        return (
          <BuilderCursor
            tool={activeTool}
            gx={cgx}
            gz={cgz}
            gy={cgy}
            visible={true}
            rotY={(cursorRotY * Math.PI) / 2}
          />
        );
      })()}

      {/* Placement grid overlay (builder mode, toggleable) */}
      {builderEnabled && showPlacementGrid && (
        <Grid
          position={[0, -0.005, 0]}
          args={[20, 20]}
          cellSize={0.25}
          cellThickness={0.5}
          cellColor="#5de4ff"
          sectionSize={1}
          sectionThickness={0.9}
          sectionColor="#a855f7"
          fadeDistance={18}
          fadeStrength={1.2}
          infiniteGrid
          followCamera={false}
        />
      )}

      {/* Robot/simulation — drawing or autonomous.
          Suppressed in builder mode and in sandbox env (pure user-built workspace). */}
      {!builderEnabled && !isSandboxEnv && (isDrawingMode ? (
        <>
          <AprilTagMarker position={[-CANVAS_W/2-0.45, 0, -CANVAS_H/2-0.45]} />
          <AprilTagMarker position={[CANVAS_W/2+0.45, 0, -CANVAS_H/2-0.45]} />
          <AprilTagMarker position={[-CANVAS_W/2-0.45, 0, CANVAS_H/2+0.45]} />
          <AprilTagMarker position={[CANVAS_W/2+0.45, 0, CANVAS_H/2+0.45]} />
          <RobotGantry penPos={penPos} isAnimating={isAnimating} penDown={isAnimating} />
        </>
      ) : (
        <ChallengeSim mode={simMode} sumoRingRadius={env.sumoRingRadius} />
      ))}

      {/* Coord axes + overhead camera frustum hidden in sandbox by default —
          they read as "industrial debug overlay" rather than play space. */}
      {showAxes && !isSandboxEnv && <CoordAxes />}
      {showCamera && isDrawingMode && !isSandboxEnv && <OverheadCamera />}

      <OrbitControls makeDefault enablePan enableZoom enableRotate={!isDragging}
        minDistance={1.5} maxDistance={14} maxPolarAngle={Math.PI * 0.88} target={[0, 0.2, 0]} />

      {/* Tinkercad-style ViewCube — click a face to snap the camera, or drag
          the cube to orbit. Only shown in sandbox sessions. */}
      {isSandboxEnv && (
        <GizmoHelper alignment="top-right" margin={[64, 56]}>
          <GizmoViewcube
            color="rgba(20,28,60,0.9)"
            opacity={0.95}
            strokeColor="rgba(168,85,247,0.6)"
            textColor="white"
            faces={['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back']}
          />
        </GizmoHelper>
      )}
    </>
  );
}

// ─── Exported canvas ──────────────────────────────────────────────────────────

type Scene3DProps = {
  settledLines: SimPoint[][];
  activeLine: SimPoint[];
  penPos: SimPoint | null;
  isAnimating: boolean;
  showGrid?: boolean;
  showAxes?: boolean;
  showCamera?: boolean;
  className?: string;
  conceptId?: string | null;
  /** Course-builder props — when builderEnabled, the env's default cones/walls
   *  are hidden, the user's sceneObjects are rendered, and the floor accepts
   *  pointer-place + cursor preview. */
  builderEnabled?: boolean;
  showPlacementGrid?: boolean;
  sceneObjects?: SceneObject[];
  selectedObjectId?: string | null;
  draggedObjectId?: string | null;
  hoveredObjectId?: string | null;
  activeTool?: ToolDef | null;
  onPlaceAt?: (gx: number, gz: number, rotY?: 0 | 1 | 2 | 3) => void;
  onSelectObject?: (id: string | null) => void;
  onStackOnTop?: (objectId: string) => void;
  onStartDrag?: (objectId: string) => void;
  onDragMove?: (gx: number, gz: number) => void;
  onEndDrag?: () => void;
  onHoverObject?: (id: string | null) => void;
  /** Rotate / delete the currently-selected object — wired into the
   *  in-scene SelectionToolbar so the kid doesn't have to hunt the rail. */
  onRotateSelected?: () => void;
  onDeleteSelected?: () => void;
  /** Toolbar's move button — kicks the selected object into "follow the
   *  cursor until the next floor click" mode (no mouse-button hold needed). */
  onMoveSelected?: () => void;
  /** 'press' = traditional drag (mouse held); 'follow' = click-once / click-once. */
  dragMode?: 'press' | 'follow';
};

export function Scene3D({
  settledLines, activeLine, penPos, isAnimating,
  showGrid = true, showAxes = true, showCamera = true,
  className, conceptId,
  builderEnabled = false,
  showPlacementGrid = false,
  sceneObjects = [],
  selectedObjectId = null,
  draggedObjectId = null,
  hoveredObjectId = null,
  activeTool = null,
  onPlaceAt,
  onSelectObject,
  onStackOnTop,
  onStartDrag,
  onDragMove,
  onEndDrag,
  onHoverObject,
  onRotateSelected,
  onDeleteSelected,
  onMoveSelected,
  dragMode,
}: Scene3DProps) {
  const env = useMemo(() => getEnvironment(conceptId), [conceptId]);
  return (
    <Canvas
      className={className} shadows
      camera={{ position: [5.2, 4.2, 5.2], fov: 42, near: 0.1, far: 60 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.92, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%', background: env.background }}
      // Right-click in builder mode = rotate the ghost cursor; suppress the
      // native browser context menu so it doesn't pop up over the canvas.
      onContextMenu={builderEnabled ? (e) => e.preventDefault() : undefined}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(new THREE.Color(env.background), 1);
        scene.background = new THREE.Color(env.background);
      }}
    >
      <SceneContent settledLines={settledLines} activeLine={activeLine} penPos={penPos} isAnimating={isAnimating}
        showGrid={showGrid} showAxes={showAxes} showCamera={showCamera} env={env} conceptId={conceptId}
        builderEnabled={builderEnabled} showPlacementGrid={showPlacementGrid}
        sceneObjects={sceneObjects} selectedObjectId={selectedObjectId}
        draggedObjectId={draggedObjectId} hoveredObjectId={hoveredObjectId} activeTool={activeTool}
        onPlaceAt={onPlaceAt} onSelectObject={onSelectObject}
        onStackOnTop={onStackOnTop} onStartDrag={onStartDrag}
        onDragMove={onDragMove} onEndDrag={onEndDrag}
        onHoverObject={onHoverObject}
        onRotateSelected={onRotateSelected}
        onDeleteSelected={onDeleteSelected}
        onMoveSelected={onMoveSelected}
        dragMode={dragMode} />
    </Canvas>
  );
}
