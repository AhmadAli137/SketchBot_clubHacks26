/**
 * Shared animation hook for both the 2D SimulatorCanvas and the 3D SimPlayground.
 * Parses SVG content into path segments and drives a frame-accurate animation loop.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseSvgPaths, normalizeSegments } from '@/lib/sim-path-utils';
import type { SimPoint, SimPathSegment } from '@/lib/sim-path-utils';

export type { SimPoint, SimPathSegment };

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

type UseSimAnimationOptions = {
  svgContent: string | null;
  speedMultiplier?: number;  // 1 = normal robot speed (~60mm/s)
  onComplete?: () => void;
};

export type SimAnimationState = {
  penPos: SimPoint | null;
  settledLines: SimPoint[][];
  activeLine: SimPoint[];
  isAnimating: boolean;
  isComplete: boolean;
  segments: SimPathSegment[];
  replay: () => void;
};

export function useSimAnimation({
  svgContent,
  speedMultiplier = 1,
  onComplete,
}: UseSimAnimationOptions): SimAnimationState {
  const [segments, setSegments] = useState<SimPathSegment[]>([]);
  const [penPos, setPenPos] = useState<SimPoint | null>(null);
  const [settledLines, setSettledLines] = useState<SimPoint[][]>([]);
  const [activeLine, setActiveLine] = useState<SimPoint[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Parse SVG → segments whenever content changes
  useEffect(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (!svgContent) {
      setSegments([]);
      setPenPos(null);
      setSettledLines([]);
      setActiveLine([]);
      setIsAnimating(false);
      setIsComplete(false);
      return;
    }

    const raw = parseSvgPaths(svgContent);
    const normalized = normalizeSegments(raw);
    setSegments(normalized);
    setPenPos(null);
    setSettledLines([]);
    setActiveLine([]);
    setIsAnimating(false);
    setIsComplete(false);
  }, [svgContent]);

  // Drive the animation when segments are ready
  useEffect(() => {
    if (!segments.length) return;

    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
    }

    // Flatten all segment points into a single sequence
    const allPoints: Array<{ pt: SimPoint; segIdx: number }> = [];
    segments.forEach((seg, si) => {
      seg.points.forEach((pt) => allPoints.push({ pt, segIdx: si }));
    });
    if (!allPoints.length) return;

    // Compute total path distance (in normalized space)
    let totalDist = 0;
    for (let i = 1; i < allPoints.length; i++) {
      const a = allPoints[i - 1].pt;
      const b = allPoints[i].pt;
      totalDist += Math.hypot(b.x - a.x, b.y - a.y);
    }

    // Duration: traverse ~1 unit in 5 seconds at normal speed
    const baseDurationMs = (totalDist * 5000) / Math.max(speedMultiplier, 0.1);
    const clampedDuration = Math.max(1500, Math.min(baseDurationMs, 20000));

    setIsAnimating(true);
    setIsComplete(false);
    startTimeRef.current = null;

    const animate = (ts: number) => {
      if (startTimeRef.current === null) startTimeRef.current = ts;
      const rawProgress = Math.min((ts - startTimeRef.current) / clampedDuration, 1);
      const progress = easeInOutCubic(rawProgress);
      const targetIdx = Math.floor(progress * (allPoints.length - 1));

      // Split into completed (settled) segments and the actively-drawing segment
      const newSettled: SimPoint[][] = [];
      let currentLine: SimPoint[] = [];
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

      const nextActive = currentLine;
      setSettledLines(newSettled);
      setActiveLine(nextActive);
      setPenPos(allPoints[targetIdx].pt);

      if (rawProgress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setSettledLines([...newSettled, nextActive]);
        setActiveLine([]);
        setIsAnimating(false);
        setIsComplete(true);
        onCompleteRef.current?.();
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [segments, speedMultiplier]);

  const replay = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setSettledLines([]);
    setActiveLine([]);
    setPenPos(null);
    setIsComplete(false);
    setSegments((s) => [...s]); // re-trigger animation effect
  }, []);

  return { penPos, settledLines, activeLine, isAnimating, isComplete, segments, replay };
}
