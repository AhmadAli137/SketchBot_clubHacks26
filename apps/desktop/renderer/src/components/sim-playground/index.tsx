'use client';

/**
 * SimPlayground — Gazebo-like 3D + 2D simulation environment for SketchBot.
 *
 * Modes:
 *   '3d'    — full-width 3D perspective view with OrbitControls
 *   'split' — 3D view (70%) + 2D top-down overview (30%)
 *   '2d'    — full-width 2D overhead view
 *
 * The robot is a differential-drive wheeled robot (matching real SketchBot hardware).
 * It drives to each waypoint on the paper, rotating to face the next point.
 */

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Grid3X3, Pause, Play, RotateCcw, View } from 'lucide-react';

import { TopView } from './top-view';
import { useSimAnimation } from '@/lib/use-sim-animation';

const Scene3D = dynamic(() => import('./scene-3d').then((m) => ({ default: m.Scene3D })), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100%', height: '100%', background: '#050816', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'rgba(93,228,255,0.5)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
        Loading 3D engine…
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
};

// ─── Main component ───────────────────────────────────────────────────────────

export function SimPlayground({
  svgContent,
  isGenerating = false,
  className,
  style,
  onDrawComplete,
}: SimPlaygroundProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showCamera, setShowCamera] = useState(true);
  const [speed, setSpeed] = useState(1);

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
      </div>
    </div>
  );
}
