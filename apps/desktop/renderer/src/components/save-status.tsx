'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Save, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { SAVE_NOW_EVENT } from '@/lib/session-storage';

const SAVED_EVENT = 'sketchbot:session-saved';

type SaveDetail = { userName: string; id: string; at: number };

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

/**
 * Visible save indicator + manual Save button.
 * Auto-save runs continuously across prompt/chat/scene channels;
 * this surface just makes the save state explicit.
 */
export function SaveStatus({ sessionId }: { sessionId: string | null }) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savingFlash, setSavingFlash] = useState(false);
  const [tick, setTick] = useState(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for save events relevant to this session
  useEffect(() => {
    if (!sessionId) return;
    const onSaved = (e: Event) => {
      const detail = (e as CustomEvent<SaveDetail>).detail;
      if (!detail || detail.id !== sessionId) return;
      setSavedAt(detail.at);
    };
    window.addEventListener(SAVED_EVENT, onSaved);
    return () => window.removeEventListener(SAVED_EVENT, onSaved);
  }, [sessionId]);

  // Re-render every 10s so "X ago" stays current
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  if (!sessionId) return null;

  const handleSaveNow = () => {
    window.dispatchEvent(new CustomEvent(SAVE_NOW_EVENT));
    setSavingFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavingFlash(false), 1100);
  };

  return (
    <div className="save-status" data-saved-tick={tick}>
      <button
        type="button"
        className={`save-status-btn${savingFlash ? ' flashing' : ''}`}
        onClick={handleSaveNow}
        title="Save now (auto-save is also on)"
      >
        <AnimatePresence mode="wait" initial={false}>
          {savingFlash ? (
            <motion.span
              key="flash"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="save-status-icon"
            >
              <Loader2 size={11} className="save-status-spin" />
              <span>Saving…</span>
            </motion.span>
          ) : savedAt ? (
            <motion.span
              key="saved"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="save-status-icon"
            >
              <Check size={11} />
              <span>Saved · {formatRelative(savedAt)}</span>
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="save-status-icon"
            >
              <Save size={11} />
              <span>Save</span>
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
