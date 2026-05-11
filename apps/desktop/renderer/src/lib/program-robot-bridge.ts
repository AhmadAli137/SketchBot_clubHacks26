/**
 * Bridge that mirrors simulator motor writes to the physical ESP32-C5 robot.
 *
 * The program executor (program-executor.ts) calls setMotors(botId, left, right)
 * to drive the simulated chassis. setMotors fires registered motor hooks; this
 * module registers one of those hooks and, when "Run on robot" is enabled and
 * a program is actively running for that bot, forwards the same setpoint to
 * the local-runtime's POST /api/robot/motor endpoint, which relays it over
 * the existing WebSocket to the firmware's `motor.set` command handler.
 *
 * Why a separate hook instead of editing the executor: the executor runs the
 * AST against an abstract "motor sink", and that sink has always been the
 * simulator. Adding a hardware sink alongside the simulator one means the
 * AST stays pure and both targets receive the SAME stream of setpoints — the
 * simulator can keep running locally for the kid's preview while the real
 * bot drives the real wheels.
 *
 * Throttling: setMotors fires every block transition AND inside `motor.until`
 * polling loops (one frame, ~16ms). We dedupe identical consecutive
 * setpoints (don't resend if (left, right) is unchanged) and cap outbound
 * rate at 30 Hz. Stops are always sent — a duplicate {0, 0} is the cheapest
 * way to guarantee the robot actually halts at end of block, even if the
 * preceding motor write was lost.
 */

import { isProgramActive } from './program-executor';
import { registerMotorHook } from '@/components/sim-playground/bot-drive';

let _enabled = false;
let _apiBase = 'http://127.0.0.1:8787';
const enabledListeners = new Set<(on: boolean) => void>();

export function isRobotMode(): boolean { return _enabled; }
export function setRobotMode(on: boolean): void {
  if (_enabled === on) return;
  _enabled = on;
  enabledListeners.forEach((fn) => fn(on));
  // Force a final stop on every bot when leaving robot mode so the
  // chassis doesn't keep running the last commanded setpoint after the
  // kid flips the switch off mid-program.
  if (!on) {
    void postMotor(0, 0);  // best-effort, no bot ID needed for stop
  }
}
export function onRobotModeChange(fn: (on: boolean) => void): () => void {
  enabledListeners.add(fn);
  return () => enabledListeners.delete(fn);
}

/** Wired by the renderer at startup once the runtime port is known. */
export function setBridgeApiBase(apiBase: string): void {
  _apiBase = apiBase;
}

let _lastSentLeft  = NaN;
let _lastSentRight = NaN;
let _lastSentAt    = 0;
const MIN_INTERVAL_MS = 33;        // ≈ 30 Hz cap — same-value rate limit

async function postMotor(left: number, right: number): Promise<void> {
  try {
    await fetch(`${_apiBase}/api/robot/motor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ left_mps: left, right_mps: right }),
      keepalive: true,
    });
  } catch {
    // Network error means the local-runtime isn't reachable. Silently
    // drop the setpoint — the simulator still updated, so the kid can
    // see what their program WOULD do; the bot just won't react.
  }
}

// Register the hook once at module load. registerMotorHook returns an
// unsubscribe but we never tear down — this module is a singleton for
// the lifetime of the renderer process.
registerMotorHook((botId, left, right) => {
  if (!_enabled) return;
  if (!isProgramActive(botId)) return;        // ignore manual teleop

  const isStop = left === 0 && right === 0;
  const same   = left === _lastSentLeft && right === _lastSentRight;
  const now    = performance.now();
  const tooSoon = now - _lastSentAt < MIN_INTERVAL_MS;

  // Send rules:
  //   - Stops: always send (cheap insurance the bot actually halts).
  //   - Different setpoint than last sent: ALWAYS send, even if within
  //     33 ms of the last send. The executor only calls setMotors once
  //     per block (at apply()) — if a Turn block arrives 1 ms after the
  //     preceding hardStop's (0,0), throttling it would mean the first
  //     turn command never reaches the bot and the wheels never get
  //     told to pivot. Drive→Turn would look like drive-only on real
  //     hardware. (See bug discussion 2026-05-11.)
  //   - Same setpoint as last sent: throttle to 30 Hz. This protects
  //     against any future tight-loop callers that might fire
  //     setMotors at frame rate with an unchanging value.
  if (!isStop && same && tooSoon) return;

  _lastSentLeft  = left;
  _lastSentRight = right;
  _lastSentAt    = now;
  void postMotor(left, right);
});
