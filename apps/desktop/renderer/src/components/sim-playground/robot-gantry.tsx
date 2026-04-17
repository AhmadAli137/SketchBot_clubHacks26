'use client';

/**
 * SketchBotRobot — simplified 3D model of the SketchBot hardware (4× smaller than original).
 *
 * Physical parts modelled:
 *   Chassis     — flat rectangular body
 *   Rear wheels — two DC-motor driven wheels (left + right)
 *   Ball caster — front-center bearing
 *   AprilTag    — fiducial marker extending from the front
 *   Pen tip     — glow-point under the chassis where the marker touches paper
 */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import type { SimPoint } from '@/lib/sim-path-utils';
import { CANVAS_W, CANVAS_H } from '@/lib/sim-path-utils';

const S = 0.25; // global scale factor (1/4 of original)

const CHASSIS_MAT = new THREE.MeshStandardMaterial({ color: '#1a1a22', roughness: 0.65, metalness: 0.2 });
const ACCENT_MAT = new THREE.MeshStandardMaterial({
  color: '#1e3a48',
  emissive: '#2a6080',
  emissiveIntensity: 0.35,
  roughness: 0.45,
  metalness: 0.35,
});
const WHEEL_RUBBER = new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.92, metalness: 0.05 });
const WHEEL_HUB = new THREE.MeshStandardMaterial({ color: '#f5c800', roughness: 0.55, metalness: 0.15 });
const MOTOR_MAT = new THREE.MeshStandardMaterial({ color: '#c8c8d0', roughness: 0.4, metalness: 0.7 });
const CASTER_MAT = new THREE.MeshStandardMaterial({ color: '#c8d0dc', roughness: 0.12, metalness: 0.9 });
const TAG_BLACK = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.85 });
const TAG_WHITE = new THREE.MeshStandardMaterial({ color: '#f5f0e6', roughness: 0.85 });
const PEN_TIP_GLOW = new THREE.MeshStandardMaterial({
  color: '#5de4ff',
  emissive: '#5de4ff',
  emissiveIntensity: 1.4,
  roughness: 0.3,
  metalness: 0,
});

function Wheel({ side }: { side: 1 | -1 }) {
  return (
    <group position={[side * 0.78 * S, 0.28 * S, 0.15 * S]}>
      <mesh rotation={[0, 0, Math.PI / 2]} material={WHEEL_RUBBER} castShadow>
        <cylinderGeometry args={[0.28 * S, 0.28 * S, 0.10 * S, 20]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} material={WHEEL_HUB} castShadow>
        <cylinderGeometry args={[0.14 * S, 0.14 * S, 0.06 * S, 14]} />
      </mesh>
      {/* DC motor body behind the wheel */}
      <mesh position={[side * 0.09 * S, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={MOTOR_MAT}>
        <cylinderGeometry args={[0.10 * S, 0.10 * S, 0.14 * S, 12]} />
      </mesh>
    </group>
  );
}

type Props = { penPos: SimPoint | null; isAnimating: boolean; penDown?: boolean };

export function RobotGantry({ penPos, isAnimating, penDown = true }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const targetRef = useRef({ x: 0, z: 0, heading: 0 });
  const currentRef = useRef({ x: 0, z: 0, heading: 0 });
  const prevRef = useRef<{ x: number; z: number } | null>(null);
  const wheelLRef = useRef<THREE.Group>(null);
  const wheelRRef = useRef<THREE.Group>(null);
  const wheelRot = useRef(0);
  const tipLightRef = useRef<THREE.PointLight>(null);

  useEffect(() => {
    if (!penPos) return;
    const x = (penPos.x - 0.5) * CANVAS_W;
    const z = (penPos.y - 0.5) * CANVAS_H;
    if (prevRef.current) {
      const dx = x - prevRef.current.x;
      const dz = z - prevRef.current.z;
      if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
        targetRef.current.heading = Math.atan2(dx, dz);
      }
    }
    targetRef.current.x = x;
    targetRef.current.z = z;
    prevRef.current = { x, z };
  }, [penPos]);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const lp = 1 - Math.pow(0.002, dt);
    const lr = 1 - Math.pow(0.006, dt);
    const prev = { ...currentRef.current };
    currentRef.current.x = THREE.MathUtils.lerp(currentRef.current.x, targetRef.current.x, lp);
    currentRef.current.z = THREE.MathUtils.lerp(currentRef.current.z, targetRef.current.z, lp);
    let dh = targetRef.current.heading - currentRef.current.heading;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    currentRef.current.heading += dh * lr;
    groupRef.current.position.set(currentRef.current.x, 0, currentRef.current.z);
    groupRef.current.rotation.y = currentRef.current.heading;
    const dist = Math.hypot(currentRef.current.x - prev.x, currentRef.current.z - prev.z);
    wheelRot.current += dist / (0.28 * S);
    if (wheelLRef.current) wheelLRef.current.rotation.x = wheelRot.current;
    if (wheelRRef.current) wheelRRef.current.rotation.x = -wheelRot.current;
    if (tipLightRef.current) {
      tipLightRef.current.intensity = THREE.MathUtils.lerp(
        tipLightRef.current.intensity,
        penDown && isAnimating ? 1.5 : 0,
        1 - Math.pow(0.05, dt),
      );
    }
  });

  return (
    <group ref={groupRef}>
      {/* Chassis */}
      <mesh position={[0, 0.35 * S, 0]} material={CHASSIS_MAT} castShadow receiveShadow>
        <boxGeometry args={[1.5 * S, 0.22 * S, 1.2 * S]} />
      </mesh>
      {/* Cyan edge strip (flush with chassis top) */}
      <mesh position={[0, (0.35 + 0.11 + 0.006) * S, 0]} material={ACCENT_MAT} castShadow>
        <boxGeometry args={[1.52 * S, 0.012 * S, 1.22 * S]} />
      </mesh>

      {/* Bottom plate */}
      <mesh position={[0, 0.15 * S, 0]} material={CHASSIS_MAT}>
        <boxGeometry args={[1.4 * S, 0.04 * S, 1.1 * S]} />
      </mesh>

      {/* Rear wheels + DC motors */}
      <group ref={wheelLRef}><Wheel side={-1} /></group>
      <group ref={wheelRRef}><Wheel side={1} /></group>

      {/* Front ball caster */}
      <group position={[0, 0.10 * S, -0.50 * S]}>
        <mesh material={CHASSIS_MAT}>
          <boxGeometry args={[0.18 * S, 0.10 * S, 0.14 * S]} />
        </mesh>
        <mesh position={[0, -0.06 * S, 0]} material={CASTER_MAT}>
          <sphereGeometry args={[0.08 * S, 14, 10]} />
        </mesh>
      </group>

      {/* AprilTag on front extension arm */}
      <group position={[0, 0.42 * S, -0.80 * S]}>
        {/* Arm */}
        <mesh material={CHASSIS_MAT}>
          <boxGeometry args={[0.08 * S, 0.04 * S, 0.40 * S]} />
        </mesh>
        {/* Tag face */}
        <mesh position={[0, 0.025 * S, -0.18 * S]} rotation={[-Math.PI / 2, 0, 0]} material={TAG_BLACK}>
          <planeGeometry args={[0.28 * S, 0.28 * S]} />
        </mesh>
        <mesh position={[0, 0.027 * S, -0.18 * S]} rotation={[-Math.PI / 2, 0, 0]} material={TAG_WHITE}>
          <planeGeometry args={[0.18 * S, 0.18 * S]} />
        </mesh>
      </group>

      {/* Pen tip glow (contact point) */}
      <mesh position={[0, 0.005, -0.25 * S]} material={PEN_TIP_GLOW}>
        <sphereGeometry args={[0.014, 8, 6]} />
      </mesh>
      <pointLight
        ref={tipLightRef}
        position={[0, 0.01, -0.25 * S]}
        color="#5de4ff"
        intensity={0}
        distance={0.6}
        decay={2}
      />
    </group>
  );
}
