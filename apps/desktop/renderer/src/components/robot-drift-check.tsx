'use client';

/**
 * Quick drift check — Cal.5.
 *
 * Two-step "are you still calibrated?" routine. Same camera-truth
 * pipeline as the full wizard (state.robot_pose set from the apriltag
 * homography), but only TWO measurements:
 *
 *   Step 1  Drive forward 100 mm  → expected: 95–105 mm    (±5%)
 *   Step 2  Rotate +90°           → expected: 85.5–94.5°   (±5%)
 *
 * If both pass, the bot is fine. If either fails by more than 5%, the
 * verdict screen offers a one-click jump into the full wizard via the
 * same 'sketchbot:open-calibration' event the wizard listens on.
 *
 * Shorter than the wizard on purpose — meant to be runnable at the
 * start of any session that demands precision, taking < 30 seconds.
 * The kid (or parent) doesn't have to fully recalibrate unless the
 * check catches actual drift.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ArrowRight, Loader2, Check, AlertTriangle, Camera, RotateCw,
} from 'lucide-react';

import type { AppState, RobotPose } from '@/lib/types';

type Props = {
  open: boolean;
  apiBase: string;
  state: AppState;
  onClose: () => void;
};

type StepResult = {
  commanded: number;
  measured:  number;
  pct:       number;       // signed % difference
  withinSpec: boolean;
  unit:      'mm' | '°';
};

const SETTLE_MS = 600;
const ACCEPT_PCT = 5;       // anything outside ±5% → recommend recalibration
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function snapshotPose(s: AppState): RobotPose {
  return {
    x_mm:        s.robot_pose.x_mm,
    y_mm:        s.robot_pose.y_mm,
    heading_deg: s.robot_pose.heading_deg,
    pen_down:    s.robot_pose.pen_down,
  };
}

export function RobotDriftCheck({ open, apiBase, state, onClose }: Props) {
  const [running, setRunning] = useState(false);
  const [forwardResult, setForwardResult] = useState<StepResult | null>(null);
  const [rotateResult,  setRotateResult]  = useState<StepResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  const cameraReady = state.localization_confidence >= 0.99;
  const allDone = forwardResult !== null && rotateResult !== null;
  const verdict: 'pass' | 'fail' | null = allDone
    ? (forwardResult!.withinSpec && rotateResult!.withinSpec ? 'pass' : 'fail')
    : null;

  // Reset state when reopened.
  useEffect(() => {
    if (open) {
      setRunning(false);
      setForwardResult(null);
      setRotateResult(null);
      setError(null);
    }
  }, [open]);

  const run = useCallback(async () => {
    if (!cameraReady) {
      setError("Camera can't see all four canvas tags + the bot. Adjust the camera first.");
      return;
    }
    setRunning(true);
    setError(null);
    setForwardResult(null);
    setRotateResult(null);

    try {
      // ── Forward 100mm ─────────────────────────────────────────────
      const beforeFwd = snapshotPose(stateRef.current);
      let res = await fetch(`${apiBase}/api/robot/raw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'move_forward', args: { mm: 100, speed_mm_s: 60 },
          wait: true, timeout_s: 6,
        }),
      });
      if (!res.ok) throw new Error(`forward HTTP ${res.status}`);
      await wait(SETTLE_MS);
      const afterFwd = snapshotPose(stateRef.current);
      const dx = afterFwd.x_mm - beforeFwd.x_mm;
      const dy = afterFwd.y_mm - beforeFwd.y_mm;
      const measuredMm = Math.hypot(dx, dy);
      const fwdPct = ((measuredMm - 100) / 100) * 100;
      setForwardResult({
        commanded: 100,
        measured: measuredMm,
        pct: fwdPct,
        withinSpec: Math.abs(fwdPct) <= ACCEPT_PCT,
        unit: 'mm',
      });

      // Short pause so the heading-smoothing settles before we sample
      // for the rotation step.
      await wait(200);

      // ── Rotate +90° ───────────────────────────────────────────────
      const beforeRot = snapshotPose(stateRef.current);
      res = await fetch(`${apiBase}/api/robot/raw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'rotate', args: { degrees: 90, speed_dps: 90 },
          wait: true, timeout_s: 4,
        }),
      });
      if (!res.ok) throw new Error(`rotate HTTP ${res.status}`);
      await wait(SETTLE_MS);
      const afterRot = snapshotPose(stateRef.current);
      // Heading is in [-180, 180]. For a +90° turn the raw difference
      // should fall in [60, 120] roughly — no wrap-around to worry
      // about since 90° is well clear of ±180°.
      const headingDelta = ((afterRot.heading_deg - beforeRot.heading_deg + 540) % 360) - 180;
      const measuredDeg = Math.abs(headingDelta);
      const rotPct = ((measuredDeg - 90) / 90) * 100;
      setRotateResult({
        commanded: 90,
        measured: measuredDeg,
        pct: rotPct,
        withinSpec: Math.abs(rotPct) <= ACCEPT_PCT,
        unit: '°',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setRunning(false);
    }
  }, [apiBase, cameraReady]);

  const openWizard = () => {
    onClose();
    // Slight delay so this modal can exit before the wizard mounts —
    // both share the same dim-the-screen overlay and a brief gap reads
    // better than instant stack.
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('sketchbot:open-calibration'));
    }, 120);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="cal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      />
      <motion.div
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

        <h2 className="cal-title">Drift check</h2>
        <p className="cal-sub">
          Two quick measurements — drive 100 mm, turn 90° — to confirm
          your bot is still calibrated. Takes about 30 seconds.
        </p>

        <div className={`cal-cam-status${cameraReady ? ' is-ok' : ''}`}>
          <Camera size={13} />
          {cameraReady
            ? <>Camera locked on canvas + bot — ready.</>
            : <>Camera not localised — need all 4 canvas tags + bot tag visible.</>}
        </div>

        {/* Results table — fills in as steps complete */}
        <div className="cal-drift-table" role="table">
          <DriftRow
            label="Drive 100 mm"
            result={forwardResult}
          />
          <DriftRow
            label="Rotate 90°"
            result={rotateResult}
          />
        </div>

        {error && <div className="cal-warn"><AlertTriangle size={13} /> {error}</div>}

        {/* Verdict + actions */}
        {!allDone && (
          <div className="cal-actions">
            <button
              type="button"
              className="cal-btn-primary"
              disabled={running || !cameraReady}
              onClick={() => void run()}
            >
              {running
                ? <><Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> Running…</>
                : <>Run drift check <ArrowRight size={14} /></>}
            </button>
          </div>
        )}

        {verdict === 'pass' && (
          <div className="cal-success" style={{ paddingTop: 14 }}>
            <Check size={26} strokeWidth={3} />
            <h3 className="cal-review-heading" style={{ marginTop: 6 }}>Looking good</h3>
            <p className="cal-sub">Both measurements landed within 5% of commanded. No recalibration needed.</p>
            <button type="button" className="cal-btn-primary" onClick={onClose}>Done</button>
          </div>
        )}

        {verdict === 'fail' && (
          <div className="cal-review" style={{ paddingTop: 14 }}>
            <h3 className="cal-review-heading">Drift detected</h3>
            <p className="cal-sub">
              {!forwardResult!.withinSpec && !rotateResult!.withinSpec
                ? 'Both distance and turn are outside the 5% spec.'
                : !forwardResult!.withinSpec
                  ? 'Distance is outside the 5% spec.'
                  : 'Turn angle is outside the 5% spec.'}
              {' '}Re-running the full wizard usually clears this up in three minutes.
            </p>
            <div className="cal-actions">
              <button type="button" className="cal-btn-ghost" onClick={() => { setForwardResult(null); setRotateResult(null); }}>
                <RotateCw size={13} /> Re-run check
              </button>
              <button type="button" className="cal-btn-primary" onClick={openWizard}>
                Open calibration wizard <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function DriftRow({ label, result }: { label: string; result: StepResult | null }) {
  return (
    <div className="cal-drift-row">
      <span className="cal-drift-label">{label}</span>
      {result === null ? (
        <span className="cal-drift-pending">—</span>
      ) : (
        <span className={`cal-drift-value${result.withinSpec ? ' is-ok' : ' is-fail'}`}>
          {result.measured.toFixed(1)}{result.unit}
          <span className="cal-drift-delta">
            ({result.pct >= 0 ? '+' : ''}{result.pct.toFixed(1)}%)
          </span>
        </span>
      )}
    </div>
  );
}
