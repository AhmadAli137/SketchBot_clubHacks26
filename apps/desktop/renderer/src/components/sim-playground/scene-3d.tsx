'use client';

/**
 * Scene3D — React Three Fiber scene containing:
 *   - Floor / workspace environment
 *   - Paper canvas on the floor
 *   - AprilTag reference markers around the workspace
 *   - SketchBotRobot model
 *   - Drawn ink paths (on canvas surface)
 *   - Coordinate axis labels
 *   - Overhead "camera feed" frustum visualization
 */

import { useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import { RobotGantry } from './robot-gantry';
import { CanvasSurface } from './canvas-surface';
import type { SimPoint } from '@/lib/sim-path-utils';
import { CANVAS_W, CANVAS_H } from '@/lib/sim-path-utils';

// ─── WebGL1-compatible line (avoids drei LineSegments2 / WebGL2 ext deps) ─────

function NativeLine({
  points,
  color,
  opacity = 1,
}: {
  points: [number, number, number][];
  color: string;
  opacity?: number;
}) {
  const obj = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(
      points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    );
    const mat = new THREE.LineBasicMaterial({ color, opacity, transparent: opacity < 1 });
    return new THREE.Line(geo, mat);
  }, [points, color, opacity]);

  useEffect(
    () => () => {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    },
    [obj],
  );

  return <primitive object={obj} />;
}

// ─── AprilTag reference marker ────────────────────────────────────────────────

/** Fixed checkerboard bits — avoids Math.random() flicker between frames. */
const APRIL_DOT_OFFSETS: [number, number, string][] = [
  [-0.055, -0.055, '#111'],
  [0, -0.055, '#f5f0e6'],
  [0.055, -0.055, '#111'],
  [-0.055, 0, '#f5f0e6'],
  [0.055, 0, '#111'],
  [-0.055, 0.055, '#111'],
  [0, 0.055, '#111'],
  [0.055, 0.055, '#f5f0e6'],
];

function AprilTagMarker({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Black outer square */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.3, 0.3]} />
        <meshStandardMaterial color="#111" roughness={0.85} />
      </mesh>
      {/* White inner */}
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.21, 0.21]} />
        <meshStandardMaterial color="#f5f0e6" roughness={0.85} />
      </mesh>
      {APRIL_DOT_OFFSETS.map(([dx, dz, col], i) => (
        <mesh key={i} position={[dx, 0.004, dz]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.03, 0.03]} />
          <meshStandardMaterial color={col} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Coordinate axis indicator ────────────────────────────────────────────────

function CoordAxes() {
  const axisLen = 0.8;
  const coneR = 0.04;
  const coneH = 0.12;
  return (
    <group position={[-CANVAS_W / 2 - 0.05, 0.01, CANVAS_H / 2 + 0.05]}>
      {/* X axis (red) — shaft + arrowhead cone */}
      <mesh position={[axisLen / 2, 0, 0]}>
        <boxGeometry args={[axisLen, 0.018, 0.018]} />
        <meshStandardMaterial color="#ff4060" emissive="#ff4060" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[axisLen + coneH / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[coneR, coneH, 8]} />
        <meshStandardMaterial color="#ff4060" emissive="#ff4060" emissiveIntensity={0.5} />
      </mesh>

      {/* Z axis (blue) — shaft + arrowhead cone */}
      <mesh position={[0, 0, -axisLen / 2]}>
        <boxGeometry args={[0.018, 0.018, axisLen]} />
        <meshStandardMaterial color="#4080ff" emissive="#4080ff" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, 0, -axisLen - coneH / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[coneR, coneH, 8]} />
        <meshStandardMaterial color="#4080ff" emissive="#4080ff" emissiveIntensity={0.5} />
      </mesh>

      {/* Y axis (green, points up) — shaft + arrowhead cone */}
      <mesh position={[0, axisLen / 2, 0]}>
        <boxGeometry args={[0.018, axisLen, 0.018]} />
        <meshStandardMaterial color="#4dffb8" emissive="#4dffb8" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, axisLen + coneH / 2, 0]}>
        <coneGeometry args={[coneR, coneH, 8]} />
        <meshStandardMaterial color="#4dffb8" emissive="#4dffb8" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

// ─── Overhead camera frustum (shows the "eye" that tracks the robot) ──────────

function OverheadCamera() {
  const camHeight = 3.5;
  return (
    <group position={[0, camHeight, 0]}>
      {/* Camera body */}
      <mesh>
        <boxGeometry args={[0.22, 0.16, 0.22]} />
        <meshStandardMaterial color="#1a1e2e" roughness={0.6} metalness={0.4} />
      </mesh>
      {/* Lens */}
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.055, 0.065, 0.1, 16]} />
        <meshStandardMaterial color="#050808" roughness={0.2} metalness={0.6} />
      </mesh>
      {/* Lens glass */}
      <mesh position={[0, -0.175, 0]}>
        <circleGeometry args={[0.045, 16]} />
        <meshStandardMaterial color="#1a3a6a" roughness={0.1} metalness={0.3} transparent opacity={0.8} />
      </mesh>
      {/* FOV frustum lines */}
      {([-1, 1] as const).map((sx) =>
        ([-1, 1] as const).map((sz) => {
          const x = sx * CANVAS_W * 0.55;
          const z = sz * CANVAS_H * 0.55;
          return (
            <NativeLine
              key={`fov-${sx}-${sz}`}
              points={[[0, 0, 0], [x, -camHeight + 0.05, z]]}
              color="#5de4ff"
              opacity={0.15}
            />
          );
        }),
      )}
      {/* Mount pole */}
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 3.2, 8]} />
        <meshStandardMaterial color="#2a2e3e" roughness={0.7} />
      </mesh>
    </group>
  );
}

// ─── Scene content ────────────────────────────────────────────────────────────

function SceneContent({
  settledLines,
  activeLine,
  penPos,
  isAnimating,
  showGrid,
  showAxes,
  showCamera,
}: {
  settledLines: SimPoint[][];
  activeLine: SimPoint[];
  penPos: SimPoint | null;
  isAnimating: boolean;
  showGrid: boolean;
  showAxes: boolean;
  showCamera: boolean;
}) {
  return (
    <>
      <color attach="background" args={['#060a18']} />
      <fog attach="fog" args={['#060a18', 14, 38]} />

      {/* Lighting — warm key + cool fill for readable depth */}
      <hemisphereLight args={['#6a8ab8', '#121520', 0.42]} />
      <ambientLight intensity={0.38} color="#c8d4f0" />
      <directionalLight
        position={[4.5, 9, 4]}
        intensity={1.55}
        color="#fff5eb"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.02}
        shadow-camera-far={22}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <directionalLight position={[-5, 5, -4]} intensity={0.35} color="#a8c8ff" />
      <pointLight position={[-3, 4, -2]} intensity={0.55} color="#5de4ff" />
      <pointLight position={[3.5, 2.2, 3]} intensity={0.28} color="#9080ff" />

      {/* Ground plane — grounds shadows and grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.018, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#080c18" roughness={0.92} metalness={0.05} />
      </mesh>

      <ContactShadows
        position={[0, -0.015, 0]}
        opacity={0.45}
        scale={24}
        blur={2.8}
        far={5}
        color="#000000"
      />

      {/* Floor grid */}
      {showGrid && (
        <Grid
          position={[0, -0.008, 0]}
          args={[20, 20]}
          cellSize={0.5}
          cellThickness={0.35}
          cellColor="#283050"
          sectionSize={2}
          sectionThickness={0.65}
          sectionColor="#3d4a78"
          fadeDistance={20}
          fadeStrength={1.65}
          infiniteGrid
          followCamera={false}
        />
      )}

      {/* Paper canvas + drawn paths */}
      <CanvasSurface
        settledLines={settledLines}
        activeLine={activeLine}
        showGrid={showGrid}
      />

      {/* AprilTag reference markers around the workspace */}
      <AprilTagMarker position={[-CANVAS_W / 2 - 0.45, 0, -CANVAS_H / 2 - 0.45]} />
      <AprilTagMarker position={[CANVAS_W / 2 + 0.45, 0, -CANVAS_H / 2 - 0.45]} />
      <AprilTagMarker position={[-CANVAS_W / 2 - 0.45, 0, CANVAS_H / 2 + 0.45]} />
      <AprilTagMarker position={[CANVAS_W / 2 + 0.45, 0, CANVAS_H / 2 + 0.45]} />

      {/* The SketchBot robot */}
      <RobotGantry penPos={penPos} isAnimating={isAnimating} penDown={isAnimating} />

      {/* Coordinate axes */}
      {showAxes && <CoordAxes />}

      {/* Overhead camera rig */}
      {showCamera && <OverheadCamera />}

      {/* Orbit controls */}
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        minDistance={1.5}
        maxDistance={14}
        maxPolarAngle={Math.PI * 0.88}
        target={[0, 0.2, 0]}
      />
    </>
  );
}

// ─── Exported 3D Canvas ───────────────────────────────────────────────────────

type Scene3DProps = {
  settledLines: SimPoint[][];
  activeLine: SimPoint[];
  penPos: SimPoint | null;
  isAnimating: boolean;
  showGrid?: boolean;
  showAxes?: boolean;
  showCamera?: boolean;
  className?: string;
};

export function Scene3D({
  settledLines,
  activeLine,
  penPos,
  isAnimating,
  showGrid = true,
  showAxes = true,
  showCamera = true,
  className,
}: Scene3DProps) {
  return (
    <Canvas
      className={className}
      shadows
      camera={{ position: [5.2, 4.2, 5.2], fov: 42, near: 0.1, far: 60 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.92,
        powerPreference: 'high-performance',
      }}
      style={{ width: '100%', height: '100%', background: '#060a18' }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color('#060a18'), 1);
      }}
    >
      <SceneContent
        settledLines={settledLines}
        activeLine={activeLine}
        penPos={penPos}
        isAnimating={isAnimating}
        showGrid={showGrid}
        showAxes={showAxes}
        showCamera={showCamera}
      />
    </Canvas>
  );
}
