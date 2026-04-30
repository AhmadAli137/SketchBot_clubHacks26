'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Pencil, Check, Clock, MessageCircle, Box, Code2 } from 'lucide-react';

import type { SavedSession } from '@/lib/session-storage';
import { deleteSession, pinSession } from '@/lib/session-storage';
import { countLines, formatTimeSpent } from '@/lib/scene-builder';

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

  const objectCount = session.sceneObjects?.length ?? 0;
  const chatCount   = session.chat?.length ?? 0;
  const codeLines   = countLines(session.code);
  const timeSpent   = formatTimeSpent(session.totalTimeMs);

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
    setDraftName(session.name);
    setRenaming(true);
  };

  return (
    <motion.div
      className={`session-tile session-tile--${variant}`}
      onClick={() => !renaming && onResume(session.id)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
    >
      {/* Preview thumbnail */}
      <div className="session-tile-thumb">
        {session.thumbnailSvg ? (
          <div
            className="session-tile-thumb-svg"
            // SVG generated server-side-equivalent in scene-builder.ts — safe markup
            dangerouslySetInnerHTML={{ __html: session.thumbnailSvg }}
          />
        ) : (
          <div className="session-tile-thumb-empty">
            <span className="session-tile-thumb-empty-icon">🎨</span>
            <span className="session-tile-thumb-empty-label">Empty canvas</span>
          </div>
        )}
        <div className="session-tile-thumb-eyebrow">
          {variant === 'continue' ? (
            <><span className="session-tile-pulse" /> Continue</>
          ) : (
            <>Saved</>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="session-tile-body">
        {renaming ? (
          <div className="session-tile-rename" onClick={(e) => e.stopPropagation()}>
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

        <div className="session-tile-meta-row">
          <span className="session-tile-meta-time">
            <Clock size={11} /> {relativeTime(session.lastOpenedAt)}
          </span>
          {session.totalTimeMs && session.totalTimeMs > 1000 ? (
            <span className="session-tile-meta-time">· {timeSpent} spent</span>
          ) : null}
        </div>

        <div className="session-tile-stats">
          {objectCount > 0 && (
            <span className="session-tile-stat" title="Objects in scene">
              <Box size={11} /> {objectCount}
            </span>
          )}
          {chatCount > 0 && (
            <span className="session-tile-stat" title="Chat messages with Spark">
              <MessageCircle size={11} /> {chatCount}
            </span>
          )}
          {codeLines > 0 && (
            <span className="session-tile-stat" title="Lines of code">
              <Code2 size={11} /> {codeLines}
            </span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className="session-tile-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="session-tile-action"
          onClick={handleStartRename}
          aria-label="Rename session"
          title="Rename"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          className="session-tile-action danger"
          onClick={handleDelete}
          aria-label="Delete session"
          title="Delete"
        >
          <X size={12} />
        </button>
      </div>
    </motion.div>
  );
}
