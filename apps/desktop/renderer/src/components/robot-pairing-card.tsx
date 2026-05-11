'use client';

/**
 * One-tap pairing card.
 *
 * Renders as a fixed-position slide-in card on the home screen when an
 * unclaimed robot is detected on the LAN. Walks the kid through claim →
 * token → set_credentials in a single button press with visible per-step
 * progress; the underlying orchestration lives in lib/pair-robot.ts.
 *
 * State machine:
 *   idle           — initial; user sees the serial + "Pair this robot"
 *   claiming       — POST /api/devices in flight
 *   issuing-token  — POST /api/devices/{id}/token in flight
 *   provisioning   — POST /api/robot/raw (set_credentials) in flight
 *   success        — done; show celebrate UI, parent calls onPaired() to
 *                    refresh the owned-devices list
 *   error          — show friendly message + retry / dismiss
 *
 * The component is intentionally chunkier than the average toast — it's
 * a one-off, important moment in the kid's first session, so we give it
 * room. Designed to live at the top of the home screen.
 */

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Cpu, X, Sparkles, Check, AlertTriangle, ArrowRight, Loader2,
} from 'lucide-react';

import { pairRobot, type PairStep } from '@/lib/pair-robot';

type Props = {
  /** Serial the firmware sent on hello. Required — card never appears
   *  without one because there's nothing to pair otherwise. */
  serial: string;
  /** Localhost runtime base URL (e.g. http://127.0.0.1:8787). */
  localApiBase: string;
  /** Supabase access token of the signed-in user. */
  authToken: string | null | undefined;
  /** Fired after a successful pair so the parent can re-fetch the
   *  owned-devices list (which causes this card to unmount). */
  onPaired: () => void;
  /** User closed the card without pairing (e.g. they'll do it later). */
  onDismiss: () => void;
};

const STEP_LABELS: Record<PairStep, string> = {
  idle:            'Ready to pair',
  claiming:        'Reserving your name on it',
  'issuing-token': 'Giving it a connection key',
  provisioning:    'Telling it where to find Spark',
  success:         'All paired',
  error:           'Something went wrong',
};

const STEP_ORDER: PairStep[] = ['claiming', 'issuing-token', 'provisioning'];

export function RobotPairingCard({
  serial, localApiBase, authToken, onPaired, onDismiss,
}: Props) {
  const [step, setStep] = useState<PairStep>('idle');
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const inProgress = step !== 'idle' && step !== 'success' && step !== 'error';

  const handlePair = useCallback(async () => {
    setErrorMessage('');
    const result = await pairRobot({
      localApiBase,
      authToken,
      serial,
      name: name.trim() || undefined,
      onProgress: setStep,
    });
    if (result.ok) {
      // After a brief celebrate window, tell the parent so it can refresh
      // the owned-devices list — that unmounts this card.
      setTimeout(onPaired, 1800);
    } else {
      setStep('error');
      setErrorMessage(result.message);
    }
  }, [localApiBase, authToken, serial, name, onPaired]);

  return (
    <motion.div
      className="pairing-card"
      initial={{ opacity: 0, y: -28, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      <button
        type="button"
        className="pairing-card-close"
        onClick={onDismiss}
        disabled={inProgress}
        aria-label="Dismiss pairing card"
        title={inProgress ? "Hold on, we're working" : 'Dismiss'}
      >
        <X size={16} />
      </button>

      <div className="pairing-card-icon">
        <AnimatePresence mode="wait">
          {step === 'success' ? (
            <motion.div
              key="check"
              initial={{ scale: 0.4, rotate: -25, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 18 }}
            >
              <Check size={28} strokeWidth={3} />
            </motion.div>
          ) : step === 'error' ? (
            <motion.div
              key="alert"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <AlertTriangle size={26} />
            </motion.div>
          ) : (
            <motion.div
              key="cpu"
              animate={inProgress ? { rotate: [0, -4, 4, 0] } : { rotate: 0 }}
              transition={{ duration: 1.1, repeat: inProgress ? Infinity : 0 }}
            >
              <Cpu size={26} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pairing-card-body">
        <AnimatePresence mode="wait">
          {step === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="pairing-card-title">Meet your robot!</div>
              <div className="pairing-card-sub">
                We found <span className="pairing-card-serial">{serial}</span> on your Wi-Fi.
                Want to pair it to your account?
              </div>

              <div className="pairing-card-nickname-row">
                <input
                  type="text"
                  className="pairing-card-input"
                  placeholder="Give it a nickname (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                />
              </div>

              <div className="pairing-card-actions">
                <button
                  type="button"
                  className="pairing-card-btn-primary"
                  onClick={handlePair}
                  disabled={!authToken}
                  title={authToken ? 'Pair this robot' : 'Sign in to pair'}
                >
                  <Sparkles size={14} />
                  Pair this robot
                </button>
                {!authToken && (
                  <div className="pairing-card-hint">Sign in to your SaySpark account first.</div>
                )}
              </div>
            </motion.div>
          )}

          {inProgress && (
            <motion.div
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="pairing-card-title">
                Pairing{name ? ` ${name}` : ''}…
              </div>
              <ol className="pairing-card-steps">
                {STEP_ORDER.map((s) => {
                  const idx = STEP_ORDER.indexOf(s);
                  const cur = STEP_ORDER.indexOf(step);
                  const state =
                    idx < cur ? 'done' : idx === cur ? 'active' : 'pending';
                  return (
                    <li key={s} className={`pairing-step is-${state}`}>
                      <span className="pairing-step-bullet">
                        {state === 'done' && <Check size={12} strokeWidth={3} />}
                        {state === 'active' && (
                          <Loader2
                            size={12}
                            style={{ animation: 'spin 0.9s linear infinite' }}
                          />
                        )}
                      </span>
                      <span className="pairing-step-label">{STEP_LABELS[s]}</span>
                    </li>
                  );
                })}
              </ol>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="pairing-card-title">
                {name ? `${name} is ready!` : 'Your robot is ready!'}
              </div>
              <div className="pairing-card-sub">
                It can now talk to Spark from your phone, run programs from
                this app, and answer when you call.
              </div>
            </motion.div>
          )}

          {step === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="pairing-card-title">Something went wrong</div>
              <div className="pairing-card-sub">{errorMessage}</div>
              <div className="pairing-card-actions">
                <button
                  type="button"
                  className="pairing-card-btn-primary"
                  onClick={() => {
                    setErrorMessage('');
                    setStep('idle');
                  }}
                >
                  <ArrowRight size={14} />
                  Try again
                </button>
                <button
                  type="button"
                  className="pairing-card-btn-ghost"
                  onClick={onDismiss}
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Decorative gradient glow under successful state — sparks vibe */}
      {step === 'success' && (
        <motion.div
          className="pairing-card-glow"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          aria-hidden
        />
      )}
    </motion.div>
  );
}
