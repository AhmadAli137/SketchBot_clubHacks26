'use client';

import { Suspense, useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Grid, Line } from '@react-three/drei';
import * as THREE from 'three';

import { SparkMiniBotMesh, SumoBotMesh } from './bot-meshes';

// ─────────────────────────────────────────────────────────────────────────────
// Scene cycling state
// ─────────────────────────────────────────────────────────────────────────────
const SCENES = ['sandbox', 'maze', 'sumo', 'cones', 'waypoints'] as const;
type SceneType = typeof SCENES[number];

const CAM_POS: Record<SceneType, [number, number, number]> = {
  sandbox:   [ 1.8, 2.6, 4.6],
  maze:      [ 2.2, 2.2, 4.5],
  sumo:      [ 0.0, 2.8, 5.2],
  cones:     [ 1.5, 3.5, 5.0],
  waypoints: [ 0.0, 4.2, 5.8],
};
const CAM_TARGET: Record<SceneType, [number, number, number]> = {
  sandbox:   [0, 0.1, 0],
  maze:      [0, 0,   0],
  sumo:      [0, 0,   0],
  cones:     [0, 0.2, 0],
  waypoints: [0, 0,   0],
};
const BG_COLOR: Record<SceneType, string> = {
  sandbox:   '#060812',
  maze:      '#050a08',
  sumo:      '#060508',
  cones:     '#080605',
  waypoints: '#050810',
};

// ─────────────────────────────────────────────────────────────────────────────
// Camera + background
// ─────────────────────────────────────────────────────────────────────────────
function CinematicCamera({ scene }: { scene: SceneType }) {
  const { camera } = useThree();
  useFrame(() => {
    const targetPos  = new THREE.Vector3(...CAM_POS[scene]);
    const targetLook = new THREE.Vector3(...CAM_TARGET[scene]);
    camera.position.lerp(targetPos, 0.035);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const look = camera.position.clone().add(dir);
    look.lerp(targetLook, 0.035);
    camera.lookAt(look);
  });
  return null;
}

function SceneBg({ scene }: { scene: SceneType }) {
  const { scene: threeScene, gl } = useThree();
  const cur = useRef(new THREE.Color(BG_COLOR[scene]));
  useFrame(() => {
    cur.current.lerp(new THREE.Color(BG_COLOR[scene]), 0.04);
    threeScene.background = cur.current.clone();
    threeScene.fog = new THREE.Fog(cur.current, 10, 28);
    gl.setClearColor(cur.current, 1);
  });
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wheel radii — needed for the rolling-distance math in the moving-bot
// path followers below. The actual mesh lives in `./bot-meshes` (a verbatim
// copy of the desktop sandbox SparkMiniBotMesh / SumoBotMesh) so the
// website hero shows the same robots the kid drives in the app.
// ─────────────────────────────────────────────────────────────────────────────
const WHEEL_R      = 0.052;
const SUMO_WHEEL_R = 0.045;


// ─────────────────────────────────────────────────────────────────────────────
// MovingMiniBot — follows a path, wheels visibly roll based on travel speed.
// ─────────────────────────────────────────────────────────────────────────────
function MovingMiniBot({ path, speed = 0.3 }: { path: [number, number, number][]; speed?: number }) {
  const groupRef     = useRef<THREE.Group>(null);
  const leftWheelRef = useRef<THREE.Group>(null);
  const rightWheelRef = useRef<THREE.Group>(null);
  const t = useRef(0);
  const lastPos = useRef(new THREE.Vector3(...path[0]!));

  useFrame((_, delta) => {
    t.current = (t.current + delta * speed) % 1;
    if (!groupRef.current || path.length < 2) return;
    const total = path.length - 1;
    const seg   = t.current * total;
    const i     = Math.floor(seg);
    const f     = seg - i;
    const a     = path[Math.min(i,   total)]!;
    const b     = path[Math.min(i+1, total)]!;
    const nx = a[0] + (b[0]-a[0]) * f;
    const ny = a[1] + (b[1]-a[1]) * f;
    const nz = a[2] + (b[2]-a[2]) * f;
    groupRef.current.position.set(nx, ny, nz);
    const dx = b[0]-a[0], dz = b[2]-a[2];
    if (Math.abs(dx) + Math.abs(dz) > 0.001)
      groupRef.current.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;

    // Roll the wheels in proportion to actual travel — no rotation when paused
    const travel = Math.hypot(nx - lastPos.current.x, nz - lastPos.current.z);
    const rollDelta = travel / WHEEL_R;
    if (leftWheelRef.current)  leftWheelRef.current.rotation.z  -= rollDelta;
    if (rightWheelRef.current) rightWheelRef.current.rotation.z -= rollDelta;
    lastPos.current.set(nx, ny, nz);
  });

  return (
    <group ref={groupRef}>
      <SparkMiniBotMesh wheelRefs={{ left: leftWheelRef, right: rightWheelRef }} />
      <pointLight color="#5de4ff" intensity={0.9} distance={1.2} />
    </group>
  );
}

function StaticMiniBot({ position, rotation }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation ?? 0, 0]}>
      <SparkMiniBotMesh />
    </group>
  );
}

function MovingSumoBot({ path, speed = 0.22 }: { path: [number, number, number][]; speed?: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const lf = useRef<THREE.Group>(null);
  const lr = useRef<THREE.Group>(null);
  const rf = useRef<THREE.Group>(null);
  const rr = useRef<THREE.Group>(null);
  const t = useRef(0);
  const lastPos = useRef(new THREE.Vector3(...path[0]!));
  useFrame((_, delta) => {
    t.current = (t.current + delta * speed) % 1;
    if (!groupRef.current || path.length < 2) return;
    const total = path.length - 1;
    const seg   = t.current * total;
    const i     = Math.floor(seg);
    const f     = seg - i;
    const a     = path[Math.min(i,   total)]!;
    const b     = path[Math.min(i+1, total)]!;
    const nx = a[0] + (b[0]-a[0]) * f;
    const ny = a[1] + (b[1]-a[1]) * f;
    const nz = a[2] + (b[2]-a[2]) * f;
    groupRef.current.position.set(nx, ny, nz);
    const dx = b[0]-a[0], dz = b[2]-a[2];
    if (Math.abs(dx) + Math.abs(dz) > 0.001)
      groupRef.current.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
    const travel = Math.hypot(nx - lastPos.current.x, nz - lastPos.current.z);
    const rollDelta = travel / SUMO_WHEEL_R;
    [lf, lr, rf, rr].forEach(r => { if (r.current) r.current.rotation.z -= rollDelta; });
    lastPos.current.set(nx, ny, nz);
  });
  return (
    <group ref={groupRef}>
      <SumoBotMesh
        wheelRefs={{ leftFront: lf, leftRear: lr, rightFront: rf, rightRear: rr }}
      />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ground + grid (shared)
// ─────────────────────────────────────────────────────────────────────────────
function SharedGround({ scene }: { scene: SceneType }) {
  const groundColor: Record<SceneType, string> = {
    sandbox: '#0a1024', maze: '#0a1a0a', sumo: '#d8c8c8', cones: '#c8b89a', waypoints: '#0a1020',
  };
  const gridColor: Record<SceneType, string> = {
    sandbox: '#1c2860', maze: '#1a3a1a', sumo: '#c0a0a0', cones: '#c0a080', waypoints: '#203060',
  };
  const sectionColor: Record<SceneType, string> = {
    sandbox: '#3554a0', maze: '#2a5a2a', sumo: '#b08080', cones: '#c09060', waypoints: '#3050a0',
  };
  return (
    <>
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.018, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={groundColor[scene]} roughness={0.92} metalness={0.05} />
      </mesh>
      <ContactShadows position={[0, -0.015, 0]} opacity={0.4} scale={24} blur={2.8} far={5} color="#000000" />
      <Grid
        position={[0, -0.008, 0]} args={[20, 20]}
        cellSize={0.5} cellThickness={0.35}
        cellColor={gridColor[scene]} sectionSize={2} sectionThickness={0.65}
        sectionColor={sectionColor[scene]} fadeDistance={18} fadeStrength={1.5}
        infiniteGrid followCamera={false}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE: Sandbox — free-build playground, the new default. Shows a ramp,
// a few maze walls, a couple of cones, and a waypoint orb sitting on the
// pad together. The mini bot weaves between them.
// ─────────────────────────────────────────────────────────────────────────────
function Ramp({ x, z, length = 0.9, width = 0.36, rise = 0.18, rotY = 0 }: { x: number; z: number; length?: number; width?: number; rise?: number; rotY?: number }) {
  // Build a triangular prism: bottom face flush with floor, top face inclined.
  const tilt = Math.atan2(rise, length);
  const cx = 0;
  const cy = rise / 2;
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      {/* Inclined deck */}
      <mesh position={[cx, cy, 0]} rotation={[0, 0, tilt]} castShadow receiveShadow>
        <boxGeometry args={[Math.hypot(length, rise), 0.012, width]} />
        <meshStandardMaterial color="#3548b0" roughness={0.55} metalness={0.2} />
      </mesh>
      {/* Vertical back wall */}
      <mesh position={[length / 2, rise / 2, 0]} castShadow>
        <boxGeometry args={[0.012, rise, width]} />
        <meshStandardMaterial color="#28368a" roughness={0.6} />
      </mesh>
      {/* Side triangles for solidity */}
      {[width / 2, -width / 2].map((zSide, i) => (
        <mesh key={i} position={[0, rise / 2, zSide]} rotation={[0, 0, tilt]}>
          <boxGeometry args={[length, 0.001, 0.004]} />
          <meshStandardMaterial color="#2a3680" />
        </mesh>
      ))}
      {/* Glow stripe along the leading edge */}
      <mesh position={[-length / 2 + 0.005, 0.006, 0]}>
        <boxGeometry args={[0.004, 0.003, width * 0.92]} />
        <meshStandardMaterial color="#5de4ff" emissive="#5de4ff" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

function MazeWallBlock({ x, z, w, d, color = '#5b6cff' }: { x: number; z: number; w: number; d: number; color?: string }) {
  return (
    <mesh position={[x, 0.12, z]} castShadow receiveShadow>
      <boxGeometry args={[w, 0.24, d]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.6} />
    </mesh>
  );
}

function TrafficCone({ x, z, color = '#ff6520' }: { x: number; z: number; color?: string }) {
  const ref = useRef<THREE.Group>(null);
  const off = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.4 + off.current) * 0.012;
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI/2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.016, 16]} />
        <meshStandardMaterial color="#111" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.14, 0]} castShadow>
        <coneGeometry args={[0.06, 0.26, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.5} />
      </mesh>
      {/* Reflective stripe */}
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.052, 0.046, 0.018, 16]} />
        <meshStandardMaterial color="#fff7e0" emissive="#fff7e0" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function WaypointOrb({ x, z, color }: { x: number; z: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const off = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
      0.5 + Math.sin(clock.elapsedTime * 2 + off.current) * 0.35;
    ref.current.position.y = 0.32 + Math.sin(clock.elapsedTime * 1.8 + off.current) * 0.025;
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.30, 8]} />
        <meshStandardMaterial color="#303040" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh ref={ref} position={[0, 0.32, 0]}>
        <sphereGeometry args={[0.055, 16, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.3} />
      </mesh>
      <pointLight color={color} intensity={0.4} distance={1} />
    </group>
  );
}

function SandboxScene() {
  const path: [number, number, number][] = useMemo(() => [
    [-1.4, 0.026, -0.2], [-0.7, 0.026,  0.6], [ 0.0, 0.026,  0.0],
    [ 0.7, 0.026, -0.6], [ 1.3, 0.026,  0.2], [ 0.6, 0.026,  0.9],
    [-0.5, 0.026,  0.9], [-1.4, 0.026, -0.2],
  ], []);
  return (
    <>
      <ambientLight intensity={0.32} color="#dde6ff" />
      <directionalLight position={[3, 8, 3]} intensity={0.95} color="#e6efff" castShadow />
      <pointLight position={[0, 3, 0]} color="#5de4ff" intensity={0.45} distance={5} />

      {/* A ramp the bot can drive up */}
      <Ramp x={-1.0} z={-1.1} rotY={Math.PI / 2.2} />

      {/* A few maze walls */}
      <MazeWallBlock x={ 0.6} z={-1.1} w={0.18} d={1.0} color="#3654d0" />
      <MazeWallBlock x={ 1.3} z={ 0.9} w={0.9}  d={0.18} color="#3654d0" />
      <MazeWallBlock x={-1.4} z={ 0.8} w={0.18} d={0.7}  color="#3654d0" />

      {/* Pair of cones */}
      <TrafficCone x={-0.2} z={-0.6} />
      <TrafficCone x={ 0.2} z={ 0.5} />

      {/* Waypoints */}
      <WaypointOrb x={ 1.2} z={-0.5} color="#5de4ff" />
      <WaypointOrb x={-0.6} z={ 1.1} color="#a855f7" />

      <MovingMiniBot path={path} speed={0.25} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE: Maze marathon
// ─────────────────────────────────────────────────────────────────────────────
const MAZE_PATH: [number, number, number][] = [
  [-1.2, 0.026, -1.2], [-1.2, 0.026, 0], [0, 0.026, 0],
  [0, 0.026, 1.2], [1.2, 0.026, 1.2], [1.2, 0.026, 0],
  [0.4, 0.026, 0], [0.4, 0.026, -1.2], [-1.2, 0.026, -1.2],
];

function MazeScene() {
  const walls: { x: number; z: number; w: number; d: number }[] = [
    { x: 0,    z: -1.8, w: 3.6, d: 0.18 },
    { x: 0,    z:  1.8, w: 3.6, d: 0.18 },
    { x: -1.8, z:  0,   w: 0.18, d: 3.6 },
    { x:  1.8, z:  0,   w: 0.18, d: 3.6 },
    { x: -0.6, z: -0.9, w: 0.18, d: 1.8 },
    { x:  0.4, z:  0.6, w: 2.0,  d: 0.18 },
    { x:  0.8, z: -0.6, w: 0.18, d: 1.2 },
    { x: -0.3, z:  0,   w: 1.2,  d: 0.18 },
  ];
  return (
    <>
      <ambientLight intensity={0.18} color="#102018" />
      <directionalLight position={[2, 6, 2]} intensity={0.6} color="#20ff80" castShadow />
      <pointLight position={[0, 3, 0]} intensity={0.5} color="#00ff60" distance={8} />
      {walls.map((w, i) => (
        <mesh key={i} position={[w.x, 0.12, w.z]} castShadow receiveShadow>
          <boxGeometry args={[w.w, 0.24, w.d]} />
          <meshStandardMaterial color="#0a2a10" emissive="#002200" emissiveIntensity={0.4} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[-1.2, 0.1, 1.2]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color="#00ff60" emissive="#00ff60" emissiveIntensity={1.2} />
      </mesh>
      <pointLight position={[-1.2, 0.1, 1.2]} color="#00ff60" intensity={0.8} distance={1.5} />
      <mesh position={[1.2, 0.1, -1.2]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color="#ff3366" emissive="#ff3366" emissiveIntensity={1.2} />
      </mesh>
      <pointLight position={[1.2, 0.1, -1.2]} color="#ff3366" intensity={0.8} distance={1.5} />
      <MovingMiniBot path={MAZE_PATH} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE: Sumo arena — wedge-plow SumoBot circles a static MiniBot defender
// ─────────────────────────────────────────────────────────────────────────────
function SumoScene() {
  const borderRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (borderRef.current)
      (borderRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.3 + Math.sin(clock.elapsedTime * 1.5) * 0.2;
  });
  return (
    <>
      <ambientLight intensity={0.3} color="#fff4f4" />
      <directionalLight position={[4, 8, 2]} intensity={1.2} color="#ffe8e8" castShadow />
      <pointLight position={[0, 2, 0]} color="#ff2000" intensity={0.8} distance={4} />
      <mesh position={[0, -0.008, 0]} rotation={[-Math.PI/2, 0, 0]}>
        <circleGeometry args={[1.8, 64]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.7} />
      </mesh>
      <mesh ref={borderRef} position={[0, -0.004, 0]} rotation={[-Math.PI/2, 0, 0]}>
        <ringGeometry args={[1.65, 1.8, 64]} />
        <meshStandardMaterial color="#cc0000" emissive="#cc0000" emissiveIntensity={0.3} roughness={0.5} />
      </mesh>
      <MovingSumoBot path={[
        [0.95, 0.026, 0], [0, 0.026, 0.95], [-0.95, 0.026, 0], [0, 0.026, -0.95], [0.95, 0.026, 0],
      ]} />
      <StaticMiniBot position={[-0.2, 0.026, 0.15]} rotation={2.4} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE: Cones gauntlet
// ─────────────────────────────────────────────────────────────────────────────
function ConesScene() {
  const cones = [[-1,0],[1,0],[0,-1],[0,1],[-0.7,0.7],[0.7,-0.7]];
  return (
    <>
      <ambientLight intensity={0.5} color="#fff8f0" />
      <directionalLight position={[3, 8, 3]} intensity={1.1} color="#fff0e0" castShadow />
      {cones.map(([x, z], i) => <TrafficCone key={i} x={x!} z={z!} />)}
      <MovingMiniBot path={[
        [-1.2, 0.026, -1.2], [-1, 0.026, 0], [0, 0.026, -1], [1, 0.026, 0],
        [0, 0.026, 1], [-1.2, 0.026, 1.2], [-1.2, 0.026, -1.2],
      ]} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE: Waypoints — colorful orbs the bot visits in order
// ─────────────────────────────────────────────────────────────────────────────
function WaypointsScene() {
  return (
    <>
      <ambientLight intensity={0.25} color="#eef8ff" />
      <directionalLight position={[4, 9, 4]} intensity={1.0} color="#e0f4ff" castShadow />
      {[
        { x: -1.2, z: -1.0, color: '#5de4ff' },
        { x:  0.2, z: -1.5, color: '#6b7cff' },
        { x:  1.4, z: -0.2, color: '#a855f7' },
        { x:  0.8, z:  1.2, color: '#5de4ff' },
        { x: -0.6, z:  1.0, color: '#4dffb8' },
      ].map((w, i) => <WaypointOrb key={i} {...w} />)}
      {/* Path preview line — shows the planned trajectory */}
      <Line points={[
        [-1.2, 0.005, -1.0], [0.2, 0.005, -1.5], [1.4, 0.005, -0.2],
        [0.8, 0.005, 1.2], [-0.6, 0.005, 1.0], [-1.2, 0.005, -1.0],
      ]} color="#5de4ff" lineWidth={2} dashed dashSize={0.06} gapSize={0.04} />
      <MovingMiniBot path={[
        [-1.2, 0.026, -1.0], [0.2, 0.026, -1.5], [1.4, 0.026, -0.2],
        [0.8, 0.026, 1.2], [-0.6, 0.026, 1.0], [-1.2, 0.026, -1.0],
      ]} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene switcher + metadata
// ─────────────────────────────────────────────────────────────────────────────
function SceneContent({ scene }: { scene: SceneType }) {
  return (
    <>
      <SceneBg scene={scene} />
      <CinematicCamera scene={scene} />
      <SharedGround scene={scene} />
      {scene === 'sandbox'   && <SandboxScene />}
      {scene === 'maze'      && <MazeScene />}
      {scene === 'sumo'      && <SumoScene />}
      {scene === 'cones'     && <ConesScene />}
      {scene === 'waypoints' && <WaypointsScene />}
    </>
  );
}

const SCENE_META: Record<SceneType, { title: string; sub: string; concept: string; color: string; tags: string[] }> = {
  sandbox:   { title: 'Free-Build Sandbox', sub: 'Drop ramps, walls, cones, and waypoints onto the floor — drive the bot through whatever you build', concept: 'Free Play',          color: '#5de4ff', tags: ['Explorer', 'Builder', 'Engineer'] },
  maze:      { title: 'Maze Marathon',      sub: 'The robot navigates a generated maze using coordinate transforms and dead-reckoning odometry',     concept: 'Coordinate Systems', color: '#4dffb8', tags: ['Explorer', 'Builder', 'Engineer'] },
  sumo:      { title: 'Sumo Arena',         sub: 'A wedge-plow SumoBot squares off against the Spark Mini — sensor fusion meets reactive control',   concept: 'Control Theory',     color: '#ff4fd8', tags: ['Builder', 'Engineer'] },
  cones:     { title: 'Cone Gauntlet',      sub: 'Slalom through obstacles using path planning and real-time avoidance',                              concept: 'Path Planning',      color: '#ffc96b', tags: ['Builder', 'Engineer'] },
  waypoints: { title: 'Waypoint Path',      sub: 'Place glowing waypoints — the robot interpolates and follows the path you designed',                concept: 'Kinematics',         color: '#5de4ff', tags: ['Explorer', 'Builder', 'Engineer'] },
};

const TAB_LABELS: Record<SceneType, string> = {
  sandbox:   'Sandbox',
  maze:      'Maze',
  sumo:      'Sumo',
  cones:     'Cones',
  waypoints: 'Waypoints',
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported component
// ─────────────────────────────────────────────────────────────────────────────
export function HeroScene3D() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const scene = SCENES[sceneIdx % SCENES.length]!;
  const meta  = SCENE_META[scene];

  useEffect(() => {
    if (!autoPlay) return;
    const id = setInterval(() => setSceneIdx(i => i + 1), 6000);
    return () => clearInterval(id);
  }, [autoPlay]);

  function select(i: number) { setSceneIdx(i); setAutoPlay(false); }

  return (
    <div className="demo-scene-root">
      <div className="demo-tabs">
        {SCENES.map((s, i) => (
          <button
            key={s}
            className={`demo-tab${i === sceneIdx % SCENES.length ? ' active' : ''}`}
            onClick={() => select(i)}
          >
            {TAB_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="demo-canvas-wrap">
        <Canvas
          gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
          shadows={{ type: THREE.PCFShadowMap as unknown as THREE.ShadowMapType }}
          dpr={[1, 1.5]}
          camera={{ position: CAM_POS[scene], fov: 46 }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <Suspense fallback={null}>
            <SceneContent scene={scene} />
          </Suspense>
        </Canvas>

        <div className="demo-overlay-info">
          <div className="demo-overlay-chip" style={{ background: `${meta.color}22`, borderColor: `${meta.color}44`, color: meta.color }}>
            {meta.concept}
          </div>
          <div className="demo-overlay-title">{meta.title}</div>
          <div className="demo-overlay-sub">{meta.sub}</div>
          <div className="demo-overlay-tags">
            {meta.tags.map(t => <span key={t} className="demo-overlay-tag">{t}</span>)}
          </div>
        </div>

        <div className="demo-live-badge">
          <span className="demo-live-dot" />
          Live sim
        </div>
      </div>
    </div>
  );
}
