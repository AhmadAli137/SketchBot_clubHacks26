/**
 * Program narrator — bridges runtime telemetry + program-executor block
 * events into the existing Spark observe loop, so when a kid runs a
 * program on the real ESP32-C5 robot Spark sees what's happening and can
 * narrate it.
 *
 * Architecture (Phase 2a):
 *   firmware  ── WebSocket telemetry ──▶ local-runtime
 *                                          │
 *                            /ws/state push every ~1s
 *                                          ▼
 *   page.tsx state subscriber ──▶ setRobotSnapshot() (this module)
 *
 *   program-executor ── tutor.program.event ──▶ this module
 *
 *   this module re-emits robot.program.start / .block / .done on the
 *   spark-events bus while robot mode is on. useSparkTick listens for
 *   those, hits /api/tutor/observe with a refreshed context_text, and
 *   the existing tutor-panel pipeline streams Spark's response + speaks
 *   it via TTS.
 *
 * No new orchestrator, no new endpoint, no Anthropic-key plumbing — every
 * piece already exists. This file just makes the robot's life events
 * visible to Spark by adding a snapshot getter and a tiny event-relay.
 */

import { isRobotMode } from '@/lib/program-robot-bridge';
import { onSparkEvent, emitSparkEvent } from '@/lib/spark-events';

// ─── Robot snapshot storage ──────────────────────────────────────────────────
// page.tsx subscribes to /ws/state and pushes the latest pose / status here
// every snapshot. Anything that wants to render robot info in a tutor prompt
// reads via getRobotSnapshot() — no React state plumbing required.

export type RobotSnapshot = {
  connected: boolean;
  status: string;
  poseMm: { x: number; z: number; headingDeg: number };
  penDown: boolean;
  moving: boolean;
  homed: boolean;
};

let snapshot: RobotSnapshot = {
  connected: false,
  status: 'disconnected',
  poseMm: { x: 0, z: 0, headingDeg: 0 },
  penDown: false,
  moving: false,
  homed: false,
};

export function setRobotSnapshot(next: Partial<RobotSnapshot>): void {
  // Shallow merge — page.tsx may push partial updates as the runtime's
  // WebSocket frames arrive. The caller is responsible for keeping
  // poseMm intact (state-manager always sends the full pose).
  snapshot = { ...snapshot, ...next, poseMm: { ...snapshot.poseMm, ...(next.poseMm ?? {}) } };
}

export function getRobotSnapshot(): RobotSnapshot {
  return snapshot;
}

// ─── Active block tracking ───────────────────────────────────────────────────
// program-executor emits tutor.program.event on each block.enter / block.exit
// (already wired). We mirror the active block id here so the context-text
// builder can describe what the bot is currently doing without having to
// thread its own subscription through every consumer.

let activeBlockId: string | null = null;
export function getActiveBlockId(): string | null { return activeBlockId; }

// ─── Event-relay subscription ────────────────────────────────────────────────
// Re-emit program-executor events as robot.program.* on the spark-events bus
// when, and only when, the kid is actually running a program on the real
// chassis (robot mode on). This is what causes useSparkTick to fire an
// immediate /api/tutor/observe — Spark gets a fresh look the moment the
// robot's situation changes.

let subscribed = false;
export function ensureNarratorSubscribed(): void {
  if (subscribed) return;
  subscribed = true;

  onSparkEvent((detail) => {
    if (detail.kind !== 'tutor.program.event') return;
    const ev = detail.payload as Record<string, unknown> | undefined;
    if (!ev) return;

    if (ev.kind === 'block.enter' && typeof ev.blockId === 'string') {
      activeBlockId = ev.blockId;
      if (isRobotMode()) emitSparkEvent('robot.program.block');
    } else if (ev.kind === 'block.exit' && typeof ev.blockId === 'string') {
      if (activeBlockId === ev.blockId) activeBlockId = null;
    } else if (ev.kind === 'program.done') {
      activeBlockId = null;
      if (isRobotMode()) emitSparkEvent('robot.program.done');
    } else if (ev.kind === 'program.aborted') {
      activeBlockId = null;
      if (isRobotMode()) emitSparkEvent('robot.program.done');
    }
  });
}

// ─── Context-text snippet ────────────────────────────────────────────────────
// Compact natural-language summary of what's currently happening on the real
// robot. Inlined into the tutor's situational-awareness preamble by
// spark-context.ts → describeContextAsText. Returns null when the kid isn't
// running on the real bot — keeps the prompt clean for sandbox-only sessions.

export function getRobotContextSnippet(): string | null {
  if (!isRobotMode()) return null;

  const s = snapshot;
  const lines: string[] = [];
  lines.push('Spark Mini (the real robot) is wired up:');
  lines.push(
    `  - link: ${s.connected ? 'connected' : 'disconnected'}` +
    (s.status ? ` (${s.status})` : ''),
  );
  if (s.connected) {
    lines.push(
      `  - pose: x=${Math.round(s.poseMm.x)}mm, z=${Math.round(s.poseMm.z)}mm, ` +
      `heading=${Math.round(s.poseMm.headingDeg)}°`,
    );
    lines.push(`  - pen: ${s.penDown ? 'down' : 'up'}; motion: ${s.moving ? 'driving' : 'idle'}`);
  }
  if (activeBlockId) {
    lines.push(`  - currently running program block: ${activeBlockId}`);
  } else {
    lines.push('  - no program block is running right now');
  }
  return lines.join('\n');
}
