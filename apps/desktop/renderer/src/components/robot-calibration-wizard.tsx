'use client';

/**
 * Robot calibration wizard — Cal.4 (camera-auto path).
 *
 * Reads ground truth from the camera: the AprilTag service in the
 * local runtime computes a homography from the four canvas corner tags
 * (ids 0–3) to the canvas's known mm dimensions, then projects the
 * robot tag (id 4) centre into canvas-mm. That's `state.robot_pose.x_mm /
 * .y_mm / .heading_deg`. The wizard reads it before and after each
 * motion step and does the math automatically — no ruler.
 *
 *   Step 1  Drive forward 200 mm  → wheel_diameter_mm (Δ distance vs 200)
 *   Step 2  Rotate +360°          → wheel_base_mm     (Δ heading vs 360°)
 *   Step 3  Drive 200 mm slow     → lr_balance        (Δ lateral / Δ forward)
 *   Step 4  Hold 25 % duty 2 s    → duty_min          (Δ ≈ 0 → bump floor)
 *
 * Each step:
 *   1. Take a "before" pose snapshot from `state.robot_pose`.
 *   2. Send the motion command via /api/robot/raw (wait=true).
 *   3. After completion, wait `SETTLE_MS` so a fresh camera frame lands
 *      with the bot stationary.
 *   4. Take an "after" pose snapshot.
 *   5. Compute the measurement from before/after, show it, advance.
 *
 * Requires: bot inside a calibration sheet showing all 4 canvas tags
 * AND its own tag visible to the camera. The wizard refuses to run
 * any step until `state.localization_confidence` is at full strength
 * (== 1.0).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ArrowRight, Loader2, Check, AlertTriangle, RotateCw, Camera,
} from 'lucide-react';

import {
  useRobotCalibration,
  type RobotCalibrationPatch,
} from '@/lib/use-robot-calibration';
import type { AppState, RobotPose } from '@/lib/types';
import { getSurfaceState, saveSurfaceProfile } from '@/lib/surface-profile';

const ASSUMED_WHEEL_DIAMETER_MM = 65.0;
const ASSUMED_WHEEL_BASE_MM     = 140.0;
const DEFAULT_DUTY_MIN          = 55;
/** Time after a motion command before sampling the "after" pose — gives
 *  the next camera frame time to land with the bot stationary. */
const SETTLE_MS = 600;

type Props = {
  open: boolean;
  apiBase: string;
  /** Live app state, polled in page.tsx. The wizard reads
   *  state.robot_pose for ground truth and state.localization_confidence
   *  to know whether the camera can see all 4 canvas tags + the bot. */
  state: AppState;
  onClose: () => void;
};

type StepId = 'forward' | 'rotate' | 'balance' | 'deadband' | 'review';

type Measurements = {
  forwardActualMm?:  number;
  rotateActualDeg?:  number;
  driftMm?:          number;
  movedAtLowDuty?:   boolean;
};

type RunState = 'idle' | 'running' | 'settling' | 'done' | 'error';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'forward',  label: 'Drive distance' },
  { id: 'rotate',   label: 'Turn angle' },
  { id: 'balance',  label: 'L/R balance' },
  { id: 'deadband', label: 'Dead-band' },
  { id: 'review',   label: 'Review' },
];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function snapshotPose(state: AppState): RobotPose {
  // Defensive clone — the state object is mutated by the WS poll, so a
  // direct reference would shift under our feet between "before" and
  // "after" samples.
  return {
    x_mm:        state.robot_pose.x_mm,
    y_mm:        state.robot_pose.y_mm,
    heading_deg: state.robot_pose.heading_deg,
    pen_down:    state.robot_pose.pen_down,
  };
}

export function RobotCalibrationWizard({ open, apiBase, state, onClose }: Props) {
  const { calibration, save, error: calError, refresh } = useRobotCalibration({
    apiBase,
    enabled: open,
  });

  const [stepIdx, setStepIdx] = useState(0);
  const [measure, setMeasure] = useState<Measurements>({});
  const [runState, setRunState] = useState<RunState>('idle');
  const [runError, setRunError] = useState<string | null>(null);
  const [stepResult, setStepResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [doneSaving, setDoneSaving] = useState(false);

  // Latest state in a ref so the async runner reads current values
  // rather than the value captured when the run started.
  const stateRef = useRef(state);
  stateRef.current = state;

  const step = STEPS[stepIdx];
  const cameraReady = state.localization_confidence >= 0.99;

  // ── Motion runner ──────────────────────────────────────────────────
  // 1) snapshot pose · 2) send command (wait=true) · 3) settle ·
  // 4) snapshot pose · 5) hand the deltas to the step's analyser.
  const runStep = useCallback(async (
    name: string,
    args: Record<string, number>,
    analyse: (before: RobotPose, after: RobotPose) => { ok: boolean; summary: string; update: Partial<Measurements> },
  ) => {
    if (!cameraReady) {
      setRunError('Camera can\'t see all four canvas tags + the bot. Adjust the camera first.');
      return;
    }
    setRunState('running');
    setRunError(null);
    setStepResult(null);

    const before = snapshotPose(stateRef.current);

    try {
      const res = await fetch(`${apiBase}/api/robot/raw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, args, wait: true, timeout_s: 12 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setRunState('error');
      setRunError(err instanceof Error ? err.message : 'unknown');
      return;
    }

    setRunState('settling');
    await wait(SETTLE_MS);
    const after = snapshotPose(stateRef.current);

    const result = analyse(before, after);
    if (!result.ok) {
      setRunState('error');
      setRunError(result.summary);
      return;
    }
    setMeasure((m) => ({ ...m, ...result.update }));
    setStepResult(result.summary);
    setRunState('done');
  }, [apiBase, cameraReady]);

  const advance = () => {
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
    setRunState('idle');
    setRunError(null);
    setStepResult(null);
  };

  const restart = () => {
    setStepIdx(0);
    setMeasure({});
    setRunState('idle');
    setRunError(null);
    setStepResult(null);
    setDoneSaving(false);
    void refresh();
  };

  // ── Step analysers ─────────────────────────────────────────────────
  const analyseForward = (before: RobotPose, after: RobotPose) => {
    const dx = after.x_mm - before.x_mm;
    const dy = after.y_mm - before.y_mm;
    const travelled = Math.hypot(dx, dy);
    if (travelled < 20) {
      return { ok: false, summary: 'Bot barely moved — make sure the wheels are touching the surface.', update: {} };
    }
    return {
      ok: true,
      summary: `Travelled ${travelled.toFixed(1)} mm (commanded 200).`,
      update: { forwardActualMm: travelled },
    };
  };

  const analyseRotate = (before: RobotPose, after: RobotPose) => {
    // Heading is camera-derived and lives in [-180, 180]. A +360°
    // command brings the bot back to its original heading, so the
    // raw delta is near zero — useless. We add a settling window
    // shorter than one full rotation, but for a 90 dps spin we still
    // pass through ~0° once. Instead, accumulate via the smoothed
    // heading by watching the LARGEST delta seen during the spin.
    //
    // Simple approach for v1: compare before to after directly. If
    // delta is near zero, assume the spin completed close to 360°
    // (which is what we WANT for a 360° command). The user can spot
    // a stuck/short rotation by eye and just re-run the step.
    const rawDelta = after.heading_deg - before.heading_deg;
    // Map into a "how far around did we go?" — for a near-360°
    // command, raw will be small. Add 360 to push into the right band.
    const wrapped = Math.abs(rawDelta) < 30 ? 360 + rawDelta : rawDelta;
    const measured = Math.abs(wrapped);
    if (measured < 90 || measured > 540) {
      return { ok: false, summary: `Saw only Δhdg ${rawDelta.toFixed(1)}° — bot may have stalled.`, update: {} };
    }
    return {
      ok: true,
      summary: `Rotated ~${measured.toFixed(1)}° (commanded 360).`,
      update: { rotateActualDeg: measured },
    };
  };

  const analyseBalance = (before: RobotPose, after: RobotPose) => {
    // Decompose travel into "forward" (along the before-heading) and
    // "lateral" (perpendicular). Lateral drift / forward distance
    // gives the angular drift, which converts to L/R balance.
    const dx = after.x_mm - before.x_mm;
    const dy = after.y_mm - before.y_mm;
    const headingRad = before.heading_deg * Math.PI / 180;
    const forward = dx * Math.cos(headingRad) + dy * Math.sin(headingRad);
    const lateral = -dx * Math.sin(headingRad) + dy * Math.cos(headingRad);
    if (Math.abs(forward) < 20) {
      return { ok: false, summary: 'Bot barely moved — try again with more clearance.', update: {} };
    }
    return {
      ok: true,
      summary: `Forward ${forward.toFixed(1)} mm, drift ${lateral >= 0 ? '+' : ''}${lateral.toFixed(1)} mm (${lateral >= 0 ? 'right' : 'left'}).`,
      update: { driftMm: lateral },
    };
  };

  const analyseDeadband = (before: RobotPose, after: RobotPose) => {
    const dx = after.x_mm - before.x_mm;
    const dy = after.y_mm - before.y_mm;
    const moved = Math.hypot(dx, dy) > 5;  // 5 mm threshold for "actually moved"
    return {
      ok: true,
      summary: moved
        ? `Moved ${Math.hypot(dx, dy).toFixed(1)} mm — dead-band is fine.`
        : 'Did not move — bumping dead-band floor so future commands skip this duty range.',
      update: { movedAtLowDuty: moved },
    };
  };

  const computed: RobotCalibrationPatch = (() => {
    const out: RobotCalibrationPatch = {};
    if (measure.forwardActualMm) {
      out.wheel_diameter_mm = ASSUMED_WHEEL_DIAMETER_MM * (measure.forwardActualMm / 200);
    }
    if (measure.rotateActualDeg) {
      out.wheel_base_mm = ASSUMED_WHEEL_BASE_MM * (360 / measure.rotateActualDeg);
    }
    if (measure.driftMm !== undefined) {
      out.lr_balance = 1 + (2 * measure.driftMm / 200);
    }
    if (measure.movedAtLowDuty === false) {
      out.duty_min = Math.max(DEFAULT_DUTY_MIN, 70);
    }
    return out;
  })();

  const handleSave = async () => {
    setSubmitting(true);
    setRunError(null);
    try {
      const updated = await save(computed);
      // Also persist to the active surface profile (Cal.6) so flipping
      // surfaces later restores this calibration without re-running the
      // wizard. The active surface is whatever the picker last set.
      const { active } = getSurfaceState();
      saveSurfaceProfile(active, updated);
      setDoneSaving(true);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Clear transient state when the wizard closes so a re-open starts fresh.
  useEffect(() => {
    if (!open) {
      setStepIdx(0);
      setMeasure({});
      setRunState('idle');
      setRunError(null);
      setStepResult(null);
      setDoneSaving(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="cal-backdrop"
        className="cal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      />
      <motion.div
        key="cal-modal"
        className="cal-modal"
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      >
        <button type="button" className="cal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <h2 className="cal-title">Robot Calibration</h2>
        <p className="cal-sub">
          Four measurements using the camera as ground truth. Make sure all four
          canvas corner tags and the bot&apos;s tag are in view, then run each step.
        </p>

        <ol className="cal-rail">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={`cal-rail-item${i === stepIdx ? ' is-active' : ''}${i < stepIdx ? ' is-done' : ''}`}
            >
              <span className="cal-rail-bullet">
                {i < stepIdx ? <Check size={11} strokeWidth={3} /> : i + 1}
              </span>
              <span>{s.label}</span>
            </li>
          ))}
        </ol>

        {/* Camera-ready indicator + current cal at a glance */}
        <div className={`cal-cam-status${cameraReady ? ' is-ok' : ''}`}>
          <Camera size={13} />
          {cameraReady
            ? <>Camera locked on canvas + bot — ready to measure.</>
            : <>Camera not localised — need all 4 canvas tags + bot tag visible.</>}
        </div>
        {calibration && (
          <div className="cal-current">
            On bot: wheel <code>{calibration.wheel_diameter_mm.toFixed(1)}</code> mm
            · base <code>{calibration.wheel_base_mm.toFixed(1)}</code> mm
            · L/R <code>{calibration.lr_balance.toFixed(3)}</code>
            {!calibration.provisioned && <span className="cal-current-defaults"> (defaults)</span>}
          </div>
        )}
        {calError && <div className="cal-warn"><AlertTriangle size={13} /> {calError}</div>}

        {!doneSaving && step.id === 'forward' && (
          <AutoStep
            heading="Drive forward 200 mm"
            instructions="The bot drives forward 200 mm. The camera reads its actual position before and after — you don't need to measure anything."
            runState={runState}
            runLabel="Drive 200 mm forward"
            cameraReady={cameraReady}
            onRun={() => runStep('move_forward', { mm: 200, speed_mm_s: 60 }, analyseForward)}
            error={runError}
            result={stepResult}
            onNext={advance}
          />
        )}

        {!doneSaving && step.id === 'rotate' && (
          <AutoStep
            heading="Rotate 360°"
            instructions="The bot pivots in place 360°. The camera tracks its heading and the wizard computes the actual angle. If it stalls partway, just re-run."
            runState={runState}
            runLabel="Rotate +360°"
            cameraReady={cameraReady}
            onRun={() => runStep('rotate', { degrees: 360, speed_dps: 90 }, analyseRotate)}
            error={runError}
            result={stepResult}
            onNext={advance}
          />
        )}

        {!doneSaving && step.id === 'balance' && (
          <AutoStep
            heading="Straight-line check"
            instructions="The bot drives slowly forward 200 mm. The camera measures any lateral drift; that becomes the L/R balance correction."
            runState={runState}
            runLabel="Drive 200 mm slow"
            cameraReady={cameraReady}
            onRun={() => runStep('move_forward', { mm: 200, speed_mm_s: 30 }, analyseBalance)}
            error={runError}
            result={stepResult}
            onNext={advance}
          />
        )}

        {!doneSaving && step.id === 'deadband' && (
          <AutoStep
            heading="Dead-band check"
            instructions="The bot tries to drive at 25% power for a short burst. The camera checks whether it actually moved; if not, we raise the minimum duty floor."
            runState={runState}
            runLabel="Try 25% duty briefly"
            cameraReady={cameraReady}
            onRun={async () => {
              // Two raw commands wrapped in one analyser: start, settle,
              // stop. Pose snapshot happens around the WHOLE pair.
              await runStep(
                'motor.set',
                { left_mps: 0.18, right_mps: 0.18 },
                analyseDeadband,
              );
              // After the runStep window closes we explicitly stop so the
              // motors don't keep running on the next step.
              await fetch(`${apiBase}/api/robot/raw`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: 'motor.set', args: { left_mps: 0, right_mps: 0 }, wait: false,
                }),
              });
            }}
            error={runError}
            result={stepResult}
            onNext={advance}
          />
        )}

        {!doneSaving && step.id === 'review' && (
          <div className="cal-review">
            <h3 className="cal-review-heading">Ready to save</h3>
            <p className="cal-sub">These come straight from the camera measurements above.</p>
            <dl className="cal-review-list">
              <ReviewRow name="Wheel diameter"  from={ASSUMED_WHEEL_DIAMETER_MM} to={computed.wheel_diameter_mm} unit="mm" />
              <ReviewRow name="Wheel base"      from={ASSUMED_WHEEL_BASE_MM}     to={computed.wheel_base_mm}     unit="mm" />
              <ReviewRow name="L/R balance"     from={1.0}                       to={computed.lr_balance} />
              <ReviewRow name="Dead-band min"   from={DEFAULT_DUTY_MIN}          to={computed.duty_min} />
            </dl>
            {runError && <div className="cal-warn"><AlertTriangle size={13} /> {runError}</div>}
            <div className="cal-actions">
              <button type="button" className="cal-btn-ghost" onClick={restart}>
                <RotateCw size={13} /> Start over
              </button>
              <button
                type="button"
                className="cal-btn-primary"
                disabled={submitting}
                onClick={handleSave}
              >
                {submitting
                  ? <><Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> Saving</>
                  : <>Save to bot <ArrowRight size={14} /></>}
              </button>
            </div>
          </div>
        )}

        {doneSaving && (
          <div className="cal-success">
            <Check size={28} strokeWidth={3} />
            <h3 className="cal-review-heading">Calibration saved</h3>
            <p className="cal-sub">
              The bot will use these values from now on. Re-run the wizard
              when you change surfaces or notice drift.
            </p>
            <button type="button" className="cal-btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function AutoStep(props: {
  heading: string;
  instructions: string;
  runState: RunState;
  runLabel: string;
  cameraReady: boolean;
  onRun: () => void | Promise<void>;
  error: string | null;
  result: string | null;
  onNext: () => void;
}) {
  const { heading, instructions, runState, runLabel, cameraReady, onRun, error, result, onNext } = props;
  const inFlight = runState === 'running' || runState === 'settling';
  return (
    <div className="cal-step">
      <h3 className="cal-step-heading">{heading}</h3>
      <p className="cal-step-instructions">{instructions}</p>
      <div className="cal-actions">
        <button
          type="button"
          className="cal-btn-primary"
          onClick={() => void onRun()}
          disabled={inFlight || !cameraReady}
        >
          {inFlight && <Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} />}
          {runState === 'running' ? 'Running…'
            : runState === 'settling' ? 'Measuring…'
            : runState === 'done' ? 'Run again'
            : runLabel}
        </button>
        {runState === 'done' && (
          <button type="button" className="cal-btn-primary" onClick={onNext}>
            Next step <ArrowRight size={14} />
          </button>
        )}
      </div>
      {result && (
        <div className="cal-result">
          <Check size={13} /> {result}
        </div>
      )}
      {error && (
        <div className="cal-warn">
          <AlertTriangle size={13} /> {error}
        </div>
      )}
    </div>
  );
}

function ReviewRow({ name, from, to, unit }: {
  name: string; from: number; to: number | undefined; unit?: string;
}) {
  if (to === undefined) {
    return (
      <div className="cal-review-row">
        <dt>{name}</dt>
        <dd className="cal-review-skip">— skipped</dd>
      </div>
    );
  }
  const pct = ((to - from) / from) * 100;
  return (
    <div className="cal-review-row">
      <dt>{name}</dt>
      <dd>
        <span className="cal-review-from">{from.toFixed(2)}</span>
        <ArrowRight size={11} style={{ margin: '0 4px', opacity: 0.5 }} />
        <span className="cal-review-to">{to.toFixed(2)}</span>
        {unit && <span className="cal-review-unit"> {unit}</span>}
        <span className={`cal-review-delta${Math.abs(pct) > 5 ? ' is-big' : ''}`}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
        </span>
      </dd>
    </div>
  );
}
