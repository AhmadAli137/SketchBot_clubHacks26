'use client';

/**
 * useSimAnimation — animation engine for the 2D and 3D simulators.
 *
 * Parses SVG content into normalized path segments, then drives a "pen position"
 * through them using requestAnimationFrame. Fully controllable: play, pause,
 * seek (scrub), and replay.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseSvgPaths, normalizeSegments } from './sim-path-utils';
import type { SimPoint, SimPathSegment } from './sim-path-utils';

export type { SimPoint };

// ~60 mm/s on A4: crossing the full normalized [0,1] width takes 5 s at 1×.
const BASE_DURATION_PER_UNIT = 5_000; // ms per normalized unit

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function buildSegmentLengths(segs: SimPathSegment[]): number[] {
  return segs.map((seg) => {
    let len = 0;
    for (let i = 1; i < seg.points.length; i++) {
      const dx = seg.points[i].x - seg.points[i - 1].x;
      const dy = seg.points[i].y - seg.points[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  });
}

function interpolateAlongSegment(seg: SimPathSegment, fracOfLength: number): SimPoint {
  const pts = seg.points;
  if (!pts.length) return { x: 0, y: 0 };
  if (fracOfLength <= 0) return pts[0];
  if (fracOfLength >= 1) return pts[pts.length - 1];

  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    totalLen += Math.sqrt(dx * dx + dy * dy);
  }
  const target = fracOfLength * totalLen;
  let accumulated = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (accumulated + d >= target) {
      const f = d > 0 ? (target - accumulated) / d : 0;
      return { x: pts[i - 1].x + f * dx, y: pts[i - 1].y + f * dy };
    }
    accumulated += d;
  }
  return pts[pts.length - 1];
}

/** Resolve visual state from global progress t ∈ [0,1]. */
function resolveFrame(
  segs: SimPathSegment[],
  segLengths: number[],
  totalLen: number,
  t: number,
): { settled: SimPoint[][]; active: SimPoint[]; pen: SimPoint | null } {
  if (!segs.length || totalLen === 0) return { settled: [], active: [], pen: null };

  const targetDist = t * totalLen;
  let accumulated = 0;

  for (let s = 0; s < segs.length; s++) {
    const segLen = segLengths[s];
    if (accumulated + segLen <= targetDist || s === segs.length - 1 && t >= 1) {
      // Segment fully drawn
      accumulated += segLen;
      continue;
    }

    // Currently drawing into segment s
    const settled = segs.slice(0, s).map((seg) => seg.points);
    const fracInto = segLen > 0 ? (targetDist - accumulated) / segLen : 0;
    const pen = interpolateAlongSegment(segs[s], fracInto);

    // Build active line up to pen
    const pts = segs[s].points;
    const activeTarget = fracInto * segLen;
    const active: SimPoint[] = [];
    let walked = 0;
    active.push(pts[0]);
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (walked + d >= activeTarget) {
        active.push(pen);
        break;
      }
      walked += d;
      active.push(pts[i]);
    }

    return { settled, active, pen };
  }

  // All done
  return {
    settled: segs.map((s) => s.points),
    active: [],
    pen: segs[segs.length - 1].points.at(-1) ?? null,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

type Options = {
  svgContent: string | null;
  speedMultiplier?: number;
  onComplete?: () => void;
};

type Result = {
  penPos: SimPoint | null;
  settledLines: SimPoint[][];
  activeLine: SimPoint[];
  isAnimating: boolean;
  isComplete: boolean;
  segments: SimPathSegment[];
  progress: number;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  replay: () => void;
};

export function useSimAnimation({ svgContent, speedMultiplier = 1, onComplete }: Options): Result {
  const [segments, setSegments] = useState<SimPathSegment[]>([]);
  const [penPos, setPenPos] = useState<SimPoint | null>(null);
  const [settledLines, setSettledLines] = useState<SimPoint[][]>([]);
  const [activeLine, setActiveLine] = useState<SimPoint[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [progress, setProgress] = useState(0);

  const segsRef = useRef<SimPathSegment[]>([]);
  const segLengthsRef = useRef<number[]>([]);
  const totalLenRef = useRef(0);
  const progressRef = useRef(0);
  const isPlayingRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const startProgressRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const speedRef = useRef(speedMultiplier);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => { speedRef.current = speedMultiplier; }, [speedMultiplier]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const applyFrame = useCallback((t: number) => {
    const frame = resolveFrame(segsRef.current, segLengthsRef.current, totalLenRef.current, t);
    setSettledLines(frame.settled);
    setActiveLine(frame.active);
    setPenPos(frame.pen);
    setProgress(t);
    progressRef.current = t;
  }, []);

  const startRaf = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      if (!isPlayingRef.current) return;
      if (startTimeRef.current === null) {
        startTimeRef.current = now;
        startProgressRef.current = progressRef.current;
      }

      const total = totalLenRef.current;
      const speed = speedRef.current;
      const fullDuration = total * BASE_DURATION_PER_UNIT / Math.max(0.1, speed);
      const remaining = (1 - startProgressRef.current) * fullDuration;
      const elapsed = now - startTimeRef.current;
      const localT = remaining > 0 ? Math.min(elapsed / remaining, 1) : 1;
      const globalT = Math.min(
        startProgressRef.current + easeInOutCubic(localT) * (1 - startProgressRef.current),
        1,
      );

      applyFrame(globalT);

      if (globalT >= 1) {
        isPlayingRef.current = false;
        setIsAnimating(false);
        setIsComplete(true);
        onCompleteRef.current?.();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [applyFrame]);

  // Parse SVG when content changes
  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    isPlayingRef.current = false;

    if (!svgContent) {
      segsRef.current = [];
      segLengthsRef.current = [];
      totalLenRef.current = 0;
      progressRef.current = 0;
      startProgressRef.current = 0;
      setSegments([]);
      setPenPos(null);
      setSettledLines([]);
      setActiveLine([]);
      setIsAnimating(false);
      setIsComplete(false);
      setProgress(0);
      return;
    }

    const raw = parseSvgPaths(svgContent);
    const normalized = normalizeSegments(raw);
    const lengths = buildSegmentLengths(normalized);
    const total = lengths.reduce((s, l) => s + l, 0);

    segsRef.current = normalized;
    segLengthsRef.current = lengths;
    totalLenRef.current = total;
    progressRef.current = 0;
    startProgressRef.current = 0;
    startTimeRef.current = null;

    setSegments(normalized);
    setPenPos(normalized[0]?.points[0] ?? null);
    setSettledLines([]);
    setActiveLine([]);
    setIsComplete(false);
    setProgress(0);

    if (normalized.length > 0) {
      isPlayingRef.current = true;
      setIsAnimating(true);
      startRaf();
    }
  }, [svgContent, startRaf]);

  const play = useCallback(() => {
    if (isPlayingRef.current) return;
    if (progressRef.current >= 1) return;
    isPlayingRef.current = true;
    startTimeRef.current = null;
    setIsAnimating(true);
    setIsComplete(false);
    startRaf();
  }, [startRaf]);

  const pause = useCallback(() => {
    if (!isPlayingRef.current) return;
    isPlayingRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    setIsAnimating(false);
  }, []);

  const seek = useCallback((t: number) => {
    const clamped = Math.max(0, Math.min(1, t));
    isPlayingRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    startTimeRef.current = null;
    startProgressRef.current = clamped;
    setIsAnimating(false);
    applyFrame(clamped);
    if (clamped >= 1) {
      setIsComplete(true);
    } else {
      setIsComplete(false);
    }
  }, [applyFrame]);

  const replay = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    progressRef.current = 0;
    startProgressRef.current = 0;
    startTimeRef.current = null;
    isPlayingRef.current = true;
    setProgress(0);
    setSettledLines([]);
    setActiveLine([]);
    setPenPos(segsRef.current[0]?.points[0] ?? null);
    setIsComplete(false);
    setIsAnimating(true);
    startRaf();
  }, [startRaf]);

  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  return { penPos, settledLines, activeLine, isAnimating, isComplete, segments, progress, play, pause, seek, replay };
}
