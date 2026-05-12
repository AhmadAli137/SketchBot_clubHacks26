'use client';

/**
 * Calibration nudge — Option 1b.
 *
 * Watches `state.robot_serial` and the bot's calibration. The first time
 * a real robot's serial shows up in a session AND its on-bot calibration
 * is still at defaults (cal.provisioned === false), a small bottom-toast
 * slides in suggesting the kid run the wizard. Tapping the CTA fires
 * 'sketchbot:open-calibration' (the same event the wizard listens for
 * from everywhere else).
 *
 * Dismissal is session-scoped — same sessionStorage trick the pair card
 * uses. Once the kid waves off the nudge for a particular serial, the
 * app respects that for the rest of the run but offers again on next
 * launch in case they reconsider.
 *
 * Hidden when:
 *   - no real robot is on the LAN (no point nudging)
 *   - the bot has already been calibrated (cal.provisioned === true)
 *   - the kid dismissed it this session for this serial
 *   - the wizard is currently open (avoid double-trigger)
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X } from 'lucide-react';

import { useRobotCalibration } from '@/lib/use-robot-calibration';

type Props = {
  apiBase: string;
  robotSerial: string | null;
};

const DISMISS_KEY = 'sketchbot.calibration-nudge.dismissed';

function readDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(DISMISS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function persistDismissed(set: Set<string>): void {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
  } catch { /* storage disabled — best-effort only */ }
}

export function RobotCalibrationNudge({ apiBase, robotSerial }: Props) {
  const enabled = !!robotSerial;
  const { calibration } = useRobotCalibration({ apiBase, enabled });
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());

  const visible = useMemo(() => {
    if (!robotSerial) return false;
    if (!calibration) return false;
    if (calibration.provisioned) return false;
    if (dismissed.has(robotSerial)) return false;
    return true;
  }, [robotSerial, calibration, dismissed]);

  // Listen for the calibration wizard opening — if the user got there
  // by their own means (e.g. through the account panel) we don't need
  // to keep nudging this session.
  useEffect(() => {
    if (!robotSerial) return;
    const handler = () => {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(robotSerial);
        persistDismissed(next);
        return next;
      });
    };
    window.addEventListener('sketchbot:open-calibration', handler);
    return () => window.removeEventListener('sketchbot:open-calibration', handler);
  }, [robotSerial]);

  const dismiss = () => {
    if (!robotSerial) return;
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(robotSerial);
      persistDismissed(next);
      return next;
    });
  };

  const openWizard = () => {
    window.dispatchEvent(new CustomEvent('sketchbot:open-calibration'));
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="cal-nudge"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          role="status"
        >
          <div className="cal-nudge-icon" aria-hidden>
            <Sparkles size={16} />
          </div>
          <div className="cal-nudge-body">
            <div className="cal-nudge-title">Calibrate your new robot</div>
            <div className="cal-nudge-sub">
              Three minutes with the camera and Spark will move exactly as far as you tell it to.
            </div>
          </div>
          <button
            type="button"
            className="cal-nudge-cta"
            onClick={openWizard}
          >
            Start
          </button>
          <button
            type="button"
            className="cal-nudge-dismiss"
            onClick={dismiss}
            aria-label="Dismiss"
            title="Not now"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
