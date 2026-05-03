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
import { isProgramActive } from '@/lib/program-executor';
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
const RAMP_WIDTH  = GRID_SIZE * 1.275;
const RAMP_HEIGHT = 0.16;
/** Earth gravity (m/s²) — drives both the vertical free-fall when the
 *  chassis is in the air and the slope-projected slip that builds up
 *  while the bot sits on a tilted surface. */
const GRAVITY = 9.81;

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
  // Mirror of heldRef for visual feedback only (button glow). Kept separate
  // so the rAF loop reads heldRef synchronously without waiting on React.
  const [pressed, setPressed] = useState({ forward: false, back: false, left: false, right: false });
  const setHeld = (action: 'forward' | 'back' | 'left' | 'right', value: boolean) => {
    if (heldRef.current[action] === value) return;
    heldRef.current[action] = value;
    setPressed((p) => ({ ...p, [action]: value }));
  };

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
        // Yield motor control to a running program — the executor writes
        // its own setMotors targets and would be stomped each frame if we
        // kept pushing held-key values on top.
        const programDriving = isProgramActive(id);
        const held = heldRef.current;
        const fwd = (held.forward ? 1 : 0) - (held.back ? 1 : 0);
        const turn = (held.right ? 1 : 0) - (held.left ? 1 : 0);
        const left  = fwd * MAX_FORWARD_SPEED - turn * MAX_TURN_SPEED;
        const right = fwd * MAX_FORWARD_SPEED + turn * MAX_TURN_SPEED;
        if (!programDriving) setMotors(id, left, right);

        const isDriving = programDriving || fwd !== 0 || turn !== 0;
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

          // Vertical-extent helper: 2D collision only fires when the bot
          // and the other thing actually overlap in Y. Without this an
          // elevated bot (driving up a ramp at worldY ≈ 0.16) still pushes
          // ground-level balls and cones — the bot's collider is a column
          // at infinite height — leaving the ball stuck embedded in the
          // chassis as the bot climbs away.
          const BOT_HEIGHT = 0.10;
          const botBottomY = pose.worldY;
          const botTopY    = pose.worldY + BOT_HEIGHT;

          for (let i = 0; i < list.length; i++) {
            const o = list[i];
            if (o.id === id) continue;
            if (o.type === 'bot') {
              const otherPose = getPose(o.id);
              if (!otherPose) continue;
              const otherRadius = o.botVariant === 'sumo' ? BOT_RADIUS_SUMO : BOT_RADIUS_STANDARD;
              // Y-overlap gate — bots on different levels (one on ramp,
              // one on floor) shouldn't collide.
              const otherBottomY = otherPose.worldY;
              const otherTopY    = otherPose.worldY + BOT_HEIGHT;
              if (botTopY < otherBottomY || otherTopY < botBottomY) continue;
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
            // Y-overlap gate against ground-resting pushables. Object's
            // vertical extent is [0, 2 × radius] (bounding circle as a
            // sphere sitting on the floor — close enough for cones and
            // blocks too). Bot fully above means no contact.
            const objTopY = 2 * k.radius;
            if (botBottomY > objTopY) continue;
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

          // ─── Per-wheel ground sampling ────────────────────────────
          // Sample ground (max ramp Y) at each of the four wheel-corner
          // points instead of the single chassis center. This lets the
          // chassis tilt naturally when one wheel is off the support
          // surface — half on a ramp, half on the floor produces a real
          // roll-and-slide instead of the whole bot levitating.
          //
          // Local frame: +X forward, +Z left (matches wheel-z convention
          // in scene-objects.tsx). Wheel positions form a roughly square
          // footprint of ±halfWB × ±halfTrack around the chassis center.
          const HALF_WB    = 0.10;
          const HALF_TRACK = 0.10;
          const cosH = Math.cos(pose.heading);
          const sinH = Math.sin(pose.heading);
          // Local +X (forward) → world (cosH, -sinH); local +Z (left) →
          // world (sinH, cosH). Build 4 wheel sample positions.
          const wheelLocal: Array<[number, number]> = [
            [ HALF_WB,  HALF_TRACK], // FL
            [ HALF_WB, -HALF_TRACK], // FR
            [-HALF_WB,  HALF_TRACK], // RL
            [-HALF_WB, -HALF_TRACK], // RR
          ];
          // Wheel-as-circle ground sampling: on a smooth slope the wheel
          // bottom rests at slope_height (point contact under the center).
          // Past the high apex, the wheel center traces a quarter-circle
          // around the corner — its bottom drops smoothly from apex height
          // to apex − wheelR over a horizontal travel of wheelR. Without
          // this the center sample drops to 0 the instant it crosses the
          // apex, sinking the tire into the visible peak edge.
          const wheelGroundY = [0, 0, 0, 0];
          const RR = WHEEL_RADIUS * WHEEL_RADIUS;
          for (let wi = 0; wi < 4; wi++) {
            const [lx, lz] = wheelLocal[wi];
            const wx = pose.worldX + lx * cosH + lz * sinH;
            const wz = pose.worldZ - lx * sinH + lz * cosH;
            let h = 0;
            for (const o of list) {
              if (o.type !== 'ramp') continue;
              const { x: rx, z: rz } = gridToWorldRendered(o);
              const rampHeading = (o.rotY ?? 0) * (Math.PI / 2);
              const cosR = Math.cos(rampHeading);
              const sinR = Math.sin(rampHeading);
              const dxr = wx - rx;
              const dzr = wz - rz;
              const localX = dxr * cosR - dzr * sinR;
              const localZ = dxr * sinR + dzr * cosR;
              if (Math.abs(localZ) >= RAMP_WIDTH / 2) continue;
              let y = -Infinity;
              if (localX >= -RAMP_LENGTH / 2 && localX <= RAMP_LENGTH / 2) {
                // Wheel center is over the slope footprint — point contact
                // under the wheel center.
                y = ((localX + RAMP_LENGTH / 2) / RAMP_LENGTH) * RAMP_HEIGHT;
              } else if (localX > RAMP_LENGTH / 2 && localX <= RAMP_LENGTH / 2 + WHEEL_RADIUS) {
                // Wheel center is past the high apex but the tire is
                // still rolling around the corner. Wheel center sits at
                // distance wheelR from the apex point, so its bottom is
                // apex_y + sqrt(wheelR² − d²) − wheelR.
                const d = localX - RAMP_LENGTH / 2;
                y = RAMP_HEIGHT + Math.sqrt(RR - d * d) - WHEEL_RADIUS;
              }
              if (y > h) h = y;
            }
            wheelGroundY[wi] = h;
          }
          const flY = wheelGroundY[0];
          const frY = wheelGroundY[1];
          const rlY = wheelGroundY[2];
          const rrY = wheelGroundY[3];
          const frontAvg = (flY + frY) * 0.5;
          const rearAvg  = (rlY + rrY) * 0.5;
          const leftAvg  = (flY + rlY) * 0.5;
          const rightAvg = (frY + rrY) * 0.5;

          // Pitch + roll target from wheel-height differentials.
          // Pitch: front high, rear low → atan2 positive → nose-up
          // (rotation around local +Z lifts +X).
          // Roll : right low, left high → roll target negative →
          // rotation around local +X tips top-toward-right (because
          // local +Z = LEFT side; positive rotation around +X rotates
          // +Y toward +Z=left, i.e., chassis leans LEFT).
          const targetPitch = Math.atan2(frontAvg - rearAvg, 2 * HALF_WB);
          const targetRoll  = Math.atan2(rightAvg - leftAvg, 2 * HALF_TRACK);
          const TILT_TAU = 0.10;
          const kT = 1 - Math.exp(-dt / TILT_TAU);
          pose.pitch += (targetPitch - pose.pitch) * kT;
          pose.roll  += (targetRoll  - pose.roll ) * kT;

          // Chassis Y — derive from the per-wheel ground requirement using
          // the smoothed pose pitch/roll, then take the MAX so the highest-
          // pressed wheel pins the chassis. A flat average lets steeper
          // pitch sink the rear wheel into the ramp surface (the rear wheel
          // needs the chassis lifted by the pitch-projected wheelbase term
          // to stay on top); using max prevents any wheel from phasing
          // through the geometry. Includes the wheelR · (1 − cos·cos)
          // lift that pitch/roll rotation removes from the wheel center.
          const sP = Math.sin(pose.pitch), cP = Math.cos(pose.pitch);
          const sR = Math.sin(pose.roll),  cR = Math.cos(pose.roll);
          const tiltLift = WHEEL_RADIUS * (1 - cP * cR);
          let targetY = 0;
          for (let wi = 0; wi < 4; wi++) {
            const [lx, lz] = wheelLocal[wi];
            const required = wheelGroundY[wi] - lx * sP + lz * sR * cP + tiltLift;
            if (required > targetY) targetY = required;
          }

          // Y tracking — instant snap up while wheels rise onto a ramp,
          // proper gravity-accelerated fall when the chassis is in the
          // air. vy starts at 0 when the chassis leaves a surface and
          // grows by g·dt each frame, so a fall off a peak begins gently
          // and accelerates instead of dropping at a constant rate.
          if (pose.worldY > targetY + 1e-4) {
            pose.worldVY -= GRAVITY * dt;
            pose.worldY  += pose.worldVY * dt;
            if (pose.worldY <= targetY) {
              pose.worldY = targetY;
              pose.worldVY = 0;
            }
          } else {
            pose.worldY = targetY;
            pose.worldVY = 0;
          }

          // Imbalance slip — gravity projected onto the bot's tilted
          // base plane integrated as TRUE acceleration. Slip velocity
          // accumulates while on a slope and decays via rolling friction
          // when the surface goes flat, so a bot on a ramp speeds up as
          // it rolls (with terminal velocity set by the friction tau)
          // rather than instantly hitting drift speed. Two grip factors:
          //   • Pitch axis (uphill/downhill): low grip-bypass — rubber
          //     wheels resist most of gravity along the slope, only a
          //     small fraction bleeds through as slip.
          //   • Roll axis (lateral fall-off): high — once one side is
          //     unsupported the chassis tips and gravity acts almost
          //     unimpeded, so the bot plunges off the edge.
          // 25% of gravity bleeds through as slip along the pitch axis —
          // enough to noticeably fight a climbing motor (terminal slip ≈
          // 0.94 m/s drag against 1.30 m/s motor → climb ~0.36 m/s, real
          // labor) and give a satisfying speed-up on descent.
          const SLIP_GRIP_BYPASS = 0.25;
          const FALL_GRIP_BYPASS = 0.55; // 55% slips through laterally when off-balance
          // Asymmetric decay — pitch-axis slip persists (rolling momentum
          // continues after the bot leaves the slope so it coasts onto
          // the floor), lateral slip dissipates faster (lateral fall is
          // a one-shot plunge, not a continuous slide).
          const SLIP_FRICTION_TAU = 1.20; // s — slow decay so post-ramp roll is visible
          const FALL_FRICTION_TAU = 0.40; // s — snappy lateral settle
          const slopeX = (rearAvg  - frontAvg) / (2 * HALF_WB);
          // Lateral imbalance deadzone — sub-cm height differences from
          // yaw-on-slope shouldn't drag the bot sideways; only a real
          // wheel-off-edge produces enough delta to fall through the gate.
          const lateralDelta = rightAvg - leftAvg;
          const FALL_DEADZONE = 0.04;
          const lateralMag = Math.max(0, Math.abs(lateralDelta) - FALL_DEADZONE);
          const slopeZ = Math.sign(lateralDelta) * (lateralMag / (2 * HALF_TRACK));
          // Acceleration in bot-local frame, then per-axis friction decay.
          pose.driftLocalVX += slopeX * GRAVITY * SLIP_GRIP_BYPASS * dt;
          pose.driftLocalVZ += slopeZ * GRAVITY * FALL_GRIP_BYPASS * dt;
          pose.driftLocalVX *= Math.exp(-dt / SLIP_FRICTION_TAU);
          pose.driftLocalVZ *= Math.exp(-dt / FALL_FRICTION_TAU);
          // Project local-frame slip back to world and integrate.
          const wDriftX =  pose.driftLocalVX * cosH + pose.driftLocalVZ * sinH;
          const wDriftZ = -pose.driftLocalVX * sinH + pose.driftLocalVZ * cosH;
          pose.worldX += wDriftX * dt;
          pose.worldZ += wDriftZ * dt;
          // Roll the wheels by the forward-axis slip too — sliding down a
          // ramp with the motor off should still spin the tires (gravity
          // is what's driving them). Lateral skid (driftLocalVZ) does NOT
          // turn the wheels; real tires can't roll sideways. Both wheels
          // get the same delta — slip is non-differential.
          const slipWheelDelta = (pose.driftLocalVX / WHEEL_RADIUS) * dt;
          pose.leftWheelRot  += slipWheelDelta;
          pose.rightWheelRot += slipWheelDelta;

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
    setPressed({ forward: false, back: false, left: false, right: false });
    stopAllMotors();
  };

  // ─── Keyboard control ─────────────────────────────────────────────
  // WASD + arrow keys mirror the on-screen pad. Space = stop. Skipped
  // while the user is typing in an input/textarea/contenteditable so
  // the chat box doesn't accidentally drive the bot. Only active when
  // a bot exists; we don't gate on `collapsed` so the keyboard keeps
  // working even with the panel folded away.
  useEffect(() => {
    if (!activeBotId) return;
    const isTypingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const keyToAction = (key: string): 'forward' | 'back' | 'left' | 'right' | null => {
      switch (key) {
        case 'ArrowUp': case 'w': case 'W': return 'forward';
        case 'ArrowDown': case 's': case 'S': return 'back';
        case 'ArrowLeft': case 'a': case 'A': return 'left';
        case 'ArrowRight': case 'd': case 'D': return 'right';
        default: return null;
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isTypingTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handleStop();
        return;
      }
      const action = keyToAction(e.key);
      if (!action) return;
      e.preventDefault();
      setHeld(action, true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const action = keyToAction(e.key);
      if (!action) return;
      e.preventDefault();
      setHeld(action, false);
    };
    // Window blur (alt-tab, focus shifts) should release every key — otherwise
    // a key released while the page lacks focus stays "stuck on".
    const onBlur = () => {
      heldRef.current = { forward: false, back: false, left: false, right: false };
      setPressed({ forward: false, back: false, left: false, right: false });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [activeBotId]);

  if (bots.length === 0) return null;

  // Press-and-hold helpers — set the held flag on pointerdown, clear on
  // pointerup / pointerleave / pointercancel. This keeps fingers-on-button
  // = motor-on, fingers-off = motor-off, with no edge cases for "stuck on
  // because pointerup happened off-button".
  const padBtnProps = (action: 'forward' | 'back' | 'left' | 'right') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      setHeld(action, true);
    },
    onPointerUp: (e: React.PointerEvent) => {
      setHeld(action, false);
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    },
    onPointerLeave: () => { setHeld(action, false); },
    onPointerCancel: () => { setHeld(action, false); },
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
              <button type="button" className={`bot-controller-btn bot-controller-btn--up${pressed.forward ? ' is-pressed' : ''}`}    title="Drive forward — W or ↑" {...padBtnProps('forward')}>
                <ChevronUp size={18} />
                <span className="bot-controller-key">W</span>
              </button>
              <button type="button" className={`bot-controller-btn bot-controller-btn--left${pressed.left ? ' is-pressed' : ''}`}  title="Turn left — A or ←"     {...padBtnProps('left')}>
                <ChevronLeft size={18} />
                <span className="bot-controller-key">A</span>
              </button>
              <button type="button" className="bot-controller-btn bot-controller-btn--stop"  title="Stop — Space"                 onClick={handleStop}>
                <Square size={12} />
                <span className="bot-controller-key">␣</span>
              </button>
              <button type="button" className={`bot-controller-btn bot-controller-btn--right${pressed.right ? ' is-pressed' : ''}`} title="Turn right — D or →"    {...padBtnProps('right')}>
                <ChevronRight size={18} />
                <span className="bot-controller-key">D</span>
              </button>
              <button type="button" className={`bot-controller-btn bot-controller-btn--down${pressed.back ? ' is-pressed' : ''}`}  title="Drive back — S or ↓"    {...padBtnProps('back')}>
                <ChevronDown size={18} />
                <span className="bot-controller-key">S</span>
              </button>
            </div>

            <div className="bot-controller-hint">
              <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows · <kbd>Space</kbd> to stop
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
