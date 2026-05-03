'use client';

/**
 * SimPlayground — Gazebo-like 3D + 2D simulation environment for SketchBot.
 * Each concept renders a unique 3D arena, tutorial panel, and live score overlay.
 */

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Grid3X3, Pause, Play, RotateCcw, View, BookOpen, ChevronRight, ChevronLeft, X, Trophy, Hammer, Settings, Sparkles } from 'lucide-react';

import { TopView } from './top-view';
import { BuilderRail } from './builder-rail';
import { BotController } from './bot-controller';
import { useSimAnimation } from '@/lib/use-sim-animation';
import { getEnvironment, getTutorialSteps } from '@/lib/concept-environments';
import { playBGM, stopBGM, playSfx } from '@/lib/game-audio';
import {
  TOOLS_BY_ID,
  makeObjectFromTool,
  maybeSnapForType,
  newSceneObjectId,
  rotationStepsForType,
  type SceneObject,
} from '@/lib/scene-builder';
import { SANDBOX_PRESETS, instantiatePreset, type SandboxPreset } from '@/lib/sandbox-presets';
import { emitSparkEvent } from '@/lib/spark-events';

const Scene3D = dynamic(() => import('./scene-3d').then((m) => ({ default: m.Scene3D })), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'radial-gradient(ellipse 90% 70% at 50% 25%, #0c1838 0%, #060a18 55%, #03050c 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          color: 'rgba(140, 210, 255, 0.65)',
          fontSize: '0.78rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        Loading 3D…
      </div>
    </div>
  ),
});

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = '3d' | 'split' | '2d';

type SimPlaygroundProps = {
  svgContent: string | null;
  isGenerating?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onDrawComplete?: () => void;
  conceptId?: string | null;
  activeLayer?: 'intuitive' | 'structural' | 'precise';
  score?: number;
  maxScore?: number;
  /** Sandbox course-builder objects (persisted in the active SavedSession). */
  sceneObjects?: SceneObject[];
  onSceneObjectsChange?: (objects: SceneObject[]) => void;
  /** Whether the builder is available — true in sandbox/blank sessions. */
  builderAvailable?: boolean;
  /** Used to scope user-template storage. */
  studentName?: string;
};

// ─── Main component ───────────────────────────────────────────────────────────

export function SimPlayground({
  svgContent,
  isGenerating = false,
  className,
  style,
  onDrawComplete,
  conceptId,
  activeLayer = 'intuitive',
  score,
  maxScore,
  sceneObjects = [],
  onSceneObjectsChange,
  builderAvailable = false,
  studentName = '',
}: SimPlaygroundProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showCamera, setShowCamera] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [showScore, setShowScore] = useState(false);

  // ─── Builder state ─────────────────────────────────────────────────────────
  const [builderEnabled, setBuilderEnabled] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [draggedObjectId, setDraggedObjectId] = useState<string | null>(null);
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const [showPlacementGrid, setShowPlacementGrid] = useState(true);
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  /** When true, the sandbox welcome overlay is dismissed and the user gets
   *  a clean empty canvas to explore (orbit, zoom, hit Build later, etc). */
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  // Reset dismissal whenever a new sandbox session is opened (sceneObjects
  // resets to empty AND builder is off → fresh empty state, show welcome again).
  useEffect(() => {
    if (sceneObjects.length === 0 && !builderEnabled) return; // no change needed
    setWelcomeDismissed(false);
  }, [sceneObjects.length, builderEnabled]);

  /** Drop a starter preset into the sandbox — used by empty-state chips. */
  const handleApplyPreset = (preset: SandboxPreset) => {
    const objects = instantiatePreset(preset);
    onSceneObjectsChange?.(objects);
    setBuilderEnabled(true); // open the builder so the kid sees what was added
  };

  const activeTool = activeToolId ? (TOOLS_BY_ID[activeToolId] ?? null) : null;
  const selectedObject = selectedObjectId
    ? (sceneObjects.find((o) => o.id === selectedObjectId) ?? null)
    : null;

  // When builder loses availability (e.g. user opened a non-sandbox concept), turn it off
  useEffect(() => {
    if (!builderAvailable) {
      setBuilderEnabled(false);
      setActiveToolId(null);
      setSelectedObjectId(null);
      setHoveredObjectId(null);
    }
  }, [builderAvailable]);

  const updateObjects = (next: SceneObject[]) => {
    onSceneObjectsChange?.(next);
  };

  const handlePlaceAt = (gx: number, gz: number, rotY: 0 | 1 | 2 | 3 = 0) => {
    if (!activeTool) return;
    // If cursor is over an existing object, stack-on-top via that object's
    // position instead of the floor click point. This makes stacking forgiving:
    // hover the top face → click anywhere → it lands correctly.
    const stackTarget = hoveredObjectId
      ? sceneObjects.find((o) => o.id === hoveredObjectId)
      : null;
    if (stackTarget) {
      handleStackOnTop(stackTarget.id);
      return;
    }
    // Walls snap to the grid for clean maze geometry; everything else
    // free-places at the cursor's exact float position.
    const snapped = maybeSnapForType(activeTool.type, gx, gz);
    const obj = makeObjectFromTool(activeTool, snapped.gx, snapped.gz);
    obj.rotY = rotY;
    updateObjects([...sceneObjects, obj]);
    setSelectedObjectId(obj.id);
    emitSparkEvent('user.place', { tool: activeTool.id });
  };


  const handleSelectObject = (id: string | null) => {
    setSelectedObjectId(id);
    if (id) setActiveToolId(null); // selecting clears the tool cursor
  };

  const handleRotateSelected = () => {
    if (!selectedObject) return;
    // Cycle through the type's *visually distinct* rotations. Walls have
    // 2-fold symmetry (X-axis or Z-axis), bots/apriltags have full
    // 4-fold orientation, radially-symmetric props (cones, spheres, etc.)
    // have only 1 unique state and so don't visibly rotate. Without this
    // cap, walls cycle 0→3→2→1→0 mathematically but the kid only sees
    // H→V→H→V because rotY=0 looks identical to rotY=2.
    const steps = rotationStepsForType(selectedObject.type);
    if (steps === 1) return; // no visible change possible
    // Clockwise step from above (CCW is +1 in Three.js Y rotation).
    const cur = (selectedObject.rotY ?? 0);
    const next = ((cur + (steps - 1)) % steps) as 0 | 1 | 2 | 3;
    updateObjects(sceneObjects.map((o) =>
      o.id === selectedObject.id ? { ...o, rotY: next } : o,
    ));
    emitSparkEvent('user.rotate');
  };
  const handleRaiseSelected = () => {
    if (!selectedObject) return;
    updateObjects(sceneObjects.map((o) =>
      o.id === selectedObject.id ? { ...o, gy: Math.min((o.gy ?? 0) + 1, 6) } : o,
    ));
  };
  const handleLowerSelected = () => {
    if (!selectedObject) return;
    updateObjects(sceneObjects.map((o) =>
      o.id === selectedObject.id ? { ...o, gy: Math.max((o.gy ?? 0) - 1, 0) } : o,
    ));
  };
  const handleDeleteSelected = () => {
    if (!selectedObject) return;
    updateObjects(sceneObjects.filter((o) => o.id !== selectedObject.id));
    setSelectedObjectId(null);
    emitSparkEvent('user.delete');
  };
  const handleClearAll = () => {
    updateObjects([]);
    setSelectedObjectId(null);
  };

  /** Click a placed object with a tool active — place a new object on top of it. */
  const handleStackOnTop = (objectId: string) => {
    if (!activeTool) return; // no tool → just selection (handled by onSelect)
    const target = sceneObjects.find((o) => o.id === objectId);
    if (!target) return;
    // Wall-on-wall isn't a meaningful maze operation — ignore so the kid
    // can sweep out a row without accidental clicks on existing walls
    // creating phantom stacked walls. They asked for these clicks to
    // "just ignore" and stay in placement mode.
    if (activeTool.type === 'wall' && target.type === 'wall') return;
    const obj = makeObjectFromTool(activeTool, target.gx, target.gz, (target.gy ?? 0) + 1);
    updateObjects([...sceneObjects, obj]);
    setSelectedObjectId(obj.id);
  };

  /** 'press' — traditional press-drag-release. 'follow' — toolbar Move button:
   *  object follows cursor until the user clicks anywhere on the floor. */
  const [dragMode, setDragMode] = useState<'press' | 'follow'>('press');

  /** Begin dragging a placed object (only in select mode — when no tool is active). */
  const handleStartDrag = (objectId: string) => {
    if (activeTool) return; // tool mode → click is "stack on top", not drag
    setDragMode('press');
    setDraggedObjectId(objectId);
  };

  /** Toolbar Move button: enter follow-cursor mode for the selected object.
   *  Differs from press-drag in two ways:
   *   • doesn't end on pointerup (we'd exit the moment the kid releases the
   *     button click), so the object keeps following the cursor
   *   • ends on the next floor click instead — that click IS the drop. */
  const handleStartFollow = () => {
    if (!selectedObject) return;
    setDragMode('follow');
    setDraggedObjectId(selectedObject.id);
  };

  const handleDragMove = (gx: number, gz: number) => {
    if (!draggedObjectId) return;
    updateObjects(sceneObjects.map((o) => {
      if (o.id !== draggedObjectId) return o;
      // Per-type snap: walls lock to the grid mid-drag, everything else
      // follows the cursor freely so the kid can slide cones / lights /
      // bots into any position they want.
      const snapped = maybeSnapForType(o.type, gx, gz);
      return { ...o, gx: snapped.gx, gz: snapped.gz };
    }));
  };

  const handleEndDrag = () => setDraggedObjectId(null);

  /** Duplicate the selected object — offset by one grid cell so it's visible. */
  const handleDuplicateSelected = () => {
    if (!selectedObject) return;
    const copy: SceneObject = {
      ...selectedObject,
      id: newSceneObjectId(),
      gx: selectedObject.gx + 1,
      gz: selectedObject.gz + 1,
    };
    updateObjects([...sceneObjects, copy]);
    setSelectedObjectId(copy.id);
  };


  // Keyboard shortcuts when builder is on
  useEffect(() => {
    if (!builderEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (!selectedObject) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); handleDeleteSelected(); }
      else if (e.key === 'r' || e.key === 'R')         { e.preventDefault(); handleRotateSelected(); }
      else if (e.key === 'ArrowUp')                    { e.preventDefault(); handleRaiseSelected(); }
      else if (e.key === 'ArrowDown')                  { e.preventDefault(); handleLowerSelected(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        handleDuplicateSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderEnabled, selectedObject, sceneObjects]);

  const env = getEnvironment(conceptId);
  const tutorialSteps = getTutorialSteps(conceptId, activeLayer);

  // BGM:
  //  • concept session  → play that concept's theme (loops in place)
  //  • sandbox / blank  → playBGM(null) starts the rotating sandbox playlist
  //                        (geometry-drawing → maze-marathon → path-planning → repeat)
  //  • on unmount       → stop
  useEffect(() => {
    playBGM(conceptId ?? null);
    return () => stopBGM();
  }, [conceptId]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const topViewRef = useRef<HTMLDivElement>(null);
  const [topViewSize, setTopViewSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setContainerSize({ w: r.width, h: r.height });
      }
      if (topViewRef.current) {
        const r = topViewRef.current.getBoundingClientRect();
        setTopViewSize({ w: r.width, h: r.height });
      }
    };

    const obs = new ResizeObserver(update);
    if (containerRef.current) obs.observe(containerRef.current);
    if (topViewRef.current) obs.observe(topViewRef.current);

    update();

    return () => obs.disconnect();
  }, [viewMode]);

  // Force an initial measurement burst (fixes rare 0x0 init until interaction)
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    const pump = () => {
      frames += 1;
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setContainerSize({ w: r.width, h: r.height });
      }
      if (topViewRef.current) {
        const r = topViewRef.current.getBoundingClientRect();
        setTopViewSize({ w: r.width, h: r.height });
      }
      if (frames < 8) {
        raf = requestAnimationFrame(pump);
      }
    };
    raf = requestAnimationFrame(pump);
    return () => cancelAnimationFrame(raf);
  }, []);

  const { penPos, settledLines, activeLine, isAnimating, isComplete, progress, play, pause, seek, replay } = useSimAnimation({
    svgContent,
    speedMultiplier: speed,
    onComplete: onDrawComplete,
  });

  // Spark reactions to sim lifecycle: nod when a run starts, celebrate on
  // completion. Watching state edges keeps this independent of which UI
  // control fired play/pause/replay.
  const wasAnimatingRef = useRef(false);
  const wasCompleteRef = useRef(false);
  useEffect(() => {
    if (isAnimating && !wasAnimatingRef.current) {
      emitSparkEvent('sim.start');
    }
    wasAnimatingRef.current = isAnimating;
  }, [isAnimating]);
  useEffect(() => {
    if (isComplete && !wasCompleteRef.current) {
      emitSparkEvent('sim.complete');
    }
    wasCompleteRef.current = isComplete;
  }, [isComplete]);

  const hasDimensions = containerSize.w > 10 && containerSize.h > 10;
  // Sandbox: always full 3D (ViewCube replaces the 2D split pane).
  // Drawing mode: respect the user's view tabs.
  const effectiveViewMode: ViewMode = builderAvailable ? '3d' : viewMode;
  const show3D = (effectiveViewMode === '3d' || effectiveViewMode === 'split') && hasDimensions;
  const show2D = effectiveViewMode === '2d' || effectiveViewMode === 'split';

  return (
    <div
      ref={containerRef}
      className={`sim-playground-root ${className ?? ''}`}
      style={style}
    >
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className={`sim-playground-toolbar${builderAvailable ? ' sandbox' : ''}`}>
        {/* Sandbox: Build is the hero CTA on the left */}
        {builderAvailable && (
          <button
            type="button"
            className={`sim-build-cta${builderEnabled ? ' active' : ''}`}
            onClick={() => {
              setBuilderEnabled((v) => !v);
              setSelectedObjectId(null);
            }}
            title={builderEnabled
              ? 'Close builder'
              : 'Open builder — add walls / cones / lights and modify what’s already here'}
          >
            {builderEnabled ? <X size={14} /> : <Hammer size={14} />}
            <span>{builderEnabled ? 'Close Builder' : 'Open Builder'}</span>
          </button>
        )}

        {/* View mode tabs — only in drawing mode (sandbox uses ViewCube instead) */}
        {!builderAvailable && (
          <div className="sim-view-tabs">
            {(['3d', 'split', '2d'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`sim-view-tab ${viewMode === mode ? 'active' : ''}`}
                onClick={() => setViewMode(mode)}
                title={mode === '3d' ? '3D view' : mode === 'split' ? 'Side-by-side' : 'Bird’s-eye'}
              >
                {mode === '3d' ? '3D' : mode === 'split' ? <View size={12} /> : 'Top'}
              </button>
            ))}
          </div>
        )}

        {/* Drawing-mode controls — only shown when there's actually a drawing
            to play (free-draw / lesson concepts). Sandbox hides all this. */}
        {!builderAvailable && (
          <>
            <div className="sim-toolbar-group sim-speed-group">
              <span className="sim-toolbar-label">Speed</span>
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.25}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="sim-speed-slider"
              />
              <span className="sim-toolbar-label">{speed}×</span>
            </div>

            <div className="sim-toolbar-group" style={{ marginLeft: 'auto' }}>
              <button
                type="button"
                className={`sim-toolbar-btn ${isAnimating ? 'active' : ''}`}
                onClick={() => (isAnimating ? pause() : play())}
                title={isAnimating ? 'Pause' : 'Play'}
              >
                {isAnimating ? <Pause size={11} /> : <Play size={11} />}
              </button>
              <div className="sim-status-badge">
                <div className={`sim-status-dot ${isAnimating ? 'live' : isComplete ? 'done' : 'idle'}`} />
                {isAnimating ? 'Drawing…' : isComplete ? 'Complete' : isGenerating ? 'Generating…' : 'Ready'}
              </div>
              <button type="button" className="sim-toolbar-btn" onClick={replay} title="Reset">
                <RotateCcw size={11} />
              </button>
            </div>
          </>
        )}

        {/* View options popover — gear in the top-right */}
        <div
          className="sim-view-options"
          style={builderAvailable ? { marginLeft: 'auto' } : undefined}
        >
          <button
            type="button"
            className={`sim-view-options-btn${viewOptionsOpen ? ' active' : ''}`}
            onClick={() => setViewOptionsOpen((v) => !v)}
            title="View options"
          >
            <Settings size={12} />
          </button>
          {viewOptionsOpen && (
            <div className="sim-view-options-pop">
              <button
                type="button"
                className={`sim-view-option${showGrid ? ' active' : ''}`}
                onClick={() => setShowGrid((v) => !v)}
              >
                <Grid3X3 size={12} /> Grid
              </button>
              <button
                type="button"
                className={`sim-view-option${showAxes ? ' active' : ''}`}
                onClick={() => setShowAxes((v) => !v)}
              >
                X · Y · Z axes
              </button>
              <button
                type="button"
                className={`sim-view-option${showCamera ? ' active' : ''}`}
                onClick={() => setShowCamera((v) => !v)}
              >
                Overhead camera
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Drawing-mode timeline — hidden in sandbox */}
      {!builderAvailable && (
        <div className="sim-timeline">
          <input
            className="sim-timeline-slider"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={Number.isFinite(progress) ? progress : 0}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Simulation timeline"
          />
          <div className="sim-timeline-label">{Math.round((Number.isFinite(progress) ? progress : 0) * 100)}%</div>
        </div>
      )}

      {/* ── Viewport area ── */}
      <div className="sim-playground-viewport" data-tour="sim-viewport">
        {/* 3D view */}
        {show3D && (
          <div
            className="sim-3d-pane"
            style={{ flex: effectiveViewMode === 'split' ? '0 0 68%' : '1' }}
          >
            <Scene3D
              settledLines={settledLines}
              activeLine={activeLine}
              penPos={penPos}
              isAnimating={isAnimating}
              showGrid={showGrid}
              showAxes={showAxes}
              showCamera={showCamera}
              className="sim-3d-canvas"
              conceptId={conceptId}
              builderEnabled={builderEnabled}
              showPlacementGrid={showPlacementGrid}
              sceneObjects={sceneObjects}
              selectedObjectId={selectedObjectId}
              draggedObjectId={draggedObjectId}
              hoveredObjectId={hoveredObjectId}
              activeTool={activeTool}
              onPlaceAt={handlePlaceAt}
              onSelectObject={handleSelectObject}
              onStackOnTop={handleStackOnTop}
              onStartDrag={handleStartDrag}
              onDragMove={handleDragMove}
              onEndDrag={handleEndDrag}
              onHoverObject={setHoveredObjectId}
              onRotateSelected={handleRotateSelected}
              onDeleteSelected={handleDeleteSelected}
              onMoveSelected={handleStartFollow}
              dragMode={dragMode}
            />
            <div className="sim-3d-hint">
              {builderEnabled
                ? (activeTool
                    ? '💡 Click the floor to drop · right-click to rotate'
                    : '💡 Pick a tool · click an object to select')
                : '💡 Drag to spin · scroll to zoom'}
            </div>
            {/* Bot controller — stays mounted whenever any bot is in the
                scene so it can't blink in/out from incidental state churn.
                Selecting a bot in the scene routes the controller to that
                bot via selectedBotId. */}
            <BotController
              sceneObjects={sceneObjects}
              onUpdateObjects={updateObjects}
              selectedBotId={
                selectedObject && selectedObject.type === 'bot'
                  ? selectedObject.id
                  : null
              }
            />

            {/* Builder rail overlay (sandbox only) */}
            {builderEnabled && (
              <BuilderRail
                activeToolId={activeToolId}
                selectedObject={selectedObject}
                open={railOpen}
                onSelectTool={(id) => {
                  setActiveToolId(id);
                  if (id) setSelectedObjectId(null);
                }}
                onToggleOpen={() => setRailOpen((v) => !v)}
                onClearAll={handleClearAll}
                onRotateSelected={handleRotateSelected}
                onRaiseSelected={handleRaiseSelected}
                onLowerSelected={handleLowerSelected}
                onDeleteSelected={handleDeleteSelected}
                onDuplicateSelected={handleDuplicateSelected}
                showPlacementGrid={showPlacementGrid}
                onTogglePlacementGrid={() => setShowPlacementGrid((v) => !v)}
                objectCount={sceneObjects.length}
              />
            )}
          </div>
        )}

        {/* 2D top-down view */}
        {show2D && (
          <div
            ref={topViewRef}
            className="sim-2d-pane"
            style={{ flex: effectiveViewMode === 'split' ? '0 0 32%' : '1' }}
          >
            <div className="sim-2d-label">{builderAvailable ? 'Bird’s-eye view' : 'Top View'}</div>
            <TopView
              settledLines={settledLines}
              activeLine={activeLine}
              penPos={penPos}
              isAnimating={isAnimating}
              width={topViewSize.w || 300}
              height={topViewSize.h || 400}
              mode={builderAvailable ? 'sandbox' : 'drawing'}
              sceneObjects={sceneObjects}
            />
          </div>
        )}

        {/* Empty state — different copy for sandbox vs free-draw */}
        {!svgContent && !isGenerating && !conceptId && sceneObjects.length === 0 && !builderEnabled && !welcomeDismissed && (
          builderAvailable ? (
            <div className="sim-sandbox-welcome">
              <button
                type="button"
                className="sim-sandbox-welcome-close"
                onClick={() => setWelcomeDismissed(true)}
                aria-label="Dismiss welcome"
                title="Skip — start with an empty canvas"
              >
                <X size={14} />
              </button>
              <div className="sim-sandbox-mascot" aria-hidden>🤖</div>
              <div className="sim-sandbox-welcome-title">Your sandbox is empty</div>
              <div className="sim-sandbox-welcome-sub">
                Pick a starter, click <strong>Open Builder</strong> to place objects yourself, or just dive in.
              </div>
              <div className="sim-sandbox-starters">
                {SANDBOX_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="sim-sandbox-starter"
                    onClick={() => handleApplyPreset(preset)}
                  >
                    <span className="sim-sandbox-starter-emoji">{preset.emoji}</span>
                    <span className="sim-sandbox-starter-label">{preset.label}</span>
                    <span className="sim-sandbox-starter-sub">{preset.description}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="sim-sandbox-skip"
                onClick={() => setWelcomeDismissed(true)}
              >
                Skip — start with an empty canvas →
              </button>
              <div className="sim-sandbox-hint">
                <Sparkles size={11} /> Tip: ask Spark in the chat — “build me a sumo arena”
              </div>
            </div>
          ) : (
            <div className="sim-empty-overlay">
              <div className="sim-empty-icon">🤖</div>
              <div className="sim-empty-title">3D Simulator Ready</div>
              <div className="sim-empty-body">
                Generate a drawing from the prompt bar — the SketchBot robot will drive it live in 3D.
              </div>
            </div>
          )
        )}

        {/* Generating state */}
        {isGenerating && !svgContent && (
          <div className="sim-empty-overlay">
            <div className="sim-empty-icon" style={{ animation: 'r-pulse 1.2s infinite' }}>✏️</div>
            <div className="sim-empty-title">Generating path…</div>
          </div>
        )}

        {/* ── Concept environment badge ── */}
        <AnimatePresence>
          {conceptId && (
            <motion.div
              key={conceptId}
              className="sim-env-badge"
              data-tour="sim-env-badge"
              initial={{ opacity: 0, y: -8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.92 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <span className="sim-env-badge-dot" style={{ background: env.accentColor }} />
              {env.label}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Tutorial button ── */}
        {conceptId && (
          <motion.button
            className="sim-tutorial-btn"
            data-tour="sim-tutorial-btn"
            onClick={() => { setShowTutorial((v) => !v); setTutorialStep(0); playSfx('click'); }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            title="Show tutorial"
          >
            <BookOpen size={13} />
          </motion.button>
        )}

        {/* ── Score badge ── */}
        <AnimatePresence>
          {score != null && (
            <motion.button
              key="score"
              className="sim-score-badge"
              data-tour="sim-score-btn"
              initial={{ opacity: 0, scale: 0.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3 }}
              onClick={() => setShowScore((v) => !v)}
            >
              <Trophy size={11} />
              <span>{score}</span>
              {maxScore != null && <span className="sim-score-max">/{maxScore}</span>}
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Tutorial panel ── */}
        <AnimatePresence>
          {showTutorial && conceptId && (
            <motion.div
              key="tutorial-panel"
              className="sim-tutorial-panel"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <div className="sim-tutorial-head">
                <span className="sim-tutorial-title">{env.label}</span>
                <motion.button
                  className="sim-tutorial-close"
                  onClick={() => setShowTutorial(false)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X size={12} />
                </motion.button>
              </div>

              <div className="sim-tutorial-layer-tag">{activeLayer}</div>

              <AnimatePresence mode="wait">
                <motion.p
                  key={tutorialStep}
                  className="sim-tutorial-text"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  {tutorialSteps[tutorialStep] ?? tutorialSteps[0]}
                </motion.p>
              </AnimatePresence>

              <div className="sim-tutorial-nav">
                <motion.button
                  className="sim-tutorial-nav-btn"
                  disabled={tutorialStep === 0}
                  onClick={() => { setTutorialStep((s) => Math.max(0, s - 1)); playSfx('click'); }}
                  whileHover={{ scale: tutorialStep > 0 ? 1.1 : 1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <ChevronLeft size={12} />
                </motion.button>
                <span className="sim-tutorial-dots">
                  {tutorialSteps.map((_, i) => (
                    <motion.span
                      key={i}
                      className={`sim-tutorial-dot ${i === tutorialStep ? 'active' : ''}`}
                      animate={{ scale: i === tutorialStep ? 1.3 : 1 }}
                      transition={{ duration: 0.2 }}
                    />
                  ))}
                </span>
                <motion.button
                  className="sim-tutorial-nav-btn"
                  disabled={tutorialStep >= tutorialSteps.length - 1}
                  onClick={() => { setTutorialStep((s) => Math.min(tutorialSteps.length - 1, s + 1)); playSfx('beep'); }}
                  whileHover={{ scale: tutorialStep < tutorialSteps.length - 1 ? 1.1 : 1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <ChevronRight size={12} />
                </motion.button>
              </div>

              {/* Scoring breakdown */}
              <div className="sim-scoring">
                <div className="sim-scoring-label">{env.scoring.label}</div>
                {env.scoring.metrics.map((m) => (
                  <div key={m.name} className="sim-scoring-row">
                    <span className="sim-scoring-name">{m.name}</span>
                    <span className="sim-scoring-pts">{m.maxPoints}pts</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Score breakdown panel ── */}
        <AnimatePresence>
          {showScore && score != null && (
            <motion.div
              key="score-panel"
              className="sim-score-panel"
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.25 }}
            >
              <div className="sim-score-panel-head">
                <Trophy size={13} />
                <span>{env.scoring.label}</span>
                <motion.button
                  onClick={() => setShowScore(false)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X size={11} />
                </motion.button>
              </div>
              <div className="sim-score-total">
                <motion.span
                  key={score}
                  initial={{ scale: 1.3, color: '#ffd440' }}
                  animate={{ scale: 1, color: '#ffffff' }}
                  transition={{ duration: 0.4 }}
                >
                  {score}
                </motion.span>
                {maxScore != null && <span className="sim-score-max-lg">/ {maxScore}</span>}
              </div>
              {env.scoring.metrics.map((m) => (
                <div key={m.name} className="sim-score-metric">
                  <span className="sim-score-metric-name">{m.name}</span>
                  <div className="sim-score-metric-bar-track">
                    <motion.div
                      className="sim-score-metric-bar"
                      initial={{ width: 0 }}
                      animate={{ width: `${(m.maxPoints / (maxScore ?? 100)) * 100}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="sim-score-metric-pts">{m.maxPoints}</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
