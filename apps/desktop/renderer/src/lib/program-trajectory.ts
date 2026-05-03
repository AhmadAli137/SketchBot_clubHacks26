/**
 * Program-trajectory simulator — walks a Program and predicts where the
 * bot will be after each block, so the 3D overlay can draw arrows from
 * one segment to the next without actually running the executor.
 *
 * Uses the same speed scaling and pivot math as the real executor so the
 * preview matches what'll happen when the kid hits Run. Conditional
 * blocks (motor.until / if / loop with `until`) get a fixed-length
 * indicator since their actual end point is sensor-dependent.
 */

import {
  lengthToMeters, speedToMetersPerSec,
  type Program, type ProgramBlock, type Condition,
} from './program-schema';
import { PROGRAM_MAX_SPEED, PROGRAM_WHEEL_BASE } from './program-executor';

/** Indicator distance for conditional blocks where the real travel is
 *  sensor-dependent. ~0.3 m reads as "this direction, until X" in the
 *  3D overlay without dominating the scene. */
const UNTIL_INDICATOR_M = 0.30;

export type TrajectorySegment =
  | {
      blockId: string;
      kind: 'translate';
      /** Bot pose at the start of this segment. */
      x0: number; z0: number; heading0: number;
      /** Bot pose at the end. */
      x1: number; z1: number; heading1: number;
      /** Number this block has in the top-level sequence (for the 3D label). */
      stepNumber: number;
      /** Source block kind for color/icon mapping. */
      sourceKind: ProgramBlock['kind'];
      /** True for conditional blocks (motor.until) where the end point
       *  is a fixed-length placeholder, not a real distance. */
      isIndicator: boolean;
      /** Sub-label shown next to the arrow ("12 in", "until ultrasonic < 20cm"). */
      label: string;
    }
  | {
      blockId: string;
      kind: 'rotate';
      x0: number; z0: number;
      heading0: number; heading1: number;
      stepNumber: number;
      sourceKind: ProgramBlock['kind'];
      label: string;
    }
  | {
      blockId: string;
      kind: 'pause';
      x: number; z: number; heading: number;
      stepNumber: number;
      sourceKind: ProgramBlock['kind'];
      label: string;
    };

export type StartPose = { x: number; z: number; heading: number };

function fmtCondition(c: Condition): string {
  switch (c.kind) {
    case 'distance.lt': return `until ultrasonic < ${c.threshold.value}${c.threshold.unit}`;
    case 'distance.gt': return `until ultrasonic > ${c.threshold.value}${c.threshold.unit}`;
    case 'travelled':   return `for ${c.distance.value}${c.distance.unit}`;
    case 'elapsed':     return `for ${c.seconds}s`;
  }
}

/** Walk top-level blocks and produce segments. Nested if/loop bodies get
 *  the FIRST branch / first iteration simulated so the kid sees a plausible
 *  preview; full conditional rendering is a follow-up. */
export function simulateTrajectory(program: Program, start: StartPose): TrajectorySegment[] {
  const out: TrajectorySegment[] = [];
  let cursor: StartPose = { ...start };
  let stepNumber = 0;

  const pushBlock = (block: ProgramBlock): void => {
    stepNumber += 1;
    switch (block.kind) {
      case 'drive': {
        const meters = lengthToMeters(block.distance);
        const dir = Math.sign(block.speed) || 1;
        const dist = meters * dir;
        const x1 = cursor.x + dist * Math.cos(cursor.heading);
        const z1 = cursor.z - dist * Math.sin(cursor.heading);
        out.push({
          blockId: block.id, kind: 'translate',
          x0: cursor.x, z0: cursor.z, heading0: cursor.heading,
          x1, z1, heading1: cursor.heading,
          stepNumber, sourceKind: 'drive', isIndicator: false,
          label: `${block.distance.value}${block.distance.unit}`,
        });
        cursor = { x: x1, z: z1, heading: cursor.heading };
        break;
      }
      case 'turn': {
        const heading1 = cursor.heading + (block.degrees * Math.PI) / 180;
        out.push({
          blockId: block.id, kind: 'rotate',
          x0: cursor.x, z0: cursor.z,
          heading0: cursor.heading, heading1,
          stepNumber, sourceKind: 'turn',
          label: `${block.degrees}°`,
        });
        cursor = { ...cursor, heading: heading1 };
        break;
      }
      case 'motor.set': {
        // Forward motion only when both motors run together. One-sided
        // motor sets pivot the chassis — approximate as a heading change.
        const mps = speedToMetersPerSec(block.speed, PROGRAM_MAX_SPEED);
        if (block.side === 'both') {
          const dist = mps * block.seconds;
          const x1 = cursor.x + dist * Math.cos(cursor.heading);
          const z1 = cursor.z - dist * Math.sin(cursor.heading);
          out.push({
            blockId: block.id, kind: 'translate',
            x0: cursor.x, z0: cursor.z, heading0: cursor.heading,
            x1, z1, heading1: cursor.heading,
            stepNumber, sourceKind: 'motor.set', isIndicator: false,
            label: `${block.speed} for ${block.seconds}s`,
          });
          cursor = { x: x1, z: z1, heading: cursor.heading };
        } else {
          // Single-side motor → pivot. ω = mps / wheelBase, so over `seconds`
          // the heading rotates by ω·t. Sign chosen so a left-side-only
          // burst pivots right (CW) and vice versa.
          const omega = mps / PROGRAM_WHEEL_BASE;
          const sign = block.side === 'left' ? -1 : +1;
          const heading1 = cursor.heading + sign * omega * block.seconds;
          out.push({
            blockId: block.id, kind: 'rotate',
            x0: cursor.x, z0: cursor.z,
            heading0: cursor.heading, heading1,
            stepNumber, sourceKind: 'motor.set',
            label: `${block.side} motor ${block.speed} for ${block.seconds}s`,
          });
          cursor = { ...cursor, heading: heading1 };
        }
        break;
      }
      case 'motor.until': {
        // Fixed-length indicator — real distance depends on sensor reads
        // at runtime. Show direction with a dashed arrow.
        const mps = speedToMetersPerSec(block.speed, PROGRAM_MAX_SPEED);
        const dir = Math.sign(mps) || 1;
        const dist = UNTIL_INDICATOR_M * dir;
        const x1 = cursor.x + dist * Math.cos(cursor.heading);
        const z1 = cursor.z - dist * Math.sin(cursor.heading);
        out.push({
          blockId: block.id, kind: 'translate',
          x0: cursor.x, z0: cursor.z, heading0: cursor.heading,
          x1, z1, heading1: cursor.heading,
          stepNumber, sourceKind: 'motor.until', isIndicator: true,
          label: `${fmtCondition(block.condition)}`,
        });
        cursor = { x: x1, z: z1, heading: cursor.heading };
        break;
      }
      case 'wait': {
        out.push({
          blockId: block.id, kind: 'pause',
          x: cursor.x, z: cursor.z, heading: cursor.heading,
          stepNumber, sourceKind: 'wait',
          label: `${block.seconds}s`,
        });
        break;
      }
      case 'stop': {
        out.push({
          blockId: block.id, kind: 'pause',
          x: cursor.x, z: cursor.z, heading: cursor.heading,
          stepNumber, sourceKind: 'stop',
          label: 'stop',
        });
        break;
      }
      case 'if': {
        // Preview the THEN branch — the kid sees the most likely path. Else
        // is omitted from the overlay; the sequence panel lists it.
        for (const child of block.then) pushBlock(child);
        break;
      }
      case 'loop': {
        // Preview the body once. A `times>1` could replay it, but visual
        // clarity wins over completeness here.
        for (const child of block.body) pushBlock(child);
        break;
      }
    }
  };

  for (const block of program.blocks) pushBlock(block);
  return out;
}
