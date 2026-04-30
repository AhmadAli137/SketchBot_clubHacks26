'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Bookmark, X, Pencil, Check } from 'lucide-react';

import { getConceptPreviews } from '@/lib/concept-catalog';
import type { SavedSession } from '@/lib/session-storage';
import { deleteSession, pinSession } from '@/lib/session-storage';

const PREVIEWS = getConceptPreviews();
function previewFor(conceptId: string | null) {
  if (!conceptId) return null;
  return PREVIEWS.find((p) => p.id === conceptId) ?? null;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + 'm ago';
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h ago';
  const days = Math.floor(diff / 86_400_000);
  if (days === 1) return 'yesterday';
  if (days < 7) return days + 'd ago';
  return new Date(ts).toLocaleDateString();
}

type TileProps = {
  session: SavedSession;
  variant: 'continue' | 'saved';
  userName: string;
  onResume: (id: string) => void;
  onChange: () => void;
};

export function SessionTile({ session, variant, userName, onResume, onChange }: TileProps) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(session.name);
  const preview = previewFor(session.conceptId);
  const emoji = preview?.emoji ?? (session.conceptId ? '✨' : '🎨');
  const subtitle = preview?.subtitle ?? (session.conceptId ? 'Saved workspace' : 'Free-draw workspace');

  const handleSave = () => {
    pinSession(userName, session.id, draftName);
    setRenaming(false);
    onChange();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${session.name}"? This can't be undone.`)) {
      deleteSession(userName, session.id);
      onChange();
    }
  };

  const handleStartRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftName(session.pinned ? session.name : (session.conceptTitle ?? 'My session'));
    setRenaming(true);
  };

  return (
    <motion.div
      className={`session-tile session-tile--${variant}`}
      onClick={() => !renaming && onResume(session.id)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
    >
      <div className="session-tile-eyebrow">
        {variant === 'continue' ? (
          <>
            <span className="session-tile-pulse" />
            Continue · {relativeTime(session.lastOpenedAt)}
          </>
        ) : (
          <>
            <Bookmark size={11} />
            Saved · {relativeTime(session.lastOpenedAt)}
          </>
        )}
      </div>

      <div className="session-tile-body">
        <span className="session-tile-emoji">{emoji}</span>
        {renaming ? (
          <div
            className="session-tile-rename"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setRenaming(false);
              }}
              maxLength={40}
              className="session-tile-rename-input"
            />
            <button type="button" className="session-tile-rename-btn" onClick={handleSave} aria-label="Save name">
              <Check size={14} />
            </button>
          </div>
        ) : (
          <div className="session-tile-title">{session.name}</div>
        )}
        <div className="session-tile-sub">{subtitle}</div>
        {session.chat.length > 0 && (
          <div className="session-tile-meta">
            {session.chat.length} message{session.chat.length === 1 ? '' : 's'} with Spark
          </div>
        )}
      </div>

      <div className="session-tile-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="session-tile-action"
          onClick={handleStartRename}
          aria-label={session.pinned ? 'Rename session' : 'Save with a name'}
          title={session.pinned ? 'Rename' : 'Save with a name'}
        >
          {session.pinned ? <Pencil size={13} /> : <Bookmark size={13} />}
        </button>
        <button
          type="button"
          className="session-tile-action danger"
          onClick={handleDelete}
          aria-label="Delete session"
          title="Delete"
        >
          <X size={13} />
        </button>
      </div>
    </motion.div>
  );
}

