'use client';

/**
 * SimPlayground — Gazebo-like 3D + 2D simulation environment for SketchBot.
 * Each concept renders a unique 3D arena, tutorial panel, and live score overlay.
 */

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Grid3X3, Pause, Play, RotateCcw, View, BookOpen, ChevronRight, ChevronLeft, X, Trophy } from 'lucide-react';

import { TopView } from './top-view';
import { useSimAnimation } from '@/lib/use-sim-animation';
import { getEnvironment, getTutorialSteps } from '@/lib/concept-environments';
import { playBGM, stopBGM, playSfx } from '@/lib/game-audio';

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
}: SimPlaygroundProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showCamera, setShowCamera] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [showScore, setShowScore] = useState(false);

  const env = getEnvironment(conceptId);
  const tutorialSteps = getTutorialSteps(conceptId, activeLayer);

  // BGM: play concept theme, stop on unmount
  useEffect(() => {
    if (conceptId) playBGM(conceptId);
    else stopBGM();
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

  const hasDimensions = containerSize.w > 10 && containerSize.h > 10;
  const show3D = (viewMode === '3d' || viewMode === 'split') && hasDimensions;
  const show2D = viewMode === '2d' || viewMode === 'split';

  return (
    <div
      ref={containerRef}
      className={`sim-playground-root ${className ?? ''}`}
      style={style}
    >
      {/* ── Toolbar ── */}
      <div className="sim-playground-toolbar">
        {/* View mode switcher */}
        <div className="sim-toolbar-group">
          {(['3d', 'split', '2d'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`sim-toolbar-btn ${viewMode === mode ? 'active' : ''}`}
              onClick={() => setViewMode(mode)}
              title={mode === '3d' ? '3D view' : mode === 'split' ? 'Split view' : 'Top-down 2D'}
            >
              {mode === '3d' ? '3D' : mode === 'split' ? <View size={11} /> : '2D'}
            </button>
          ))}
        </div>

        {/* Scene toggles */}
        <div className="sim-toolbar-group">
          <button
            type="button"
            className={`sim-toolbar-btn ${showGrid ? 'active' : ''}`}
            onClick={() => setShowGrid((v) => !v)}
            title="Toggle grid"
          >
            <Grid3X3 size={11} />
          </button>
          <button
            type="button"
            className={`sim-toolbar-btn ${showAxes ? 'active' : ''}`}
            onClick={() => setShowAxes((v) => !v)}
            title="Toggle axes"
          >
            XYZ
          </button>
          <button
            type="button"
            className={`sim-toolbar-btn ${showCamera ? 'active' : ''}`}
            onClick={() => setShowCamera((v) => !v)}
            title="Toggle overhead camera"
          >
            CAM
          </button>
        </div>

        {/* Speed control */}
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

        {/* Status + replay */}
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
      </div>

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

      {/* ── Viewport area ── */}
      <div className="sim-playground-viewport">
        {/* 3D view */}
        {show3D && (
          <div
            className="sim-3d-pane"
            style={{ flex: viewMode === 'split' ? '0 0 68%' : '1' }}
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
            />
            <div className="sim-3d-hint">Drag to orbit · Scroll to zoom · Right-drag to pan</div>
          </div>
        )}

        {/* 2D top-down view */}
        {show2D && (
          <div
            ref={topViewRef}
            className="sim-2d-pane"
            style={{ flex: viewMode === 'split' ? '0 0 32%' : '1' }}
          >
            <div className="sim-2d-label">Top View</div>
            <TopView
              settledLines={settledLines}
              activeLine={activeLine}
              penPos={penPos}
              isAnimating={isAnimating}
              width={topViewSize.w || 300}
              height={topViewSize.h || 400}
            />
          </div>
        )}

        {/* Empty state */}
        {!svgContent && !isGenerating && (
          <div className="sim-empty-overlay">
            <div className="sim-empty-icon">🤖</div>
            <div className="sim-empty-title">3D Simulator Ready</div>
            <div className="sim-empty-body">
              Generate a drawing from the prompt bar — the SketchBot robot will drive it live in 3D.
            </div>
          </div>
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
