'use client';

import { CSSProperties, useEffect, useRef, useState } from 'react';
import { Grid3X3, RotateCcw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Point = { x: number; y: number };

type PathSegment = {
  points: Point[];
  penDown: boolean;
};

type SimulatorCanvasProps = {
  svgContent: string | null;   // Raw SVG markup to animate
  isGenerating?: boolean;       // Show composing shimmer
  showGrid?: boolean;
  robotSpeedMmPerSec?: number;  // Used to compute animation duration
  canvasWidthMm?: number;
  canvasHeightMm?: number;
  className?: string;
  style?: CSSProperties;
  onDrawComplete?: () => void;
};

// ─── SVG path extractor ───────────────────────────────────────────────────────
// Parse SVG markup into a flat list of path segments for animation.

function parseSvgPaths(svgContent: string): PathSegment[] {
  if (typeof window === 'undefined') return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const pathEls = doc.querySelectorAll('path, polyline, polygon, line, rect, circle, ellipse');
    if (!pathEls.length) return [];

    const segments: PathSegment[] = [];

    pathEls.forEach((el) => {
      // Create a temporary SVG to measure the path
      const svgNS = 'http://www.w3.org/2000/svg';
      const tempSvg = document.createElementNS(svgNS, 'svg');
      const cloned = el.cloneNode(true) as SVGElement;
      tempSvg.appendChild(cloned);
      document.body.appendChild(tempSvg);

      try {
        // Convert to path element for uniform handling
        let pathEl: SVGGeometryElement | null = null;

        if (el.tagName === 'path') {
          pathEl = cloned as SVGPathElement;
        } else {
          // For other shapes, attempt to get geometry via getBBox sampling
          pathEl = cloned as SVGGeometryElement;
        }

        if (!pathEl || typeof (pathEl as SVGPathElement).getTotalLength !== 'function') return;

        const totalLength = (pathEl as SVGPathElement).getTotalLength();
        if (!totalLength || totalLength <= 0) return;

        const sampleCount = Math.max(10, Math.min(200, Math.round(totalLength / 3)));
        const points: Point[] = [];

        for (let i = 0; i <= sampleCount; i++) {
          const t = (i / sampleCount) * totalLength;
          const pt = (pathEl as SVGPathElement).getPointAtLength(t);
          points.push({ x: pt.x, y: pt.y });
        }

        if (points.length >= 2) {
          segments.push({ points, penDown: true });
        }
      } finally {
        document.body.removeChild(tempSvg);
      }
    });

    return segments;
  } catch {
    return [];
  }
}

// ─── Normalize points to fit within [0,1] box ─────────────────────────────────

function normalizeSegments(segments: PathSegment[]): PathSegment[] {
  const allPoints = segments.flatMap((s) => s.points);
  if (!allPoints.length) return segments;

  const minX = Math.min(...allPoints.map((p) => p.x));
  const maxX = Math.max(...allPoints.map((p) => p.x));
  const minY = Math.min(...allPoints.map((p) => p.y));
  const maxY = Math.max(...allPoints.map((p) => p.y));

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const range = Math.max(rangeX, rangeY);
  const padFactor = 0.1;
  const padded = range * (1 + padFactor * 2);

  return segments.map((seg) => ({
    ...seg,
    points: seg.points.map((p) => ({
      x: ((p.x - minX) / padded) + (padFactor * range) / padded,
      y: ((p.y - minY) / padded) + (padFactor * range) / padded,
    })),
  }));
}

// ─── Easing ───────────────────────────────────────────────────────────────────

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SimulatorCanvas({
  svgContent,
  isGenerating = false,
  showGrid: showGridProp = true,
  robotSpeedMmPerSec = 60,
  canvasWidthMm = 297,
  canvasHeightMm = 210,
  className,
  style,
  onDrawComplete,
}: SimulatorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [segments, setSegments] = useState<PathSegment[]>([]);
  const [penPos, setPenPos] = useState<Point | null>(null);
  const [settledLines, setSettledLines] = useState<Point[][]>([]);  // fully drawn paths
  const [activeLine, setActiveLine] = useState<Point[]>([]);         // path currently being drawn
  const [isAnimating, setIsAnimating] = useState(false);
  const [showGrid, setShowGrid] = useState(showGridProp);
  const [isComplete, setIsComplete] = useState(false);

  // Measure container
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const obs = new ResizeObserver(() => {
      const r = node.getBoundingClientRect();
      setContainerSize({ w: r.width, h: r.height });
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  // Parse SVG when content changes
  useEffect(() => {
    if (!svgContent) {
      setSegments([]);
      setPenPos(null);
      setSettledLines([]);
      setActiveLine([]);
      setIsComplete(false);
      return;
    }

    const raw = parseSvgPaths(svgContent);
    const normalized = normalizeSegments(raw);
    setSegments(normalized);
    setPenPos(null);
    setSettledLines([]);
    setActiveLine([]);
    setIsComplete(false);
  }, [svgContent]);

  // Animate when segments + container are ready
  useEffect(() => {
    if (!segments.length || !containerSize.w || !containerSize.h) return;

    // Cancel any ongoing animation
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const { w, h } = containerSize;

    // Flatten all points into a single draw sequence
    const allPoints: Array<{ pt: Point; segIdx: number }> = [];
    segments.forEach((seg, si) => {
      seg.points.forEach((pt) => allPoints.push({ pt, segIdx: si }));
    });

    if (!allPoints.length) return;

    // Estimate total "distance" for timing
    let totalDist = 0;
    for (let i = 1; i < allPoints.length; i++) {
      const a = allPoints[i - 1].pt;
      const b = allPoints[i].pt;
      totalDist += Math.hypot((b.x - a.x) * w, (b.y - a.y) * h);
    }

    // Convert distance to time: speed is in mm/s, 1px ~ 1mm at display scale
    const durationMs = (totalDist / robotSpeedMmPerSec) * 1000;
    const clampedDuration = Math.max(1500, Math.min(durationMs, 12000));

    setIsAnimating(true);
    startTimeRef.current = null;

    const animate = (ts: number) => {
      if (startTimeRef.current === null) startTimeRef.current = ts;
      const elapsed = ts - startTimeRef.current;
      const rawProgress = Math.min(elapsed / clampedDuration, 1);
      const progress = easeInOutCubic(rawProgress);

      const targetIdx = Math.floor(progress * (allPoints.length - 1));

      // Split into settled lines (completed segments) and the active line
      const newSettled: Point[][] = [];
      let currentLine: Point[] = [];
      let lastSegIdx = -1;

      for (let i = 0; i <= targetIdx; i++) {
        const { pt, segIdx } = allPoints[i];
        if (segIdx !== lastSegIdx && currentLine.length > 0) {
          newSettled.push([...currentLine]);
          currentLine = [];
        }
        currentLine.push(pt);
        lastSegIdx = segIdx;
      }

      // The last segment currently being drawn stays as activeLine
      const nextActive = currentLine;
      setSettledLines(newSettled);
      setActiveLine(nextActive);

      setPenPos(allPoints[targetIdx].pt);

      if (rawProgress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete — settle the active line too
        setSettledLines([...newSettled, nextActive]);
        setActiveLine([]);
        setIsAnimating(false);
        setIsComplete(true);
        onDrawComplete?.();
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    };
  }, [segments, containerSize, robotSpeedMmPerSec, onDrawComplete]);

  const { w, h } = containerSize;

  // Paper aspect ratio
  const paperAspect = canvasWidthMm / canvasHeightMm;
  let paperW = w * 0.82;
  let paperH = paperW / paperAspect;
  if (paperH > h * 0.82) {
    paperH = h * 0.82;
    paperW = paperH * paperAspect;
  }
  const paperLeft = (w - paperW) / 2;
  const paperTop = (h - paperH) / 2;

  return (
    <div ref={containerRef} className={`simulator-root ${className ?? ''}`} style={style}>
      {containerSize.w > 0 && (
        <>
          {/* Paper surface */}
          <div
            className="simulator-paper"
            style={{ position: 'absolute', left: paperLeft, top: paperTop, width: paperW, height: paperH }}
          >
            {/* Grid overlay */}
            {showGrid && <div className="simulator-grid" />}

            {/* SVG drawing layer */}
            <svg
              ref={svgRef}
              className="simulator-svg"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              style={{ width: paperW, height: paperH }}
            >
              <defs>
                <filter id="sim-ink-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="0.006" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="sim-ink-settled" x="-10%" y="-10%" width="120%" height="120%">
                  <feGaussianBlur stdDeviation="0.002" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Settled / completed paths — slightly dimmer ink */}
              {settledLines.map((line, i) => (
                <polyline
                  key={`settled-${i}`}
                  points={line.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="rgba(93,228,255,0.72)"
                  strokeWidth={1.4 / Math.max(paperW, 1)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#sim-ink-settled)"
                />
              ))}

              {/* Active / currently-drawing path — full glow */}
              {activeLine.length > 1 && (
                <polyline
                  points={activeLine.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="rgba(93,228,255,1)"
                  strokeWidth={2 / Math.max(paperW, 1)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#sim-ink-glow)"
                />
              )}
            </svg>

            {/* Pen cursor with pulsing ring */}
            {penPos && isAnimating && (
              <div
                className="simulator-pen-cursor"
                style={{
                  left: penPos.x * paperW,
                  top: penPos.y * paperH,
                }}
              >
                <div className="simulator-pen-ring" />
              </div>
            )}

            {/* Empty state */}
            {!svgContent && !isGenerating && (
              <div className="simulator-empty" style={{ position: 'absolute', inset: 0 }}>
                <div className="simulator-empty-icon">✏️</div>
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--muted)' }}>
                  Your drawing will appear here
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--muted)', opacity: 0.7 }}>
                  Type a prompt below and hit Generate
                </div>
              </div>
            )}

            {/* Generating shimmer */}
            {isGenerating && (
              <div
                style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 8, flexDirection: 'column',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 12,
                  background: 'rgba(93,228,255,0.08)',
                  border: '1px solid rgba(93,228,255,0.16)',
                  display: 'grid', placeItems: 'center', color: 'var(--cyan)',
                  animation: 'r-pulse 1.2s infinite',
                }}>
                  ✏️
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 600 }}>
                  Generating…
                </div>
              </div>
            )}
          </div>

          {/* Simulator badge */}
          <div className="simulator-badge">
            <div className={`simulator-badge-dot ${isAnimating ? '' : 'offline'}`} />
            {isAnimating ? 'Drawing…' : isComplete ? 'Done' : 'Simulator'}
          </div>

          {/* Controls */}
          <div className="simulator-controls">
            <button
              type="button"
              className="simulator-control-btn"
              onClick={() => setShowGrid((g) => !g)}
            >
              <Grid3X3 size={11} />
              Grid
            </button>
            {isComplete && (
              <button
                type="button"
                className="simulator-control-btn"
                onClick={() => {
                  setSettledLines([]);
                  setActiveLine([]);
                  setPenPos(null);
                  setIsComplete(false);
                  setSegments((s) => [...s]);
                }}
              >
                <RotateCcw size={11} />
                Replay
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
