'use client';

/**
 * SparkStage3D — Plan-picker hero showing actual challenge simulations.
 * Uses the same ChallengeSim, ConceptEnvironment, ContactShadows, and Grid
 * as the real sim playground, so users see exactly what they'll experience.
 */

import { useRef, Suspense, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Grid, Line } from '@react-three/drei';
import * as THREE from 'three';

import { ChallengeSim, getSimMode } from '@/components/sim-playground/challenge-sim';
import { SparkMiniBotMesh } from '@/components/sim-playground/bot-meshes';
import { getEnvironment, type ConceptEnvironment } from '@/lib/concept-environments';

// ─── Scene index → real challenge concept ─────────────────────────────────────

const SCENE_CONCEPTS = [
  'sumo-arena',
  'maze-marathon',
  'cone-ring-gauntlet',
  'path-planning',
  'geometry-drawing',
] as const;

// Cinematic camera positions per challenge
const CAM_POSITIONS: [number, number, number][] = [
  [ 0.0, 2.8, 5.2],  // sumo    — face-on, slightly elevated
  [ 2.2, 2.2, 4.5],  // maze    — side angle shows corridor depth
  [ 1.5, 3.5, 5.0],  // cones   — elevated, shows gauntlet spread
  [ 0.0, 4.2, 5.8],  // waypoint— overhead-ish, shows full arena
  [ 1.2, 3.0, 4.8],  // drawing — angled down, shows robot inking on paper
];
const CAM_TARGETS: [number, number, number][] = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0.2, 0],
  [0, 0, 0],
  [0, -0.1, 0],
];

// ─── Arena geometry (mirrors scene-3d.tsx components inline) ─────────────────

function SumoRingProp({ radius }: { radius: number }) {
  const borderRef = useRef<THREE.Mesh>(null);
  const glowRef   = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (borderRef.current)
      (borderRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.3 + Math.sin(clock.elapsedTime * 1.5) * 0.2;
    if (glowRef.current)
      glowRef.current.intensity = 0.6 + Math.sin(clock.elapsedTime * 1.5) * 0.3;
  });
  return (
    <group>
      <mesh position={[0, -0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 64]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.7} />
      </mesh>
      <mesh ref={borderRef} position={[0, -0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.06, radius, 64]} />
        <meshStandardMaterial color="#cc0000" emissive="#cc0000" emissiveIntensity={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.06, 32]} />
        <meshStandardMaterial color="#cc0000" roughness={0.5} />
      </mesh>
      <pointLight ref={glowRef} position={[0, 0.5, 0]} color="#ff2000" intensity={0.6} distance={3} />
    </group>
  );
}

function MazeWallProp({ x, z, width, depth, rotation = 0 }: {
  x: number; z: number; width: number; depth: number; rotation?: number;
}) {
  return (
    <mesh position={[x, 0.08, z]} rotation={[0, rotation, 0]} castShadow receiveShadow>
      <boxGeometry args={[width, 0.16, depth]} />
      <meshStandardMaterial color="#0a2a10" emissive="#002200" emissiveIntensity={0.3} roughness={0.8} />
    </mesh>
  );
}

function TrafficConeProp({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  const ref = useRef<THREE.Group>(null);
  const off = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.4 + off.current) * 0.015;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.6 + off.current) * 0.04;
  });
  return (
    <group ref={ref} position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.016, 16]} />
        <meshStandardMaterial color="#111" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
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

function WaypointPropMini({ x, z, color }: { x: number; z: number; color: string }) {
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
      <pointLight position={[x, 0.32, z]} color={color} intensity={0.35} distance={0.8} />
    </group>
  );
}

// ─── Light-mode environment overrides ────────────────────────────────────────

type LightColors = {
  background: string; groundColor: string;
  gridColor: string; sectionColor: string;
  ambientColor: string; keyLightColor: string; fillLightColor: string;
  fogNear: number; fogFar: number;
};

const LIGHT_ENV: Record<string, LightColors> = {
  'sumo-arena': {
    background: '#f5eded', groundColor: '#e8d0d0',
    gridColor: '#d4b0b0', sectionColor: '#c89090',
    ambientColor: '#fff4f4', keyLightColor: '#ffe8e8', fillLightColor: '#ffcccc',
    fogNear: 16, fogFar: 44,
  },
  'maze-marathon': {
    background: '#e8f5ec', groundColor: '#cce8d4',
    gridColor: '#a8d8b8', sectionColor: '#80c498',
    ambientColor: '#f0fff4', keyLightColor: '#e8fff0', fillLightColor: '#b8f0cc',
    fogNear: 14, fogFar: 40,
  },
  'cone-ring-gauntlet': {
    background: '#f6ede4', groundColor: '#eed8c4',
    gridColor: '#e0c0a0', sectionColor: '#d0a880',
    ambientColor: '#fff8f0', keyLightColor: '#fff0e0', fillLightColor: '#ffd8b0',
    fogNear: 14, fogFar: 40,
  },
  'path-planning': {
    background: '#e6eef8', groundColor: '#c8daf0',
    gridColor: '#a0c0e8', sectionColor: '#78a8d8',
    ambientColor: '#eef8ff', keyLightColor: '#e0f4ff', fillLightColor: '#b8e4ff',
    fogNear: 16, fogFar: 44,
  },
  'geometry-drawing': {
    background: '#ede8f8', groundColor: '#d8ccf0',
    gridColor: '#c0ace8', sectionColor: '#a888d8',
    ambientColor: '#f6f0ff', keyLightColor: '#ede8ff', fillLightColor: '#d4c0ff',
    fogNear: 18, fogFar: 48,
  },
};

// ─── Background colour + fog ──────────────────────────────────────────────────

function SceneBg({ bg, fogNear, fogFar }: { bg: string; fogNear: number; fogFar: number }) {
  const { scene, gl } = useThree();
  const target = new THREE.Color(bg);
  const cur    = useRef(new THREE.Color(bg));
  useFrame(() => {
    cur.current.lerp(target, 0.05);
    scene.background = cur.current.clone();
    scene.fog = new THREE.Fog(cur.current, fogNear, fogFar);
    gl.setClearColor(cur.current, 1);
  });
  return null;
}

// ─── Camera animator (smooth lerp to position) ───────────────────────────────

function CinematicCamera({ pos, target }: {
  pos: [number, number, number];
  target: [number, number, number];
}) {
  const { camera } = useThree();
  const targetPos = new THREE.Vector3(...pos);
  const targetLook = new THREE.Vector3(...target);

  useFrame(() => {
    camera.position.lerp(targetPos, 0.04);
    const look = new THREE.Vector3();
    look.lerpVectors(
      camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3())),
      targetLook,
      0.04,
    );
    camera.lookAt(look);
  });
  return null;
}

// ─── Drawing scene — SketchBot traces a figure-8 on paper ────────────────────

const DRAW_STEPS = 80;
const FIGURE8: [number, number, number][] = Array.from({ length: DRAW_STEPS + 1 }, (_, i) => {
  const t = (i / DRAW_STEPS) * Math.PI * 4;
  return [Math.sin(t) * 0.72, 0.001, Math.sin(t / 2) * 0.38];
});

// Wheel rolling radius — matches the SparkMiniBotMesh tire (0.052m).
const DRAWING_WHEEL_R = 0.052;

function DrawingRobotProp() {
  const robotRef    = useRef<THREE.Group>(null);
  const leftWheel   = useRef<THREE.Group>(null);
  const rightWheel  = useRef<THREE.Group>(null);
  const lastPos     = useRef<[number, number]>([FIGURE8[0]![0], FIGURE8[0]![2]]);

  useFrame(({ clock }) => {
    if (!robotRef.current) return;
    // Faster cycle (0.85 phase rate vs 0.38 → ~14s per loop instead of 33s).
    // Real SketchBot draws at ~0.5 m/s; this matches that pace.
    const t = (clock.elapsedTime * 0.85) % (Math.PI * 4);
    const idx = Math.floor((t / (Math.PI * 4)) * DRAW_STEPS);
    const [x, , z]   = FIGURE8[idx]!;
    const [nx, , nz] = FIGURE8[(idx + 1) % DRAW_STEPS]!;
    robotRef.current.position.set(x, 0.046, z);
    robotRef.current.rotation.y = Math.atan2(nx - x, nz - z);

    // Spin the wheels in proportion to actual travel distance — without
    // this the bot glided silently around the figure-8 with the wheels
    // looking like static discs.
    const travel = Math.hypot(x - lastPos.current[0], z - lastPos.current[1]);
    const rollDelta = travel / DRAWING_WHEEL_R;
    if (leftWheel.current)  leftWheel.current.rotation.z  -= rollDelta;
    if (rightWheel.current) rightWheel.current.rotation.z -= rollDelta;
    lastPos.current = [x, z];
  });

  return (
    <group>
      <mesh position={[0, -0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.1, 1.55]} />
        <meshStandardMaterial color="#f0efe8" roughness={0.88} />
      </mesh>
      <Line points={FIGURE8} color="#9060ff" lineWidth={2} />
      <group ref={robotRef}>
        <group rotation={[0, -Math.PI / 2, 0]}>
          <SparkMiniBotMesh wheelRefs={{ left: leftWheel, right: rightWheel }} />
          <mesh position={[0.060, -0.010, 0]}>
            <cylinderGeometry args={[0.0035, 0.0022, 0.040, 8]} />
            <meshStandardMaterial color="#9060ff" emissive="#9060ff" emissiveIntensity={0.7} />
          </mesh>
        </group>
        <pointLight color="#9060ff" intensity={0.7} distance={0.9} />
      </group>
    </group>
  );
}

// ─── Arena props (mirrors ConceptArenaProps from scene-3d) ───────────────────

function ArenaProps({ env, simMode }: { env: ConceptEnvironment; simMode: ReturnType<typeof getSimMode> }) {
  // The cone-ring sim spawns its own physics-driven cones. Skip the
  // env.cones renders here so we don't get a duplicate (static) cone
  // sitting on top of every dynamic one — that's why the gauntlet
  // looked like floating orbs after the bot pushed the physics cones.
  const showCones = simMode !== 'cone-ring';
  return (
    <group>
      {showCones && env.cones?.map((c, i) => <TrafficConeProp key={i} {...c} />)}
      {env.walls?.map((w, i)     => <MazeWallProp     key={i} {...w} />)}
      {env.waypoints?.map((wp, i) => <WaypointPropMini key={i} x={wp.x} z={wp.z} color={wp.color} />)}
      {env.arenaType === 'sumo' && env.sumoRingRadius && (
        <SumoRingProp radius={env.sumoRingRadius} />
      )}
      {env.arenaType === 'studio' && <DrawingRobotProp />}
    </group>
  );
}

// ─── Full scene ───────────────────────────────────────────────────────────────

function SceneContent({ scene, isDark }: { scene: number; isDark: boolean }) {
  const idx       = scene % 5;
  const conceptId = SCENE_CONCEPTS[idx]!;
  const envBase   = getEnvironment(conceptId);
  const lo        = !isDark ? (LIGHT_ENV[conceptId] ?? null) : null;
  const env       = lo ? { ...envBase, ...lo } : envBase;
  const simMode   = getSimMode(conceptId);
  const camPos    = CAM_POSITIONS[idx]!;
  const camTarget = CAM_TARGETS[idx]!;

  const hemiGround = isDark ? '#121520' : '#ffffff';
  const hemiIntensity = isDark ? 0.42 : 0.72;
  const ambientIntensity = isDark ? 0.38 : 0.90;
  const dirIntensity = isDark ? 1.55 : 1.10;
  const fillIntensity = isDark ? 0.35 : 0.28;
  const accentIntensity = isDark ? 0.55 : 0.18;
  const fogNear = lo?.fogNear ?? 12;
  const fogFar  = lo?.fogFar ?? 30;

  return (
    <>
      <SceneBg bg={env.background} fogNear={fogNear} fogFar={fogFar} />
      <CinematicCamera pos={camPos} target={camTarget} />

      {/* ── Lighting — matches real sim ── */}
      <hemisphereLight
        args={[env.ambientColor as unknown as THREE.ColorRepresentation, hemiGround, hemiIntensity]}
      />
      <ambientLight intensity={ambientIntensity} color={env.ambientColor} />
      <directionalLight
        position={[4.5, 9, 4]} intensity={dirIntensity} color={env.keyLightColor}
        castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.00025}
        shadow-camera-far={22} shadow-camera-left={-6} shadow-camera-right={6}
        shadow-camera-top={6} shadow-camera-bottom={-6}
      />
      <directionalLight position={[-5, 5, -4]} intensity={fillIntensity} color={env.fillLightColor} />
      <pointLight position={[-3, 4, -2]} intensity={accentIntensity} color={env.accentColor} />
      <pointLight position={[3.5, 2.2, 3]} intensity={isDark ? 0.28 : 0.10} color={env.accentColor} />

      {/* ── Ground ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.018, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={env.groundColor} roughness={0.92} metalness={0.05} />
      </mesh>
      <ContactShadows
        position={[0, -0.015, 0]} opacity={0.45} scale={24} blur={2.8} far={5} color="#000000"
      />

      {/* ── Grid ── */}
      <Grid
        position={[0, -0.008, 0]} args={[20, 20]}
        cellSize={0.5} cellThickness={0.35}
        cellColor={env.gridColor} sectionSize={2} sectionThickness={0.65}
        sectionColor={env.sectionColor} fadeDistance={20} fadeStrength={1.65}
        infiniteGrid followCamera={false}
      />

      {/* ── Arena geometry ── */}
      <ArenaProps env={env} simMode={simMode} />

      {/* ── Autonomous robot sim — the real thing ── */}
      <ChallengeSim mode={simMode} sumoRingRadius={env.sumoRingRadius} />
    </>
  );
}

// ─── Exported canvas ──────────────────────────────────────────────────────────

export function SparkStage3D({ scene }: { scene: number }) {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' ? document.documentElement.dataset.theme !== 'light' : true,
  );

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.dataset.theme !== 'light');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return (
    <Canvas
      gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={[1, 2]}
      camera={{ position: CAM_POSITIONS[0], fov: 46 }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <Suspense fallback={null}>
        <SceneContent scene={scene} isDark={isDark} />
      </Suspense>
    </Canvas>
  );
}
