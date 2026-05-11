'use client';

/**
 * In-app pairing modal — opened from the home-screen "Pair Robot" button.
 *
 * Distinct from the home-card (components/robot-pairing-card.tsx) because
 * it's the *proactive* surface: the kid clicked Pair Robot before the bot
 * was even on the network, or wants to see what's going on after they
 * dismissed the auto-card. Handles three states the card can't:
 *
 *   - 'looking'  — no robot on the LAN yet; show waiting state with
 *                  troubleshooting hints
 *   - 'unclaimed'— real bot is on the LAN, this account doesn't own it
 *                  yet; run the same orchestration as the home-card
 *   - 'owned'    — real bot is on the LAN and already paired to me;
 *                  show confirmation, no work to do
 *
 * Implementation note: reuses lib/pair-robot.ts so the orchestration
 * logic stays single-sourced. The progress visuals are duplicated from
 * the home-card on purpose — they live in different chromes (inline
 * panel vs. modal) and that's enough to justify a small amount of CSS
 * sibling code rather than premature abstraction.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Cpu, Sparkles, Check, AlertTriangle, ArrowRight, Loader2, Search, Wifi,
} from 'lucide-react';

import { pairRobot, type PairStep } from '@/lib/pair-robot';

type Props = {
  open: boolean;
  /** Serial reported by the firmware on hello. Null when no real bot on LAN. */
  robotSerial: string | null | undefined;
  /** True iff this serial is in the signed-in user's owned-devices list. */
  isOwnedByMe: boolean;
  /** Local runtime base URL (e.g. http://127.0.0.1:8787). */
  localApiBase: string;
  /** Supabase access token. */
  authToken: string | null | undefined;
  /** Called after a successful pair; parent should refresh owned devices. */
  onPaired: () => void;
  onClose: () => void;
};

type ModalState = 'looking' | 'unclaimed' | 'owned';

const STEP_LABELS: Record<PairStep, string> = {
  idle:            'Ready to pair',
  claiming:        'Reserving your name on it',
  'issuing-token': 'Giving it a connection key',
  provisioning:    'Telling it where to find Spark',
  success:         'All paired',
  error:           'Something went wrong',
};
const STEP_ORDER: PairStep[] = ['claiming', 'issuing-token', 'provisioning'];

export function PairRobotModal(props: Props) {
  const { open, robotSerial, isOwnedByMe, localApiBase, authToken, onPaired, onClose } = props;

  // Derive the top-level modal state from props. Pairing progress lives
  // inside this same component so it can cleanly transition.
  const modalState: ModalState = !robotSerial
    ? 'looking'
    : isOwnedByMe ? 'owned' : 'unclaimed';

  const [step, setStep] = useState<PairStep>('idle');
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Reset progress state every time the modal re-opens so a previous
  // attempt's error doesn't carry over into a fresh session.
  useEffect(() => {
    if (open) {
      setStep('idle');
      setErrorMessage('');
    }
  }, [open]);

  // ESC to close, but only when not mid-pair (we don't want a stray
  // keypress to leave the bot in a half-provisioned state).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const inFlight = step !== 'idle' && step !== 'success' && step !== 'error';
      if (!inFlight) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, step, onClose]);

  const handlePair = useCallback(async () => {
    if (!robotSerial) return;
    setErrorMessage('');
    const result = await pairRobot({
      localApiBase,
      authToken,
      serial: robotSerial,
      name: name.trim() || undefined,
      onProgress: setStep,
    });
    if (result.ok) {
      setTimeout(() => { onPaired(); }, 1500);
    } else {
      setStep('error');
      setErrorMessage(result.message);
    }
  }, [robotSerial, localApiBase, authToken, name, onPaired]);

  const inProgress = step !== 'idle' && step !== 'success' && step !== 'error';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="pair-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => { if (!inProgress) onClose(); }}
          />
          <motion.div
            className="pair-modal"
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="pair-modal-close"
              onClick={onClose}
              disabled={inProgress}
              aria-label="Close"
            >
              <X size={18} />
            </button>

            {/* ── LOOKING ──────────────────────────────────────────── */}
            {modalState === 'looking' && (
              <LookingBody onClose={onClose} />
            )}

            {/* ── OWNED ───────────────────────────────────────────── */}
            {modalState === 'owned' && robotSerial && (
              <OwnedBody serial={robotSerial} onClose={onClose} />
            )}

            {/* ── UNCLAIMED ───────────────────────────────────────── */}
            {modalState === 'unclaimed' && robotSerial && (
              <UnclaimedBody
                serial={robotSerial}
                name={name}
                onChangeName={setName}
                step={step}
                errorMessage={errorMessage}
                inProgress={inProgress}
                onPair={handlePair}
                onRetry={() => { setStep('idle'); setErrorMessage(''); }}
                authToken={authToken}
              />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

function LookingBody({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="pair-modal-icon pair-modal-icon--neutral">
        <motion.div
          animate={{ rotate: [0, -10, 10, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Search size={28} />
        </motion.div>
      </div>
      <h2 className="pair-modal-title">Looking for your robot…</h2>
      <p className="pair-modal-sub">
        Plug in your SaySpark robot and connect it to the same Wi-Fi as this computer.
        We&apos;ll find it automatically and pair it in one tap.
      </p>

      <ul className="pair-modal-checklist">
        <li>
          <Wifi size={14} />
          <span>Robot powered on and connected to your Wi-Fi</span>
        </li>
        <li>
          <Cpu size={14} />
          <span>Same network as this computer (no guest Wi-Fi)</span>
        </li>
        <li>
          <Loader2 size={14} style={{ animation: 'spin 1.4s linear infinite' }} />
          <span>This panel will switch to a Pair button the moment we see it</span>
        </li>
      </ul>

      <div className="pair-modal-actions">
        <button type="button" className="pair-modal-btn-ghost" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </>
  );
}

function OwnedBody({ serial, onClose }: { serial: string; onClose: () => void }) {
  return (
    <>
      <div className="pair-modal-icon pair-modal-icon--success">
        <Check size={28} strokeWidth={3} />
      </div>
      <h2 className="pair-modal-title">You&apos;re already paired</h2>
      <p className="pair-modal-sub">
        This robot is already bound to your account and ready to go.
      </p>
      <div className="pair-modal-serial-chip">
        <Cpu size={13} />
        {serial}
      </div>
      <div className="pair-modal-actions">
        <button type="button" className="pair-modal-btn-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </>
  );
}

function UnclaimedBody(props: {
  serial: string;
  name: string;
  onChangeName: (v: string) => void;
  step: PairStep;
  errorMessage: string;
  inProgress: boolean;
  onPair: () => void;
  onRetry: () => void;
  authToken: string | null | undefined;
}) {
  const { serial, name, onChangeName, step, errorMessage, inProgress, onPair, onRetry, authToken } = props;

  if (step === 'success') {
    return (
      <>
        <div className="pair-modal-icon pair-modal-icon--success">
          <motion.div
            initial={{ scale: 0.4, rotate: -25 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 18 }}
          >
            <Check size={28} strokeWidth={3} />
          </motion.div>
        </div>
        <h2 className="pair-modal-title">{name ? `${name} is ready!` : 'Your robot is ready!'}</h2>
        <p className="pair-modal-sub">
          It can now talk to Spark from your phone, run programs from this app,
          and answer when you call.
        </p>
      </>
    );
  }

  if (step === 'error') {
    return (
      <>
        <div className="pair-modal-icon pair-modal-icon--error">
          <AlertTriangle size={26} />
        </div>
        <h2 className="pair-modal-title">Something went wrong</h2>
        <p className="pair-modal-sub">{errorMessage}</p>
        <div className="pair-modal-actions">
          <button type="button" className="pair-modal-btn-primary" onClick={onRetry}>
            <ArrowRight size={14} />
            Try again
          </button>
        </div>
      </>
    );
  }

  if (inProgress) {
    return (
      <>
        <div className="pair-modal-icon pair-modal-icon--active">
          <motion.div
            animate={{ rotate: [0, -4, 4, 0] }}
            transition={{ duration: 1.1, repeat: Infinity }}
          >
            <Cpu size={26} />
          </motion.div>
        </div>
        <h2 className="pair-modal-title">Pairing{name ? ` ${name}` : ''}…</h2>
        <ol className="pair-modal-steps">
          {STEP_ORDER.map((s) => {
            const idx = STEP_ORDER.indexOf(s);
            const cur = STEP_ORDER.indexOf(step);
            const state = idx < cur ? 'done' : idx === cur ? 'active' : 'pending';
            return (
              <li key={s} className={`pair-modal-step is-${state}`}>
                <span className="pair-modal-step-bullet">
                  {state === 'done' && <Check size={12} strokeWidth={3} />}
                  {state === 'active' && (
                    <Loader2 size={12} style={{ animation: 'spin 0.9s linear infinite' }} />
                  )}
                </span>
                <span className="pair-modal-step-label">{STEP_LABELS[s]}</span>
              </li>
            );
          })}
        </ol>
      </>
    );
  }

  // idle
  return (
    <>
      <div className="pair-modal-icon pair-modal-icon--neutral">
        <Cpu size={28} />
      </div>
      <h2 className="pair-modal-title">Meet your robot!</h2>
      <p className="pair-modal-sub">
        We found this one on your Wi-Fi. Want to pair it to your account?
      </p>
      <div className="pair-modal-serial-chip">
        <Cpu size={13} />
        {serial}
      </div>
      <input
        type="text"
        className="pair-modal-input"
        placeholder="Give it a nickname (optional)"
        value={name}
        onChange={(e) => onChangeName(e.target.value)}
        maxLength={40}
      />
      <div className="pair-modal-actions">
        <button
          type="button"
          className="pair-modal-btn-primary"
          onClick={onPair}
          disabled={!authToken}
        >
          <Sparkles size={14} />
          Pair this robot
        </button>
        {!authToken && (
          <span className="pair-modal-hint">Sign in to your SaySpark account first.</span>
        )}
      </div>
    </>
  );
}
