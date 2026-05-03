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

import { GRID_SIZE, gridToWorldRendered, type SceneObject } from '@/lib/scene-builder';
import { ensurePose, getPose, integrateBotPose, setMotors, stopAllMotors, type WallAABB } from './bot-drive';
import {
  ensureKinematic, getKinematic, defaultKinematic, isPushable,
  resolveBotPushable, resolveBotBot, resolveCircleVsAABBs, kinematicMovedFrom,
  integrateKinematic,
} from './physics';

type BotControllerProps = {
  sceneObjects: SceneObject[];
  onUpdateObjects: (next: SceneObject[]) => void;
  /** Bot the user just clicked in the scene — when set, the controller
   *  switches to driving that bot and auto-expands if collapsed. */
  selectedBotId?: string | null;
};

/** Top forward speed (m/s) — both motors run at this when fwd held. */
const MAX_FORWARD_SPEED = 1.30;
/** Differential-turn motor delta (m/s). Pivot ω = 2 × MAX_TURN_SPEED /
 *  wheelBase, so 0.30 m/s + 0.20 m wheelbase gives ≈ 3 rad/s ≈ 0.5 rev/s
 *  ≈ 170 deg/s — a controllable in-place spin. */
const MAX_TURN_SPEED = 0.30;
/** Distance between wheels (m) — used for ω = (R−L)/wheelBase integration. */
const WHEEL_BASE = 0.20;
/** Wheel radius (m) — used for visual wheel-rotation rate. */
const WHEEL_RADIUS = 0.052;
/** Bot bounding circle radii (m) used for wall collision. Approximate the
 *  chassis footprint; sumo's wedge plow extends a little further. */
const BOT_RADIUS_STANDARD = 0.13;
const BOT_RADIUS_SUMO     = 0.17;
/** Wall geometry constants — kept in sync with WALL_THICKNESS_FRAC and the
 *  wall mesh in scene-objects.tsx. */
const WALL_THICKNESS = GRID_SIZE * 0.18;
const WALL_LENGTH    = GRID_SIZE;
/** Ramp footprint — TWO cells long along its forward axis (gentle ~18°
 *  slope so a bot can ascend), ~85% of a cell wide on the perpendicular.
 *  Matches RAMP_LENGTH/WIDTH in scene-objects.tsx. Ramps are NOT in the
 *  wall AABB list — bots drive over them, with worldY tracking the
 *  slope position. */
const RAMP_LENGTH = GRID_SIZE * 2;
const RAMP_WIDTH  = GRID_SIZE * 0.85;
const RAMP_HEIGHT = 0.16;
/** Toy gravity (m/s²). Not real 9.8; tuned so the fall-off-platform
 *  drop reads as a deliberate dismount rather than a teleport. */
const GRAVITY = 4.0;
/** Constant drift back down the slope when the bot is on a ramp.
 *  Adds to position each frame regardless of motor — a stationary
 *  bot will gradually roll back; an actively-driving-uphill bot
 *  still climbs because motor speed (1.3 m/s) >> drift (0.30 m/s). */
const RAMP_DRIFT = 0.30;

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
  // Runs continuously. Motor commands and pose live in the bot-drive store;
  // the bot meshes consume pose every useFrame so motion stays smooth at
  // monitor refresh rate. We only push pose back to React state ONCE per
  // drive — when the user releases the buttons — to avoid the re-render
  // storm that periodic commits caused (every 220 ms of driving was
  // recreating the whole sceneObjects array, which manifested as a hitch
  // about 5x/sec).
  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();
    let driving = false;       // were we driving on the last tick?

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000); // clamp big tabs/blurs to 50 ms
      lastT = now;

      const list = objectsRef.current;
      // Per-frame wall AABB cache. Cheap (no React state) and walls don't
      // move during a session, so a recompute every frame is fine while
      // we're driving. Could memoise on sceneObjects ref equality if it
      // ever shows up in profiles.
      const walls: WallAABB[] = [];
      for (const o of list) {
        if (o.type !== 'wall') continue;
        const { x: wx, z: wz } = gridToWorldRendered(o);
        const isXAxis = ((o.rotY ?? 0) % 2) === 0;
        const halfLen = WALL_LENGTH / 2;
        const halfThk = WALL_THICKNESS / 2;
        if (isXAxis) {
          walls.push({ minX: wx - halfLen, maxX: wx + halfLen, minZ: wz - halfThk, maxZ: wz + halfThk });
        } else {
          walls.push({ minX: wx - halfThk, maxX: wx + halfThk, minZ: wz - halfLen, maxZ: wz + halfLen });
        }
      }

      // ─── Free-motion integration for passive props ───────────────
      // Runs every frame regardless of active bot so a ball kicked
      // before the user releases their finger keeps rolling until
      // friction stops it. Bounces off walls via velocity reflection
      // inside resolveCircleVsAABBs.
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (!isPushable(o)) continue;
        const k = getKinematic(o.id) ?? ensureKinematic(o.id, () => {
          const d = defaultKinematic(o.type);
          const { x: wx, z: wz } = gridToWorldRendered(o);
          return {
            worldX: wx, worldZ: wz, vx: 0, vz: 0,
            radius: d.radius, pushFactor: d.pushFactor, damping: d.damping,
            restitution: d.restitution,
          };
        });
        integrateKinematic(k, dt);
        resolveCircleVsAABBs(k, walls);
      }

      const id = activeIdRef.current;
      if (id) {
        const held = heldRef.current;
        const fwd = (held.forward ? 1 : 0) - (held.back ? 1 : 0);
        const turn = (held.right ? 1 : 0) - (held.left ? 1 : 0);
        // Differential drive — forward sets both motors to ±MAX_FORWARD_SPEED;
        // turn adds a smaller asymmetric delta. With separate forward/turn
        // speeds the pivot rate is much more controllable than (fwd ± turn) ×
        // MAX where pivot used full motor speed and felt like a tornado.
        const left  = fwd * MAX_FORWARD_SPEED - turn * MAX_TURN_SPEED;
        const right = fwd * MAX_FORWARD_SPEED + turn * MAX_TURN_SPEED;
        setMotors(id, left, right);

        const isDriving = fwd !== 0 || turn !== 0;
        if (isDriving) driving = true;

        const pose = getPose(id);
        if (pose) {
          const target = list.find((o) => o.id === id);
          const radius = target?.botVariant === 'sumo' ? BOT_RADIUS_SUMO : BOT_RADIUS_STANDARD;
          integrateBotPose(pose, dt, WHEEL_BASE, WHEEL_RADIUS, walls, radius);

          // ─── Push other objects out of the way ────────────────────
          // Active bot's instantaneous velocity, used as the impulse
          // source for object pushes and for spinning shoved bots' wheels.
          const vBot = (pose.motorLeft + pose.motorRight) * 0.5;
          const botVelX = vBot * Math.cos(pose.heading);
          const botVelZ = vBot * (-Math.sin(pose.heading));

          for (let i = 0; i < list.length; i++) {
            const o = list[i];
            if (o.id === id) continue;
            if (o.type === 'bot') {
              const otherPose = getPose(o.id);
              if (!otherPose) continue;
              const otherRadius = o.botVariant === 'sumo' ? BOT_RADIUS_SUMO : BOT_RADIUS_STANDARD;
              const res = resolveBotBot(pose, radius, otherPose, otherRadius);
              if (res) {
                // Spin the SHOVED bot's wheels by the forward-projected
                // displacement so it doesn't slide statically. Lateral
                // shove (skidding) doesn't roll real wheels — and doesn't
                // here either. Apply equally to both wheels (no diff).
                const fX = Math.cos(otherPose.heading);
                const fZ = -Math.sin(otherPose.heading);
                const fwdDisp = res.bDx * fX + res.bDz * fZ;
                const wheelDelta = fwdDisp / WHEEL_RADIUS;
                otherPose.leftWheelRot  += wheelDelta;
                otherPose.rightWheelRot += wheelDelta;
                // Active bot brakes on impact.
                pose.motorLeft  *= 0.7;
                pose.motorRight *= 0.7;
              }
              continue;
            }
            if (!isPushable(o)) continue;
            const k = getKinematic(o.id);
            if (!k) continue;
            // Capture the bot's pre-resolution position so we can constrain
            // its displacement to the forward axis afterwards. A real
            // wheeled bot can't slide laterally — its tires resist sideways
            // motion. Without this, an oblique contact deflects the bot
            // off the ball; with it, the bot plows straight through and
            // the ball deflects to the side.
            const preBotX = pose.worldX;
            const preBotZ = pose.worldZ;
            if (resolveBotPushable(pose, radius, botVelX, botVelZ, k)) {
              const fwdX =  Math.cos(pose.heading);
              const fwdZ = -Math.sin(pose.heading);
              const dispX = pose.worldX - preBotX;
              const dispZ = pose.worldZ - preBotZ;
              const fwdComp = dispX * fwdX + dispZ * fwdZ;
              // Restore bot to its forward-axis-only displacement.
              pose.worldX = preBotX + fwdComp * fwdX;
              pose.worldZ = preBotZ + fwdComp * fwdZ;
              // Transfer the discarded lateral component to the ball
              // (object eats what the bot couldn't slide into) so total
              // separation is preserved and the ball deflects realistically.
              k.worldX += dispX - fwdComp * fwdX;
              k.worldZ += dispZ - fwdComp * fwdZ;
              resolveCircleVsAABBs(k, walls);
              pose.motorLeft  *= 0.92;
              pose.motorRight *= 0.92;
            }
          }

          // ─── Ramp Y + downhill drift ──────────────────────────────
          // Find the highest ramp the bot is over and pin worldY to that
          // ramp's slope-interpolated height. Ramps not under the bot
          // → targetY = 0 (ground). Then apply gravity if bot is above
          // its target Y (just walked off a platform), and a constant
          // drift toward the low end if standing on a slope.
          let targetY = 0;
          let onRampDirX = 0;
          let onRampDirZ = 0;
          let onRamp = false;
          for (const o of list) {
            if (o.type !== 'ramp') continue;
            const { x: rx, z: rz } = gridToWorldRendered(o);
            const rampHeading = (o.rotY ?? 0) * (Math.PI / 2);
            const cosR = Math.cos(rampHeading);
            const sinR = Math.sin(rampHeading);
            const dxr = pose.worldX - rx;
            const dzr = pose.worldZ - rz;
            // World → ramp-local rotation by -rampHeading.
            const localX = dxr * cosR - dzr * sinR;
            const localZ = dxr * sinR + dzr * cosR;
            if (Math.abs(localX) < RAMP_LENGTH / 2 && Math.abs(localZ) < RAMP_WIDTH / 2) {
              const yOnRamp = ((localX + RAMP_LENGTH / 2) / RAMP_LENGTH) * RAMP_HEIGHT;
              if (yOnRamp > targetY) {
                targetY = yOnRamp;
                // Down-slope direction in world = local (-1, 0) rotated
                // by rampHeading: (-cos θ, sin θ).
                onRampDirX = -cosR;
                onRampDirZ =  sinR;
                onRamp = true;
              }
            }
          }
          // Y tracking — instant snap up while ascending the ramp,
          // gravity-controlled fall when descending past target.
          if (pose.worldY > targetY) {
            pose.worldY = Math.max(targetY, pose.worldY - GRAVITY * dt);
          } else {
            pose.worldY = targetY;
          }
          // Constant downhill drift while on a ramp — the bot "slips"
          // backward when motors are weak. Bot's forward speed (~1.3 m/s)
          // easily overcomes this 0.30 m/s drift, so an actively-driving
          // bot still climbs cleanly.
          if (onRamp) {
            pose.worldX += onRampDirX * RAMP_DRIFT * dt;
            pose.worldZ += onRampDirZ * RAMP_DRIFT * dt;
          }

          // Commit ONLY on motor release. While driving, pose lives in the
          // module store and the meshes read it every frame; React state
          // stays still so the parent doesn't re-render the scene tree
          // mid-drive. On release, batch the bot's new pose AND every
          // pushable that got displaced into a single onUpdate.
          if (driving && !isDriving) {
            const updates: Array<{ id: string; gx: number; gz: number; headingRad?: number }> = [];
            if (target) {
              const ngx = pose.worldX / GRID_SIZE;
              const ngz = pose.worldZ / GRID_SIZE;
              if (target.gx !== ngx || target.gz !== ngz || target.headingRad !== pose.heading) {
                updates.push({ id, gx: ngx, gz: ngz, headingRad: pose.heading });
              }
            }
            for (const o of list) {
              if (o.id === id) continue;
              if (o.type === 'bot') {
                const op = getPose(o.id);
                if (!op) continue;
                const ngx = op.worldX / GRID_SIZE;
                const ngz = op.worldZ / GRID_SIZE;
                if (o.gx !== ngx || o.gz !== ngz) {
                  updates.push({ id: o.id, gx: ngx, gz: ngz });
                }
              } else if (isPushable(o)) {
                const k = getKinematic(o.id);
                if (!k) continue;
                const { x: ox, z: oz } = gridToWorldRendered(o);
                if (kinematicMovedFrom(o.id, ox, oz)) {
                  updates.push({ id: o.id, gx: k.worldX / GRID_SIZE, gz: k.worldZ / GRID_SIZE });
                }
              }
            }
            if (updates.length > 0) {
              const byId = new Map(updates.map((u) => [u.id, u]));
              onUpdateRef.current(
                list.map((o) => {
                  const u = byId.get(o.id);
                  return u ? { ...o, gx: u.gx, gz: u.gz, ...(u.headingRad !== undefined ? { headingRad: u.headingRad } : {}) } : o;
                }),
              );
            }
            driving = false;
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
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
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
