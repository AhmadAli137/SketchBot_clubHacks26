'use client';

/**
 * BotController — floating drive-pad for placed bots, with proper differential
 * drive physics. Each direction button writes left/right motor speeds (m/s)
 * to the bot's live pose; a rAF loop integrates pose at frame rate and the
 * bot meshes consume pose every useFrame to update position + heading +
 * wheel rotation.
 *
 * Pose lives in bot-drive.ts (module-level Map) so the loop and the meshes
 * stay decoupled from React reconciliation. Periodic + on-release commits
 * write pose back to the SceneObject (gx / gz / headingRad) so motion
 * persists through saves and re-renders.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Square, Gamepad2 } from 'lucide-react';

import { GRID_SIZE, type SceneObject } from '@/lib/scene-builder';
import { ensurePose, getPose, integrateBotPose, setMotors, stopAllMotors } from './bot-drive';

type BotControllerProps = {
  sceneObjects: SceneObject[];
  onUpdateObjects: (next: SceneObject[]) => void;
  /** Bot the user just clicked in the scene — when set, the controller
   *  switches to driving that bot and auto-expands if collapsed. */
  selectedBotId?: string | null;
};

/** Linear speed of one motor at full throttle (m/s). */
const MAX_MOTOR_SPEED = 0.45;
/** Distance between wheels (m) — used for ω = (R−L)/wheelBase integration. */
const WHEEL_BASE = 0.20;
/** Wheel radius (m) — used for visual wheel-rotation rate. */
const WHEEL_RADIUS = 0.052;
/** Throttle the React-side commit so we don't blow up sceneObjects updates
 *  at 60 Hz. The mesh reads pose every frame, so this is purely about
 *  persistence — the visible bot stays smooth between commits. */
const COMMIT_INTERVAL_MS = 220;

function botLabel(o: SceneObject, idx: number): string {
  const base = o.botVariant === 'sumo' ? 'Sumo Bot' : 'Spark Mini';
  return `${base} #${idx + 1}`;
}

export function BotController({ sceneObjects, onUpdateObjects, selectedBotId }: BotControllerProps) {
  const bots = useMemo(
    () => sceneObjects.filter((o) => o.type === 'bot'),
    [sceneObjects],
  );

  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // Which buttons are currently pressed — drives the integration step.
  const heldRef = useRef<{ forward: boolean; back: boolean; left: boolean; right: boolean }>({
    forward: false, back: false, left: false, right: false,
  });

  useEffect(() => {
    if (bots.length === 0) {
      if (activeBotId !== null) setActiveBotId(null);
      return;
    }
    if (!activeBotId || !bots.find((b) => b.id === activeBotId)) {
      setActiveBotId(bots[0].id);
    }
  }, [bots, activeBotId]);

  // Click-to-control: when the parent reports the user just selected a
  // bot in the scene, route the controller to that bot and force-expand.
  useEffect(() => {
    if (!selectedBotId) return;
    if (!bots.find((b) => b.id === selectedBotId)) return;
    setActiveBotId(selectedBotId);
    setCollapsed(false);
  }, [selectedBotId, bots]);

  // Live ref so the rAF loop reads the latest scene without re-binding.
  const objectsRef = useRef(sceneObjects);
  useEffect(() => { objectsRef.current = sceneObjects; }, [sceneObjects]);
  const onUpdateRef = useRef(onUpdateObjects);
  useEffect(() => { onUpdateRef.current = onUpdateObjects; }, [onUpdateObjects]);
  const activeIdRef = useRef<string | null>(activeBotId);
  useEffect(() => { activeIdRef.current = activeBotId; }, [activeBotId]);

  // ─── rAF physics loop ──────────────────────────────────────────────
  // Runs continuously — cheap when idle (no held buttons → motors zero,
  // pose doesn't drift, no commits). When inputs are held it sets motors
  // on the active bot's pose, integrates its pose by dt, and commits the
  // pose back to the SceneObject every COMMIT_INTERVAL_MS so saves stay
  // in sync without re-rendering at frame rate.
  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();
    let lastCommitT = lastT;
    let driving = false;       // were we driving on the last tick?

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000); // clamp big tabs/blurs to 50 ms
      lastT = now;

      const id = activeIdRef.current;
      if (id) {
        const held = heldRef.current;
        const fwd = (held.forward ? 1 : 0) - (held.back ? 1 : 0);
        const turn = (held.right ? 1 : 0) - (held.left ? 1 : 0);
        // Differential drive: forward both, turn flips one motor.
        // Pivot turn (no forward) = motors equal & opposite.
        const left  = (fwd - turn) * MAX_MOTOR_SPEED;
        const right = (fwd + turn) * MAX_MOTOR_SPEED;
        setMotors(id, left, right);

        const isDriving = fwd !== 0 || turn !== 0;
        if (isDriving) driving = true;

        const pose = getPose(id);
        if (pose) {
          integrateBotPose(pose, dt, WHEEL_BASE, WHEEL_RADIUS);

          // Periodic commit while driving so saves and React-side state
          // catch up — and one final commit on release.
          const commitDue = isDriving && (now - lastCommitT) > COMMIT_INTERVAL_MS;
          if (commitDue || (driving && !isDriving)) {
            const list = objectsRef.current;
            const target = list.find((o) => o.id === id);
            if (target) {
              const ngx = pose.worldX / GRID_SIZE;
              const ngz = pose.worldZ / GRID_SIZE;
              if (target.gx !== ngx || target.gz !== ngz || target.headingRad !== pose.heading) {
                onUpdateRef.current(
                  list.map((o) =>
                    o.id === id
                      ? { ...o, gx: ngx, gz: ngz, headingRad: pose.heading }
                      : o,
                  ),
                );
              }
            }
            lastCommitT = now;
            if (!isDriving) driving = false;
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      stopAllMotors();
    };
  }, []);

  // Hard stop: zero motors + clear all held flags.
  const handleStop = () => {
    heldRef.current = { forward: false, back: false, left: false, right: false };
    stopAllMotors();
  };

  if (bots.length === 0) return null;

  // Press-and-hold helpers — set the held flag on pointerdown, clear on
  // pointerup / pointerleave / pointercancel. This keeps fingers-on-button
  // = motor-on, fingers-off = motor-off, with no edge cases for "stuck on
  // because pointerup happened off-button".
  const padBtnProps = (action: 'forward' | 'back' | 'left' | 'right') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      heldRef.current[action] = true;
    },
    onPointerUp: (e: React.PointerEvent) => {
      heldRef.current[action] = false;
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    },
    onPointerLeave: () => { heldRef.current[action] = false; },
    onPointerCancel: () => { heldRef.current[action] = false; },
  });

  return (
    <motion.div
      className="bot-controller"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <button
        type="button"
        className="bot-controller-header"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expand bot controller' : 'Collapse bot controller'}
      >
        <Gamepad2 size={14} />
        <span className="bot-controller-title">Bot Controller</span>
        <span className="bot-controller-collapse">{collapsed ? '▴' : '▾'}</span>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            className="bot-controller-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {bots.length > 1 && (
              <select
                className="bot-controller-select"
                value={activeBotId ?? ''}
                onChange={(e) => setActiveBotId(e.target.value)}
              >
                {bots.map((b, i) => (
                  <option key={b.id} value={b.id}>{botLabel(b, i)}</option>
                ))}
              </select>
            )}

            <div className="bot-controller-pad">
              <button type="button" className="bot-controller-btn bot-controller-btn--up"    title="Drive forward (hold)" {...padBtnProps('forward')}><ChevronUp size={18} /></button>
              <button type="button" className="bot-controller-btn bot-controller-btn--left"  title="Turn left (hold)"     {...padBtnProps('left')}><ChevronLeft size={18} /></button>
              <button type="button" className="bot-controller-btn bot-controller-btn--stop"  title="Stop"                 onClick={handleStop}><Square size={12} /></button>
              <button type="button" className="bot-controller-btn bot-controller-btn--right" title="Turn right (hold)"    {...padBtnProps('right')}><ChevronRight size={18} /></button>
              <button type="button" className="bot-controller-btn bot-controller-btn--down"  title="Drive back (hold)"    {...padBtnProps('back')}><ChevronDown size={18} /></button>
            </div>

            <div className="bot-controller-hint">
              Hold to drive · Combine for arcs
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
