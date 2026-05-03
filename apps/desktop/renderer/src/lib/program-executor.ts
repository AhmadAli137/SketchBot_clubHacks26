/**
 * Program executor — walks a Program tree and drives a placed bot's
 * pose by writing motor commands. The visual chassis integrator (rAF
 * loop in BotController) does the actual physics; this module is just
 * the "what speeds, when, until what" sequencer.
 *
 * Coexistence with the user's gamepad/keyboard control: the BotController
 * heldRef writes motor TARGETS every frame. While a program is running,
 * BotController checks the executor's `isProgramActive(botId)` signal and
 * stops writing held-key motors so the executor's commands aren't
 * stomped. On stop/abort, control returns to the user.
 *
 * Sensors are injected — the simulator wires its own ultrasonic readout
 * and odometer (distance travelled), and a hardware bridge would inject
 * real-sensor reads against the same interface.
 */

import { getPose, setMotors, type BotPose } from '@/components/sim-playground/bot-drive';
import {
  lengthToMeters, speedToMetersPerSec,
  type Condition, type Program, type ProgramBlock,
} from './program-schema';

/** Top forward speed (m/s) the kid's 0..100 maps onto. Mirrors the
 *  MAX_FORWARD_SPEED used by the manual BotController so program-driven
 *  motion feels like the same vehicle. */
export const PROGRAM_MAX_SPEED = 1.30;
export const PROGRAM_WHEEL_BASE = 0.20;

export type SensorPort = {
  /** Ultrasonic forward-facing distance in metres. Infinity if no
   *  obstacle within range. The simulator computes this by raycasting
   *  forward against walls + pushable objects. */
  ultrasonicMeters(botId: string): number;
};

export type ExecutorEvent =
  | { kind: 'block.enter'; blockId: string }
  | { kind: 'block.exit';  blockId: string }
  | { kind: 'program.done' }
  | { kind: 'program.aborted'; reason: string };

export type ExecutorOptions = {
  sensor: SensorPort;
  /** Called as the executor enters/exits each block — drives the visual
   *  highlight in the Programming tab so the kid can see which step is
   *  running. */
  onEvent?: (e: ExecutorEvent) => void;
  /** Resolved when the caller wants to stop execution. */
  abortSignal?: AbortSignal;
};

const activeProgramBots = new Set<string>();
export function isProgramActive(botId: string): boolean {
  return activeProgramBots.has(botId);
}

// ─── Pause/resume — module-level so both the run-control UI (play/pause
// button) and the per-block delay loop can see the same state without
// passing yet another signal through every callsite.
let _paused = false;
const pauseListeners = new Set<(p: boolean) => void>();
export function isProgramPaused(): boolean { return _paused; }
export function pauseProgram(): void { if (!_paused) { _paused = true; pauseListeners.forEach((fn) => fn(true)); } }
export function resumeProgram(): void { if (_paused) { _paused = false; pauseListeners.forEach((fn) => fn(false)); } }
export function onPauseChange(fn: (p: boolean) => void): () => void {
  pauseListeners.add(fn);
  return () => pauseListeners.delete(fn);
}

class AbortError extends Error {
  constructor(reason: string) { super(reason); this.name = 'AbortError'; }
}

/** Sleep that respects the abort signal AND the global pause flag —
 *  resolves on either timeout OR abort. While paused, the elapsed-time
 *  accumulator freezes (so a 5-s wait that gets paused at 2 s still has
 *  3 s left when resumed). The optional `restoreMotors` callback re-
 *  applies whatever motor targets the calling block needed after a
 *  pause-resume cycle. Polls 16 ms (~one frame) so motor.until sensor
 *  reads stay fresh. */
function delay(
  ms: number,
  signal: AbortSignal | undefined,
  onTick?: () => boolean,
  botId?: string,
  restoreMotors?: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new AbortError('aborted')); return; }
    let elapsed = 0;
    let lastT = performance.now();
    let wasPaused = false;
    const id = window.setInterval(() => {
      if (signal?.aborted) {
        window.clearInterval(id);
        reject(new AbortError('aborted'));
        return;
      }
      const now = performance.now();
      const dt = now - lastT;
      lastT = now;
      if (_paused) {
        // Pause edge — zero the motors so the bot brakes. LPF keeps a
        // brief coast, which feels physically natural.
        if (!wasPaused && botId) setMotors(botId, 0, 0);
        wasPaused = true;
        return;
      }
      if (wasPaused) {
        // Resume edge — restore the block's motor targets.
        if (restoreMotors) restoreMotors();
      }
      wasPaused = false;
      elapsed += dt;
      // onTick can short-circuit (e.g., motor.until condition fired).
      if (onTick && onTick()) {
        window.clearInterval(id);
        resolve();
        return;
      }
      if (elapsed >= ms) {
        window.clearInterval(id);
        resolve();
      }
    }, 16);
  });
}

/** Distance the bot has travelled since `start`, computed from the live
 *  pose. Used by `drive` (target distance) and `travelled` condition. */
function distanceFromOrigin(pose: BotPose, ox: number, oz: number): number {
  const dx = pose.worldX - ox;
  const dz = pose.worldZ - oz;
  return Math.sqrt(dx * dx + dz * dz);
}

function evaluateCondition(
  c: Condition,
  ctx: { botId: string; pose: BotPose; sensor: SensorPort; startedAtMs: number; originX: number; originZ: number },
): boolean {
  switch (c.kind) {
    case 'distance.lt': return ctx.sensor.ultrasonicMeters(ctx.botId) <  lengthToMeters(c.threshold);
    case 'distance.gt': return ctx.sensor.ultrasonicMeters(ctx.botId) >  lengthToMeters(c.threshold);
    case 'travelled':   return distanceFromOrigin(ctx.pose, ctx.originX, ctx.originZ) >= lengthToMeters(c.distance);
    case 'elapsed':     return (performance.now() - ctx.startedAtMs) / 1000 >= c.seconds;
  }
}

/** Apply a side+speed pair to the bot's motor targets. `side='both'` sets
 *  both motors equally (drive straight); 'left' or 'right' sets that side
 *  to `speed` and zeros the other. */
function writeSideMotors(botId: string, side: 'left' | 'right' | 'both', mps: number): void {
  switch (side) {
    case 'both':  setMotors(botId, mps, mps); break;
    case 'left':  setMotors(botId, mps, 0);   break;
    case 'right': setMotors(botId, 0,   mps); break;
  }
}

async function execBlock(block: ProgramBlock, botId: string, opts: ExecutorOptions): Promise<void> {
  const { sensor, onEvent, abortSignal } = opts;
  const pose = getPose(botId);
  if (!pose) throw new AbortError(`bot ${botId} has no live pose`);
  onEvent?.({ kind: 'block.enter', blockId: block.id });

  try {
    switch (block.kind) {
      case 'motor.set': {
        const mps = speedToMetersPerSec(block.speed, PROGRAM_MAX_SPEED);
        const apply = () => writeSideMotors(botId, block.side, mps);
        apply();
        await delay(block.seconds * 1000, abortSignal, undefined, botId, apply);
        break;
      }
      case 'motor.until': {
        const mps = speedToMetersPerSec(block.speed, PROGRAM_MAX_SPEED);
        const apply = () => writeSideMotors(botId, block.side, mps);
        apply();
        const ctx = {
          botId, pose, sensor,
          startedAtMs: performance.now(),
          originX: pose.worldX, originZ: pose.worldZ,
        };
        // Tight poll (~one frame) so the bot stops within ~16 ms of the
        // condition firing — a kid would notice longer reaction lag.
        await delay(60_000, abortSignal, () => evaluateCondition(block.condition, ctx), botId, apply);
        setMotors(botId, 0, 0);
        break;
      }
      case 'turn': {
        // Pivot in place: opposite-direction motors. Positive degrees =
        // CCW (left turn). Time to pivot = |angleRad| / pivotRate where
        // pivotRate = 2 * mps / wheelBase.
        const mps = speedToMetersPerSec(block.speed, PROGRAM_MAX_SPEED);
        const dir = Math.sign(block.degrees) || 1;
        const apply = () => setMotors(botId, -dir * mps, dir * mps);
        apply();
        const angleRad = Math.abs(block.degrees) * Math.PI / 180;
        const pivotRate = (2 * Math.abs(mps)) / PROGRAM_WHEEL_BASE;  // rad/s
        const seconds = pivotRate > 0 ? angleRad / pivotRate : 0;
        await delay(seconds * 1000, abortSignal, undefined, botId, apply);
        setMotors(botId, 0, 0);
        break;
      }
      case 'drive': {
        const targetMeters = lengthToMeters(block.distance);
        const mps = speedToMetersPerSec(block.speed, PROGRAM_MAX_SPEED) * Math.sign(targetMeters || 1);
        const ox = pose.worldX, oz = pose.worldZ;
        const apply = () => setMotors(botId, mps, mps);
        apply();
        await delay(
          60_000, abortSignal,
          () => distanceFromOrigin(pose, ox, oz) >= Math.abs(targetMeters),
          botId, apply,
        );
        setMotors(botId, 0, 0);
        break;
      }
      case 'wait': {
        setMotors(botId, 0, 0);
        await delay(block.seconds * 1000, abortSignal, undefined, botId);
        break;
      }
      case 'if': {
        const ctx = {
          botId, pose, sensor,
          startedAtMs: performance.now(),
          originX: pose.worldX, originZ: pose.worldZ,
        };
        const branch = evaluateCondition(block.condition, ctx) ? block.then : (block.else ?? []);
        for (const child of branch) await execBlock(child, botId, opts);
        break;
      }
      case 'loop': {
        if (typeof block.times === 'number') {
          for (let i = 0; i < block.times; i++) {
            for (const child of block.body) await execBlock(child, botId, opts);
          }
        } else if (block.until) {
          const ctx = {
            botId, pose, sensor,
            startedAtMs: performance.now(),
            originX: pose.worldX, originZ: pose.worldZ,
          };
          // Run body, check condition between iterations. Cap at 10 000
          // to prevent a tutor-emitted infinite loop from hanging.
          for (let i = 0; i < 10_000; i++) {
            if (evaluateCondition(block.until, ctx)) break;
            for (const child of block.body) await execBlock(child, botId, opts);
          }
        }
        break;
      }
      case 'stop': {
        setMotors(botId, 0, 0);
        throw new AbortError('stop block');
      }
    }
  } finally {
    onEvent?.({ kind: 'block.exit', blockId: block.id });
  }
}

/** Run a program top-to-bottom against a placed bot. Resolves on natural
 *  end, on `stop` block, or on abort. Always zeroes motors on exit so
 *  the bot doesn't keep coasting under program-set targets. */
export async function runProgram(
  botId: string,
  program: Program,
  opts: ExecutorOptions,
): Promise<void> {
  if (activeProgramBots.has(botId)) {
    throw new Error(`bot ${botId} already running a program`);
  }
  activeProgramBots.add(botId);
  // Fresh pause state per run — a leftover paused flag from a previous
  // program would freeze the new run on its first wait.
  resumeProgram();
  try {
    for (const block of program.blocks) {
      await execBlock(block, botId, opts);
    }
    opts.onEvent?.({ kind: 'program.done' });
  } catch (err) {
    if (err instanceof AbortError) {
      opts.onEvent?.({ kind: 'program.aborted', reason: err.message });
    } else {
      throw err;
    }
  } finally {
    setMotors(botId, 0, 0);
    activeProgramBots.delete(botId);
  }
}

/** Stub sensor port for non-simulator contexts (or until raycasting
 *  ultrasonic is wired). Returns Infinity so distance.lt never fires
 *  spuriously. */
export const noopSensor: SensorPort = {
  ultrasonicMeters: () => Infinity,
};
