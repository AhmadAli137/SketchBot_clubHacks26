'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Trash2, RotateCw, ArrowUp, ArrowDown, Copy, Grid3X3 } from 'lucide-react';

import {
  TOOLS,
  CATEGORIES,
  type ToolDef,
  type SceneObject,
  type ToolCategory,
} from '@/lib/scene-builder';

type BuilderRailProps = {
  /** Tool currently loaded on the cursor — `null` = "select" mode. */
  activeToolId: string | null;
  /** Currently selected placed object, if any. */
  selectedObject: SceneObject | null;
  /** Open/close state for the rail (collapsible). */
  open: boolean;

  onSelectTool: (toolId: string | null) => void;
  onToggleOpen: () => void;
  onClearAll: () => void;

  /** Selected-object actions — disabled when nothing is selected. */
  onRotateSelected: () => void;
  onRaiseSelected: () => void;
  onLowerSelected: () => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;

  /** Placement-grid toggle (overlays a 0.25 m grid on the floor). */
  showPlacementGrid: boolean;
  onTogglePlacementGrid: () => void;

  objectCount: number;
};

export function BuilderRail({
  activeToolId,
  selectedObject,
  open,
  onSelectTool,
  onToggleOpen,
  onClearAll,
  onRotateSelected,
  onRaiseSelected,
  onLowerSelected,
  onDeleteSelected,
  onDuplicateSelected,
  showPlacementGrid,
  onTogglePlacementGrid,
  objectCount,
}: BuilderRailProps) {
  const [activeCategory, setActiveCategory] = useState<ToolCategory>('structures');
  const visibleTools = TOOLS.filter((t) => t.category === activeCategory);

  return (
    <motion.div
      className={`builder-rail${open ? ' open' : ''}`}
      initial={false}
      animate={{ width: open ? 240 : 44 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
    >
      {/* Collapse / expand toggle */}
      <button
        type="button"
        className="builder-rail-toggle"
        onClick={onToggleOpen}
        aria-label={open ? 'Collapse builder' : 'Open builder'}
        title={open ? 'Collapse' : 'Course builder'}
      >
        {open ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="builder-rail-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="builder-rail-header">
              <span className="builder-rail-title">Course Builder</span>
              <span className="builder-rail-count">{objectCount}</span>
            </div>

            {/* View toggles */}
            <button
              type="button"
              className={`builder-grid-toggle${showPlacementGrid ? ' active' : ''}`}
              onClick={onTogglePlacementGrid}
              title="Toggle placement gridlines"
            >
              <Grid3X3 size={12} />
              <span>{showPlacementGrid ? 'Grid on' : 'Grid off'}</span>
            </button>

            {/* Cursor / select mode */}
            <button
              type="button"
              className={`builder-tool builder-tool--select${activeToolId === null ? ' active' : ''}`}
              onClick={() => onSelectTool(null)}
              title="Selection mode (click placed objects to select)"
            >
              <span className="builder-tool-emoji">⬚</span>
              <div className="builder-tool-text">
                <span className="builder-tool-label">Select</span>
                <span className="builder-tool-sub">Click placed objects</span>
              </div>
            </button>

            {/* Category tabs */}
            <div className="builder-rail-categories">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`builder-cat-tab${activeCategory === cat.id ? ' active' : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                  title={cat.label}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Tools for the active category */}
            <div className="builder-rail-tools">
              {visibleTools.map((tool: ToolDef) => (
                <button
                  key={tool.id}
                  type="button"
                  className={`builder-tool${activeToolId === tool.id ? ' active' : ''}`}
                  onClick={() => onSelectTool(tool.id)}
                  title={tool.description}
                >
                  <span className="builder-tool-emoji">{tool.emoji}</span>
                  <div className="builder-tool-text">
                    <span className="builder-tool-label">{tool.label}</span>
                    <span className="builder-tool-sub">{tool.description}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Selected-object actions */}
            <div className="builder-rail-actions">
              <div className="builder-actions-label">
                {selectedObject ? `Selected: ${selectedObject.type}` : 'No selection'}
              </div>
              <div className="builder-actions-grid">
                <button
                  type="button"
                  disabled={!selectedObject}
                  onClick={onRotateSelected}
                  className="builder-action-btn"
                  title="Rotate 90° (R)"
                >
                  <RotateCw size={13} /> Rotate
                </button>
                <button
                  type="button"
                  disabled={!selectedObject}
                  onClick={onDuplicateSelected}
                  className="builder-action-btn"
                  title="Duplicate (Ctrl+D)"
                >
                  <Copy size={13} /> Copy
                </button>
                <button
                  type="button"
                  disabled={!selectedObject}
                  onClick={onRaiseSelected}
                  className="builder-action-btn"
                  title="Stack up (↑)"
                >
                  <ArrowUp size={13} /> Raise
                </button>
                <button
                  type="button"
                  disabled={!selectedObject}
                  onClick={onLowerSelected}
                  className="builder-action-btn"
                  title="Stack down (↓)"
                >
                  <ArrowDown size={13} /> Lower
                </button>
                <button
                  type="button"
                  disabled={!selectedObject}
                  onClick={onDeleteSelected}
                  className="builder-action-btn danger"
                  title="Delete (Del)"
                  style={{ gridColumn: 'span 2' }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>

            {/* Clear all */}
            {objectCount > 0 && (
              <button
                type="button"
                className="builder-clear-all"
                onClick={() => {
                  if (window.confirm(`Remove all ${objectCount} object${objectCount === 1 ? '' : 's'}?`)) {
                    onClearAll();
                  }
                }}
              >
                Clear course
              </button>
            )}

            <div className="builder-rail-help">
              <strong>Tips</strong>
              <span>• Click a tool, then click the floor to place</span>
              <span>• Click an object with a tool active → stacks on top</span>
              <span>• Drag to move · R rotates · Ctrl+D duplicates</span>
              <span>• ↑↓ stack height · Del removes</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
