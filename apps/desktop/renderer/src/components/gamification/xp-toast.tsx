'use client';

// ─── Floating +XP Toast ──────────────────────────────────────────────────────
// Stackable, self-dismissing "+N XP" notifications that float up from the
// bottom-right to give instant feedback on every XP-awarding action.

import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type XPToast = {
  id: number;
  amount: number;
  reason?: string;
  emoji?: string;
};

type XPToastContextValue = {
  push: (amount: number, opts?: { reason?: string; emoji?: string }) => void;
};

const XPToastContext = createContext<XPToastContextValue | null>(null);

export function useXPToast(): XPToastContextValue {
  const ctx = useContext(XPToastContext);
  if (!ctx) {
    // Fallback no-op if provider missing so callers don't crash.
    return { push: () => {} };
  }
  return ctx;
}

export function XPToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<XPToast[]>([]);
  const idRef = useRef(0);

  const push = useCallback<XPToastContextValue['push']>((amount, opts) => {
    if (!amount) return;
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, amount, reason: opts?.reason, emoji: opts?.emoji }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <XPToastContext.Provider value={value}>
      {children}
      <div className="xp-toast-stack" aria-live="polite" aria-atomic="false">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className={`xp-toast${t.amount < 0 ? ' xp-toast--negative' : ''}`}
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -40, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            >
              {t.emoji && <span className="xp-toast-emoji" aria-hidden>{t.emoji}</span>}
              <span className="xp-toast-amount">
                {t.amount > 0 ? '+' : ''}
                {t.amount} XP
              </span>
              {t.reason && <span className="xp-toast-reason">{t.reason}</span>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </XPToastContext.Provider>
  );
}
