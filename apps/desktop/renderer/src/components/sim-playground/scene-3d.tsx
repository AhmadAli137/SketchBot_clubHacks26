'use client';

/**
 * Scene3D — concept-aware 3D scene.
 * Drawing concepts → RobotGantry follows SVG path on paper canvas.
 * Competition/nav concepts → ChallengeSim runs autonomous robot behaviour.
 */

import { useMemo, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import { RobotGantry } from './robot-gantry';
import { CanvasSurface } from './canvas-surface';
import { ChallengeSim, getSimMode } from './challenge-sim';
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
      {arenaType === 'circuit' && <CircuitFloor />}
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
};

function SceneContent({ settledLines, activeLine, penPos, isAnimating, showGrid, showAxes, showCamera, env, conceptId }: SceneContentProps) {
  const simMode = getSimMode(conceptId);
  const isDrawingMode = simMode === 'drawing';

  return (
    <>
      <BackgroundLerper targetColor={env.background} />

      {/* Lighting */}
      <hemisphereLight args={[env.ambientColor as unknown as THREE.ColorRepresentation, '#121520', 0.42]} />
      <ambientLight intensity={0.38} color={env.ambientColor} />
      <directionalLight position={[4.5, 9, 4]} intensity={1.55} color={env.keyLightColor} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.00025} shadow-normalBias={0.02}
        shadow-camera-far={22} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} />
      <directionalLight position={[-5, 5, -4]} intensity={0.35} color={env.fillLightColor} />
      <pointLight position={[-3, 4, -2]} intensity={0.55} color={env.accentColor} />
      <pointLight position={[3.5, 2.2, 3]} intensity={0.28} color={env.accentColor} />

      {/* Ground */}
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.018, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={env.groundColor} roughness={0.92} metalness={0.05} />
      </mesh>
      <ContactShadows position={[0, -0.015, 0]} opacity={0.45} scale={24} blur={2.8} far={5} color="#000000" />

      {/* Grid */}
      {showGrid && (
        <Grid position={[0, -0.008, 0]} args={[20, 20]} cellSize={0.5} cellThickness={0.35}
          cellColor={env.gridColor} sectionSize={2} sectionThickness={0.65} sectionColor={env.sectionColor}
          fadeDistance={20} fadeStrength={1.65} infiniteGrid followCamera={false} />
      )}

      {/* Paper canvas only for drawing mode */}
      {isDrawingMode && (
        <CanvasSurface settledLines={settledLines} activeLine={activeLine} showGrid={showGrid} />
      )}

      {/* Concept-specific arena props */}
      <ConceptArenaProps env={env} skipCones={simMode === 'cone-ring'} />

      {/* Robot/simulation — drawing or autonomous */}
      {isDrawingMode ? (
        <>
          <AprilTagMarker position={[-CANVAS_W/2-0.45, 0, -CANVAS_H/2-0.45]} />
          <AprilTagMarker position={[CANVAS_W/2+0.45, 0, -CANVAS_H/2-0.45]} />
          <AprilTagMarker position={[-CANVAS_W/2-0.45, 0, CANVAS_H/2+0.45]} />
          <AprilTagMarker position={[CANVAS_W/2+0.45, 0, CANVAS_H/2+0.45]} />
          <RobotGantry penPos={penPos} isAnimating={isAnimating} penDown={isAnimating} />
        </>
      ) : (
        <ChallengeSim mode={simMode} sumoRingRadius={env.sumoRingRadius} />
      )}

      {showAxes && <CoordAxes />}
      {showCamera && isDrawingMode && <OverheadCamera />}

      <OrbitControls makeDefault enablePan enableZoom enableRotate
        minDistance={1.5} maxDistance={14} maxPolarAngle={Math.PI * 0.88} target={[0, 0.2, 0]} />
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
};

export function Scene3D({ settledLines, activeLine, penPos, isAnimating, showGrid = true, showAxes = true, showCamera = true, className, conceptId }: Scene3DProps) {
  const env = useMemo(() => getEnvironment(conceptId), [conceptId]);
  return (
    <Canvas
      className={className} shadows
      camera={{ position: [5.2, 4.2, 5.2], fov: 42, near: 0.1, far: 60 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.92, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%', background: env.background }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(new THREE.Color(env.background), 1);
        scene.background = new THREE.Color(env.background);
      }}
    >
      <SceneContent settledLines={settledLines} activeLine={activeLine} penPos={penPos} isAnimating={isAnimating}
        showGrid={showGrid} showAxes={showAxes} showCamera={showCamera} env={env} conceptId={conceptId} />
    </Canvas>
  );
}
