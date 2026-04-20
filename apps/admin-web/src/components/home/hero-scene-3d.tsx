'use client';

import { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Grid, Line } from '@react-three/drei';
import * as THREE from 'three';

// ─── Scene index cycling ──────────────────────────────────────────────────────
const SCENES = ['maze', 'sumo', 'cones', 'waypoints', 'drawing'] as const;
type SceneType = typeof SCENES[number];

const CAM_POS: Record<SceneType, [number, number, number]> = {
  maze:      [ 2.2, 2.2, 4.5],
  sumo:      [ 0.0, 2.8, 5.2],
  cones:     [ 1.5, 3.5, 5.0],
  waypoints: [ 0.0, 4.2, 5.8],
  drawing:   [ 1.2, 3.0, 4.8],
};
const CAM_TARGET: Record<SceneType, [number, number, number]> = {
  maze:      [0, 0, 0],
  sumo:      [0, 0, 0],
  cones:     [0, 0.2, 0],
  waypoints: [0, 0, 0],
  drawing:   [0, -0.1, 0],
};
const BG_COLOR: Record<SceneType, string> = {
  maze:      '#050a08',
  sumo:      '#060508',
  cones:     '#080605',
  waypoints: '#050810',
  drawing:   '#070508',
};

// ─── Camera lerp ─────────────────────────────────────────────────────────────
function CinematicCamera({ scene }: { scene: SceneType }) {
  const { camera } = useThree();
  const targetPos  = new THREE.Vector3(...CAM_POS[scene]);
  const targetLook = new THREE.Vector3(...CAM_TARGET[scene]);
  useFrame(() => {
    camera.position.lerp(targetPos, 0.035);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const look = camera.position.clone().add(dir);
    look.lerp(targetLook, 0.035);
    camera.lookAt(look);
  });
  return null;
}

// ─── Background + fog ────────────────────────────────────────────────────────
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

// ─── SketchBot differential-drive robot ──────────────────────────────────────
function SketchBot({ position, rotation }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation ?? 0, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.11, 0.052, 0.14]} />
        <meshStandardMaterial color="#1a2540" roughness={0.35} metalness={0.45} />
      </mesh>
      <mesh position={[-0.062, -0.016, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.024, 0.024, 0.018, 12]} />
        <meshStandardMaterial color="#222" roughness={0.7} />
      </mesh>
      <mesh position={[0.062, -0.016, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.024, 0.024, 0.018, 12]} />
        <meshStandardMaterial color="#222" roughness={0.7} />
      </mesh>
      <pointLight color="#5de4ff" intensity={1.2} distance={1.5} />
    </group>
  );
}

// ─── Moving robot (maze / waypoints) ─────────────────────────────────────────
function MovingRobot({ path }: { path: [number, number, number][] }) {
  const groupRef = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, delta) => {
    t.current = (t.current + delta * 0.3) % 1;
    if (!groupRef.current || path.length < 2) return;
    const total = path.length - 1;
    const seg   = t.current * total;
    const i     = Math.floor(seg);
    const f     = seg - i;
    const a     = path[Math.min(i,   total)]!;
    const b     = path[Math.min(i+1, total)]!;
    groupRef.current.position.set(
      a[0] + (b[0]-a[0]) * f,
      a[1] + (b[1]-a[1]) * f,
      a[2] + (b[2]-a[2]) * f,
    );
    const dx = b[0]-a[0], dz = b[2]-a[2];
    if (Math.abs(dx) + Math.abs(dz) > 0.001)
      groupRef.current.rotation.y = Math.atan2(dx, dz);
  });
  return (
    <group ref={groupRef}>
      <mesh castShadow>
        <boxGeometry args={[0.11, 0.052, 0.14]} />
        <meshStandardMaterial color="#1a2540" roughness={0.35} metalness={0.45} />
      </mesh>
      <mesh position={[-0.062, -0.016, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.024, 0.024, 0.018, 12]} />
        <meshStandardMaterial color="#222" roughness={0.7} />
      </mesh>
      <mesh position={[0.062, -0.016, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.024, 0.024, 0.018, 12]} />
        <meshStandardMaterial color="#222" roughness={0.7} />
      </mesh>
      <pointLight color="#5de4ff" intensity={1.4} distance={1.8} />
    </group>
  );
}

// ─── Maze scene ───────────────────────────────────────────────────────────────
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
      {/* Goal balls */}
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
      <MovingRobot path={MAZE_PATH} />
    </>
  );
}

// ─── Sumo scene ───────────────────────────────────────────────────────────────
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
      <MovingRobot path={[
        [0.8, 0.026, 0], [0, 0.026, 0.8], [-0.8, 0.026, 0], [0, 0.026, -0.8], [0.8, 0.026, 0],
      ]} />
      <SketchBot position={[-0.5, 0.026, 0.4]} rotation={2.4} />
    </>
  );
}

// ─── Cones scene ─────────────────────────────────────────────────────────────
function ConeItem({ x, z }: { x: number; z: number }) {
  const ref = useRef<THREE.Group>(null);
  const off = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.4 + off.current) * 0.015;
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI/2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.016, 16]} />
        <meshStandardMaterial color="#111" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <coneGeometry args={[0.06, 0.26, 16]} />
        <meshStandardMaterial color="#ff5500" emissive="#ff3300" emissiveIntensity={0.25} roughness={0.5} />
      </mesh>
    </group>
  );
}

function ConesScene() {
  const cones = [[-1,0],[1,0],[0,-1],[0,1],[-0.7,0.7],[0.7,-0.7]];
  return (
    <>
      <ambientLight intensity={0.5} color="#fff8f0" />
      <directionalLight position={[3, 8, 3]} intensity={1.1} color="#fff0e0" castShadow />
      {cones.map(([x, z], i) => <ConeItem key={i} x={x!} z={z!} />)}
      <MovingRobot path={[
        [-1.2, 0.026, -1.2], [-1, 0.026, 0], [0, 0.026, -1], [1, 0.026, 0],
        [0, 0.026, 1], [-1.2, 0.026, 1.2], [-1.2, 0.026, -1.2],
      ]} />
    </>
  );
}

// ─── Waypoints scene ──────────────────────────────────────────────────────────
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
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.3} />
      </mesh>
      <pointLight position={[x, 0.32, z]} color={color} intensity={0.4} distance={1} />
    </group>
  );
}

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
      <MovingRobot path={[
        [-1.2, 0.026, -1.0], [0.2, 0.026, -1.5], [1.4, 0.026, -0.2],
        [0.8, 0.026, 1.2], [-0.6, 0.026, 1.0], [-1.2, 0.026, -1.0],
      ]} />
    </>
  );
}

// ─── Drawing scene ────────────────────────────────────────────────────────────
const STEPS = 80;
const FIGURE8: [number, number, number][] = Array.from({ length: STEPS + 1 }, (_, i) => {
  const t = (i / STEPS) * Math.PI * 4;
  return [Math.sin(t) * 0.72, 0.001, Math.sin(t / 2) * 0.38];
});

function DrawingScene() {
  const robotRef = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, delta) => {
    t.current = (t.current + delta * 0.38) % (Math.PI * 4);
    if (!robotRef.current) return;
    const idx  = Math.floor((t.current / (Math.PI * 4)) * STEPS);
    const [x,, z]  = FIGURE8[idx]!;
    const [nx,,nz] = FIGURE8[(idx + 1) % STEPS]!;
    robotRef.current.position.set(x, 0.046, z);
    robotRef.current.rotation.y = Math.atan2(nx - x, nz - z);
  });
  return (
    <>
      <ambientLight intensity={0.45} color="#f6f0ff" />
      <directionalLight position={[3, 8, 3]} intensity={1.0} color="#ede8ff" castShadow />
      <pointLight position={[0, 2, 0]} color="#9060ff" intensity={0.5} distance={4} />
      <mesh position={[0, -0.012, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.1, 1.55]} />
        <meshStandardMaterial color="#f0efe8" roughness={0.88} />
      </mesh>
      <Line points={FIGURE8} color="#9060ff" lineWidth={2} />
      <group ref={robotRef}>
        <mesh castShadow>
          <boxGeometry args={[0.11, 0.052, 0.14]} />
          <meshStandardMaterial color="#1a2540" roughness={0.35} metalness={0.45} />
        </mesh>
        <mesh position={[-0.062, -0.016, 0]} rotation={[0, 0, Math.PI/2]}>
          <cylinderGeometry args={[0.024, 0.024, 0.018, 12]} />
          <meshStandardMaterial color="#222" roughness={0.7} />
        </mesh>
        <mesh position={[0.062, -0.016, 0]} rotation={[0, 0, Math.PI/2]}>
          <cylinderGeometry args={[0.024, 0.024, 0.018, 12]} />
          <meshStandardMaterial color="#222" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.036, 0.052]} rotation={[0.35, 0, 0]}>
          <cylinderGeometry args={[0.005, 0.003, 0.088, 8]} />
          <meshStandardMaterial color="#9060ff" emissive="#9060ff" emissiveIntensity={0.7} />
        </mesh>
        <pointLight color="#9060ff" intensity={0.9} distance={0.9} />
      </group>
    </>
  );
}

// ─── Ground + grid (shared) ───────────────────────────────────────────────────
function SharedGround({ scene }: { scene: SceneType }) {
  const groundColor: Record<SceneType, string> = {
    maze: '#0a1a0a', sumo: '#d8c8c8', cones: '#c8b89a', waypoints: '#0a1020', drawing: '#1a1428',
  };
  const gridColor: Record<SceneType, string> = {
    maze: '#1a3a1a', sumo: '#c0a0a0', cones: '#c0a080', waypoints: '#203060', drawing: '#2a1a40',
  };
  const sectionColor: Record<SceneType, string> = {
    maze: '#2a5a2a', sumo: '#b08080', cones: '#c09060', waypoints: '#3050a0', drawing: '#4020a0',
  };
  if (scene === 'drawing') return null;
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

// ─── Full scene switcher ──────────────────────────────────────────────────────
function SceneContent({ scene }: { scene: SceneType }) {
  return (
    <>
      <SceneBg scene={scene} />
      <CinematicCamera scene={scene} />
      <SharedGround scene={scene} />
      {scene === 'maze'      && <MazeScene />}
      {scene === 'sumo'      && <SumoScene />}
      {scene === 'cones'     && <ConesScene />}
      {scene === 'waypoints' && <WaypointsScene />}
      {scene === 'drawing'   && <DrawingScene />}
    </>
  );
}

// ─── Label for current scene ──────────────────────────────────────────────────
const SCENE_LABELS: Record<SceneType, { title: string; sub: string }> = {
  maze:      { title: 'Maze Marathon',       sub: 'Navigate to the goal' },
  sumo:      { title: 'Sumo Arena',          sub: 'Push the opponent out' },
  cones:     { title: 'Cone Gauntlet',       sub: 'Slalom through obstacles' },
  waypoints: { title: 'Path Planning',       sub: 'Follow the waypoints' },
  drawing:   { title: 'Geometry Drawing',    sub: 'Trace with real math' },
};

// ─── Exported component ───────────────────────────────────────────────────────
export function HeroScene3D() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const scene = SCENES[sceneIdx % SCENES.length]!;
  const label = SCENE_LABELS[scene];

  useEffect(() => {
    const id = setInterval(() => setSceneIdx(i => i + 1), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hero-scene-wrap">
      {/* Three.js canvas */}
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

      {/* Overlay: bottom-left label */}
      <div className="hero-scene-label">
        <div className="hero-scene-label-title">{label.title}</div>
        <div className="hero-scene-label-sub">{label.sub}</div>
      </div>

      {/* Scene dots */}
      <div className="hero-scene-dots">
        {SCENES.map((s, i) => (
          <button
            key={s}
            className={`hero-scene-dot${i === sceneIdx % SCENES.length ? ' active' : ''}`}
            onClick={() => setSceneIdx(i)}
            aria-label={SCENE_LABELS[s].title}
          />
        ))}
      </div>
    </div>
  );
}
