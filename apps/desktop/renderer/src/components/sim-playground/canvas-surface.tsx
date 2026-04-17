'use client';

/**
 * CanvasSurface — the paper + drawn ink paths in 3D space.
 * Paper sits on the XZ plane (Y=0). Ink paths are rendered slightly above it.
 *
 * Uses native THREE.Line (WebGL1-compatible) instead of @react-three/drei Line,
 * which requires WebGL2 extensions unavailable in some Electron builds.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import type { SimPoint } from '@/lib/sim-path-utils';
import { CANVAS_W, CANVAS_H, normTo3D } from '@/lib/sim-path-utils';

// ─── Paper materials ──────────────────────────────────────────────────────────

const PAPER_MAT = new THREE.MeshStandardMaterial({
  color: '#f4f0e8',
  roughness: 0.82,
  metalness: 0.02,
});

const PAPER_BORDER_MAT = new THREE.MeshStandardMaterial({
  color: '#c8c2b6',
  roughness: 0.88,
  metalness: 0,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * NativeLine — uses THREE.Line directly (WebGL1-compatible).
 * The drei Line component uses LineSegments2 / LineGeometry which requires
 * the EXT_texture_norm16 and ANGLE_instanced_arrays extensions — not always
 * available in Electron's software or older GPU paths.
 */
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
    const mat = new THREE.LineBasicMaterial({
      color,
      opacity,
      transparent: opacity < 1,
      depthWrite: opacity >= 0.99,
    });
    return new THREE.Line(geo, mat);
  }, [points, color, opacity]);

  // Dispose on unmount or when obj changes
  useEffect(
    () => () => {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    },
    [obj],
  );

  return <primitive object={obj} />;
}

// ─── AprilTag corner marker ───────────────────────────────────────────────────

function CornerMarker({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.14, 0.14]} />
        <meshStandardMaterial color="#111" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.07, 0.07]} />
        <meshStandardMaterial color="#f0ede6" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.028, 0.028]} />
        <meshStandardMaterial color="#111" roughness={0.9} />
      </mesh>
    </group>
  );
}

// ─── Grid lines on the paper surface ─────────────────────────────────────────

function PaperGrid() {
  const lines = useMemo<[number, number, number][][]>(() => {
    const result: [number, number, number][][] = [];
    const cols = 6;
    const rows = 4;

    for (let c = 1; c < cols; c++) {
      const x = -CANVAS_W / 2 + (c / cols) * CANVAS_W;
      result.push([[x, 0.003, -CANVAS_H / 2], [x, 0.003, CANVAS_H / 2]]);
    }
    for (let r = 1; r < rows; r++) {
      const z = -CANVAS_H / 2 + (r / rows) * CANVAS_H;
      result.push([[-CANVAS_W / 2, 0.003, z], [CANVAS_W / 2, 0.003, z]]);
    }
    return result;
  }, []);

  return (
    <>
      {lines.map((pts, i) => (
        <NativeLine
          key={i}
          points={pts as [number, number, number][]}
          color="#6478b4"
          opacity={0.28}
        />
      ))}
    </>
  );
}

// ─── Ink path rendering ───────────────────────────────────────────────────────

function InkLine({ points, active = false }: { points: SimPoint[]; active?: boolean }) {
  const pts = useMemo(
    () => points.map(normTo3D) as [number, number, number][],
    [points],
  );

  if (pts.length < 2) return null;

  return (
    <NativeLine
      points={pts}
      color={active ? '#7cf0ff' : '#5bc8e8'}
      opacity={active ? 1 : 0.82}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  settledLines: SimPoint[][];
  activeLine: SimPoint[];
  showGrid?: boolean;
};

export function CanvasSurface({ settledLines, activeLine, showGrid = true }: Props) {
  const halfW = CANVAS_W / 2;
  const halfH = CANVAS_H / 2;
  const markerOffset = 0.1;

  return (
    <group>
      {/* Paper surface */}
      <mesh position={[0, 0, 0]} receiveShadow material={PAPER_MAT}>
        <boxGeometry args={[CANVAS_W, 0.016, CANVAS_H]} />
      </mesh>

      {/* Paper edge highlight */}
      <mesh position={[0, 0.0105, 0]} material={PAPER_BORDER_MAT}>
        <boxGeometry args={[CANVAS_W + 0.006, 0.004, CANVAS_H + 0.006]} />
      </mesh>

      {/* Thin border/shadow around paper */}
      <mesh position={[0, -0.004, 0]} material={PAPER_BORDER_MAT}>
        <boxGeometry args={[CANVAS_W + 0.03, 0.008, CANVAS_H + 0.03]} />
      </mesh>

      {/* AprilTag corner markers */}
      <CornerMarker pos={[-halfW + markerOffset, 0.009, -halfH + markerOffset]} />
      <CornerMarker pos={[halfW - markerOffset,  0.009, -halfH + markerOffset]} />
      <CornerMarker pos={[-halfW + markerOffset, 0.009,  halfH - markerOffset]} />
      <CornerMarker pos={[halfW - markerOffset,  0.009,  halfH - markerOffset]} />

      {/* Grid */}
      {showGrid && <PaperGrid />}

      {/* Settled ink paths */}
      {settledLines.map((line, i) => (
        <InkLine key={`settled-${i}`} points={line} active={false} />
      ))}

      {/* Currently-drawing path */}
      {activeLine.length >= 2 && <InkLine points={activeLine} active={true} />}
    </group>
  );
}
