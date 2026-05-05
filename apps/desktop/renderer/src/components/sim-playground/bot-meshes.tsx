'use client';

/**
 * Shared visual meshes for the SparkMiniBot and SumoBot.
 *
 * Pure JSX — no pose state, no useFrame integration. The owning component
 * supplies wheel-spinner refs (and any heading / pitch / roll wrap groups)
 * around this mesh.
 *
 * Local +X is "forward" for both bots (matching the sandbox's BotObject
 * convention). Wheels spin around their own .rotation.z (their cylinder
 * axis is aligned to the world Z when the bot is at angle 0).
 */

import type { RefObject } from 'react';
import * as THREE from 'three';

export type MiniBotWheelRefs = {
  left?:  RefObject<THREE.Group | null>;
  right?: RefObject<THREE.Group | null>;
};

export type SumoBotWheelRefs = {
  leftFront?:  RefObject<THREE.Group | null>;
  leftRear?:   RefObject<THREE.Group | null>;
  rightFront?: RefObject<THREE.Group | null>;
  rightRear?:  RefObject<THREE.Group | null>;
};

// ─── SparkMiniBotMesh ────────────────────────────────────────────────────────
// Round acrylic chassis lifted high off the ground, yellow TT-style gear
// motors visible under the chassis sides, hex-lug wheels, a front caster
// ball on a drop bracket, an HC-SR04 ultrasonic on a forward post, and an
// Arduino-style board on top. No face — silhouette only.

export function SparkMiniBotMesh({ wheelRefs }: { wheelRefs?: MiniBotWheelRefs }) {
  const wheelR     = 0.052;
  const wheelT     = 0.024;
  const axleY      = wheelR;
  const plateY     = wheelR + 0.030;
  const plateT     = 0.008;
  const plateRX    = 0.110;
  const plateRZ    = 0.090;
  const wheelX     = -0.020;
  const wheelZouter = plateRZ + wheelT / 2 + 0.003;

  return (
    <>
      {/* Chassis plate */}
      <mesh position={[0, plateY, 0]} scale={[plateRX / 0.090, 1, plateRZ / 0.090]} castShadow receiveShadow>
        <cylinderGeometry args={[0.090, 0.090, plateT, 36]} />
        <meshStandardMaterial color="#eef0f5" roughness={0.32} metalness={0.18} />
      </mesh>

      {/* Yellow TT gear motors */}
      {[wheelZouter - wheelT - 0.020, -(wheelZouter - wheelT - 0.020)].map((zPos, i) => (
        <group key={i} position={[wheelX, axleY, zPos]}>
          <mesh castShadow>
            <boxGeometry args={[0.085, 0.034, 0.024]} />
            <meshStandardMaterial color="#e8b827" roughness={0.55} metalness={0.25} />
          </mesh>
          <mesh position={[0.012, 0, (zPos > 0 ? 1 : -1) * 0.014]}>
            <boxGeometry args={[0.058, 0.030, 0.005]} />
            <meshStandardMaterial color="#3a2f12" roughness={0.7} />
          </mesh>
          <mesh position={[0.012, 0, (zPos > 0 ? 1 : -1) * (0.014 + 0.012)]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.004, 0.004, 0.024, 12]} />
            <meshStandardMaterial color="#c0c0c8" roughness={0.4} metalness={0.85} />
          </mesh>
        </group>
      ))}

      {/* Drive wheels — tire + tread band + hub disc + hex lug + radial spoke */}
      {[
        { zPos:  wheelZouter, ref: wheelRefs?.left  },
        { zPos: -wheelZouter, ref: wheelRefs?.right },
      ].map(({ zPos, ref }, i) => (
        <group key={i} position={[wheelX, axleY, zPos]}>
          <group ref={ref}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[wheelR, wheelR, wheelT, 28]} />
              <meshStandardMaterial color="#161620" roughness={0.94} metalness={0.04} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[wheelR + 0.001, wheelR + 0.001, wheelT * 0.5, 28]} />
              <meshStandardMaterial color="#1a1a22" roughness={0.95} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, (zPos > 0 ? 1 : -1) * (wheelT / 2 + 0.001)]}>
              <cylinderGeometry args={[wheelR * 0.55, wheelR * 0.55, 0.004, 18]} />
              <meshStandardMaterial color="#d2d4dc" roughness={0.4} metalness={0.6} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, (zPos > 0 ? 1 : -1) * (wheelT / 2 + 0.004)]}>
              <cylinderGeometry args={[wheelR * 0.16, wheelR * 0.16, 0.005, 6]} />
              <meshStandardMaterial color="#5de4ff" emissive="#5de4ff" emissiveIntensity={0.6} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, (zPos > 0 ? 1 : -1) * (wheelT / 2 + 0.003)]}>
              <boxGeometry args={[wheelR * 1.05, 0.005, 0.005]} />
              <meshStandardMaterial color="#3a3f4e" roughness={0.7} metalness={0.4} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Front caster — bracket strut + cup + chrome ball */}
      <mesh position={[plateRX - 0.030, (plateY - plateT / 2) / 2 + 0.016, 0]} castShadow>
        <boxGeometry args={[0.018, plateY - plateT / 2 - 0.032, 0.018]} />
        <meshStandardMaterial color="#2a2f3e" roughness={0.55} metalness={0.55} />
      </mesh>
      <mesh position={[plateRX - 0.030, 0.030, 0]}>
        <cylinderGeometry args={[0.014, 0.012, 0.012, 14]} />
        <meshStandardMaterial color="#3a3f4e" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[plateRX - 0.030, 0.018, 0]} castShadow>
        <sphereGeometry args={[0.018, 20, 16]} />
        <meshStandardMaterial color="#1f2330" roughness={0.22} metalness={0.9} />
      </mesh>

      {/* HC-SR04 ultrasonic on a forward post */}
      <mesh position={[plateRX - 0.012, plateY + plateT / 2 + 0.018, 0]} castShadow>
        <cylinderGeometry args={[0.005, 0.005, 0.036, 10]} />
        <meshStandardMaterial color="#3a3f4e" roughness={0.45} metalness={0.6} />
      </mesh>
      <group position={[plateRX - 0.012, plateY + plateT / 2 + 0.040, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.018, 0.024, 0.075]} />
          <meshStandardMaterial color="#1f4a2a" roughness={0.6} metalness={0.2} />
        </mesh>
        {[0.020, -0.020].map((zPos, i) => (
          <mesh key={i} position={[0.012, 0, zPos]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.012, 0.012, 0.008, 20]} />
            <meshStandardMaterial color="#b8b8c0" roughness={0.32} metalness={0.88} />
          </mesh>
        ))}
        {[0.020, -0.020].map((zPos, i) => (
          <mesh key={`g${i}`} position={[0.020, 0, zPos]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.0095, 0.0095, 0.0005, 20]} />
            <meshStandardMaterial color="#42434a" roughness={0.85} />
          </mesh>
        ))}
        <mesh position={[0.008, 0, 0]}>
          <boxGeometry args={[0.005, 0.006, 0.012]} />
          <meshStandardMaterial color="#9a9aa2" roughness={0.4} metalness={0.7} />
        </mesh>
      </group>

      {/* Blue Arduino-style board on top of the chassis */}
      <group position={[-0.015, plateY + plateT / 2 + 0.006, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.090, 0.005, 0.062]} />
          <meshStandardMaterial color="#1d6a93" roughness={0.45} metalness={0.25} />
        </mesh>
        <mesh position={[0, 0.004, 0.024]}>
          <boxGeometry args={[0.075, 0.004, 0.006]} />
          <meshStandardMaterial color="#1a1a1f" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.004, -0.024]}>
          <boxGeometry args={[0.075, 0.004, 0.006]} />
          <meshStandardMaterial color="#1a1a1f" roughness={0.85} />
        </mesh>
        <mesh position={[0.025, 0.0055, 0]}>
          <sphereGeometry args={[0.0035, 8, 6]} />
          <meshStandardMaterial color="#7affae" emissive="#7affae" emissiveIntensity={2.2} />
        </mesh>
      </group>
    </>
  );
}

// ─── SumoBotMesh ─────────────────────────────────────────────────────────────
// Wider 4WD combat chassis with red armor shell, hazard stripes, status LED,
// side bumper rails, and the signature wedge plow up front. Rear exhaust
// tubes for character. Local +X is forward.

export function SumoBotMesh({ wheelRefs }: { wheelRefs?: SumoBotWheelRefs }) {
  const wheelR = 0.045;
  const wheelT = 0.028;
  const axleY  = wheelR;
  const plateY = wheelR + 0.018;
  const plateT = 0.012;
  const plateRX = 0.130;
  const plateRZ = 0.105;
  const wheelZouter = plateRZ + wheelT / 2 + 0.003;
  const wheelXFront = 0.075;
  const wheelXRear  = -0.075;

  return (
    <>
      {/* Lower armor plate (the heavy base) */}
      <mesh position={[0, plateY, 0]} castShadow receiveShadow>
        <boxGeometry args={[plateRX * 2, plateT, plateRZ * 2]} />
        <meshStandardMaterial color="#2a2a30" roughness={0.65} metalness={0.55} />
      </mesh>

      {/* Top body shell — red combat armor in two stepped tiers */}
      <mesh position={[-0.005, plateY + plateT / 2 + 0.020, 0]} castShadow>
        <boxGeometry args={[0.190, 0.040, 0.180]} />
        <meshStandardMaterial color="#bd1a1a" roughness={0.42} metalness={0.30} />
      </mesh>
      <mesh position={[-0.025, plateY + plateT / 2 + 0.050, 0]} castShadow>
        <boxGeometry args={[0.110, 0.022, 0.130]} />
        <meshStandardMaterial color="#9a1414" roughness={0.45} metalness={0.30} />
      </mesh>
      {[-0.018, -0.006, 0.006, 0.018].map((zPos, i) => (
        <mesh key={i} position={[-0.025, plateY + plateT / 2 + 0.062, zPos]}>
          <boxGeometry args={[0.060, 0.004, 0.004]} />
          <meshStandardMaterial color="#1a0a0a" roughness={0.85} />
        </mesh>
      ))}
      {[-0.030, 0.010, 0.050].map((xPos, i) => (
        <mesh key={`stripe${i}`} position={[xPos, plateY + plateT / 2 + 0.041, 0]}>
          <boxGeometry args={[0.012, 0.001, 0.140]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#ffaa00' : '#1a1a1a'} emissive={i % 2 === 0 ? '#ffaa00' : '#000000'} emissiveIntensity={i % 2 === 0 ? 0.4 : 0} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0.060, plateY + plateT / 2 + 0.061, 0]}>
        <sphereGeometry args={[0.005, 10, 8]} />
        <meshStandardMaterial color="#ff3030" emissive="#ff3030" emissiveIntensity={3} />
      </mesh>

      {/* Side bumper rails */}
      {[plateRZ + 0.006, -(plateRZ + 0.006)].map((zPos, i) => (
        <mesh key={`rail${i}`} position={[0, plateY + plateT / 2 + 0.012, zPos]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.010, 0.010, plateRX * 1.85, 12]} />
          <meshStandardMaterial color="#3a3f4e" roughness={0.4} metalness={0.85} />
        </mesh>
      ))}

      {/* Front wedge plow */}
      {(() => {
        const wedgeLen   = 0.080;
        const wedgeWidth = plateRZ * 2 + 0.010;
        const wedgeThk   = 0.005;
        const tilt = Math.atan2(plateY + plateT / 2, wedgeLen);
        const rearX = plateRX;
        const rearY = plateY + plateT / 2;
        const cx = rearX + (wedgeLen / 2) * Math.cos(tilt);
        const cy = rearY - (wedgeLen / 2) * Math.sin(tilt);
        return (
          <group>
            <mesh position={[cx, cy, 0]} rotation={[0, 0, -tilt]} castShadow>
              <boxGeometry args={[wedgeLen, wedgeThk, wedgeWidth]} />
              <meshStandardMaterial color="#454850" roughness={0.35} metalness={0.92} />
            </mesh>
            <mesh position={[cx + (wedgeLen / 2 - 0.002) * Math.cos(tilt), cy - (wedgeLen / 2 - 0.002) * Math.sin(tilt), 0]} rotation={[0, 0, -tilt]}>
              <boxGeometry args={[0.008, wedgeThk + 0.0005, wedgeWidth + 0.001]} />
              <meshStandardMaterial color="#1a1a1f" roughness={0.7} metalness={0.6} />
            </mesh>
            {[wedgeWidth / 2 - 0.003, -(wedgeWidth / 2 - 0.003)].map((zPos, i) => (
              <mesh key={`gusset${i}`} position={[rearX + 0.020, plateY + plateT / 2 + 0.002, zPos]}>
                <boxGeometry args={[0.040, 0.012, 0.005]} />
                <meshStandardMaterial color="#2a2a30" roughness={0.6} metalness={0.5} />
              </mesh>
            ))}
          </group>
        );
      })()}

      {/* Four wheels with TT motors slung beneath each corner */}
      {[
        { wx: wheelXFront, wz:  wheelZouter, mz:  wheelZouter - wheelT - 0.020, ref: wheelRefs?.leftFront  },
        { wx: wheelXFront, wz: -wheelZouter, mz: -(wheelZouter - wheelT - 0.020), ref: wheelRefs?.rightFront },
        { wx: wheelXRear,  wz:  wheelZouter, mz:  wheelZouter - wheelT - 0.020, ref: wheelRefs?.leftRear   },
        { wx: wheelXRear,  wz: -wheelZouter, mz: -(wheelZouter - wheelT - 0.020), ref: wheelRefs?.rightRear  },
      ].map(({ wx, wz, mz, ref }, i) => (
        <group key={`drive${i}`}>
          <group position={[wx, axleY, mz]}>
            <mesh castShadow>
              <boxGeometry args={[0.075, 0.030, 0.022]} />
              <meshStandardMaterial color="#d8a821" roughness={0.55} metalness={0.30} />
            </mesh>
            <mesh position={[0.010, 0, (mz > 0 ? 1 : -1) * 0.020]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.003, 0.003, 0.020, 10]} />
              <meshStandardMaterial color="#c0c0c8" roughness={0.4} metalness={0.85} />
            </mesh>
          </group>
          <group position={[wx, axleY, wz]}>
            <group ref={ref}>
              <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[wheelR, wheelR, wheelT, 28]} />
                <meshStandardMaterial color="#0e0e14" roughness={0.95} metalness={0.04} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[wheelR + 0.001, wheelR + 0.001, wheelT * 0.5, 28]} />
                <meshStandardMaterial color="#1a1a22" roughness={0.95} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, (wz > 0 ? 1 : -1) * (wheelT / 2 + 0.001)]}>
                <cylinderGeometry args={[wheelR * 0.55, wheelR * 0.55, 0.004, 18]} />
                <meshStandardMaterial color="#bd1a1a" roughness={0.5} metalness={0.45} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, (wz > 0 ? 1 : -1) * (wheelT / 2 + 0.004)]}>
                <cylinderGeometry args={[wheelR * 0.16, wheelR * 0.16, 0.005, 6]} />
                <meshStandardMaterial color="#9a9aa2" roughness={0.45} metalness={0.85} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, (wz > 0 ? 1 : -1) * (wheelT / 2 + 0.003)]}>
                <boxGeometry args={[wheelR * 1.05, 0.005, 0.005]} />
                <meshStandardMaterial color="#3a1010" roughness={0.7} metalness={0.4} />
              </mesh>
            </group>
          </group>
        </group>
      ))}

      {/* Rear exhaust tubes */}
      {[0.024, -0.024].map((zPos, i) => (
        <mesh key={`exh${i}`} position={[-plateRX - 0.006, plateY + plateT / 2 + 0.015, zPos]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.008, 0.008, 0.018, 12]} />
          <meshStandardMaterial color="#1a1a1f" roughness={0.85} metalness={0.4} />
        </mesh>
      ))}
    </>
  );
}
