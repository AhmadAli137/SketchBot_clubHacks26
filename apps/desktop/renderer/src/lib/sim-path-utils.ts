/**
 * Shared SVG path parsing utilities for the 2D and 3D simulators.
 * Extracts point sequences from SVG markup and normalizes them to [0, 1] space.
 */

export type SimPoint = { x: number; y: number };
export type SimPathSegment = { points: SimPoint[]; penDown: boolean };

// ─── Parse SVG markup into path segments ─────────────────────────────────────

export function parseSvgPaths(svgContent: string): SimPathSegment[] {
  if (typeof window === 'undefined') return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const els = doc.querySelectorAll('path, polyline, polygon, line, rect, circle, ellipse');
    if (!els.length) return [];

    const segments: SimPathSegment[] = [];
    const svgNS = 'http://www.w3.org/2000/svg';

    els.forEach((el) => {
      const tempSvg = document.createElementNS(svgNS, 'svg');
      const cloned = el.cloneNode(true) as SVGElement;
      tempSvg.appendChild(cloned);
      document.body.appendChild(tempSvg);

      try {
        const pathEl = cloned as SVGGeometryElement;
        if (typeof (pathEl as SVGPathElement).getTotalLength !== 'function') return;

        const totalLength = (pathEl as SVGPathElement).getTotalLength();
        if (!totalLength || totalLength <= 0) return;

        const sampleCount = Math.max(12, Math.min(250, Math.round(totalLength / 2.5)));
        const points: SimPoint[] = [];

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

// ─── Normalize all points to fit within [0, 1] with padding ──────────────────

export function normalizeSegments(segments: SimPathSegment[]): SimPathSegment[] {
  const allPoints = segments.flatMap((s) => s.points);
  if (!allPoints.length) return segments;

  const minX = Math.min(...allPoints.map((p) => p.x));
  const maxX = Math.max(...allPoints.map((p) => p.x));
  const minY = Math.min(...allPoints.map((p) => p.y));
  const maxY = Math.max(...allPoints.map((p) => p.y));

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const range = Math.max(rangeX, rangeY);
  const pad = 0.1;
  const padded = range * (1 + pad * 2);

  return segments.map((seg) => ({
    ...seg,
    points: seg.points.map((p) => ({
      x: (p.x - minX) / padded + (pad * range) / padded,
      y: (p.y - minY) / padded + (pad * range) / padded,
    })),
  }));
}

// ─── Map normalized [0, 1] point to 3D canvas coordinates ───────────────────
// Canvas sits on the XZ plane (Y = 0). X = left–right, Z = front–back.

export const CANVAS_W = 2.97;  // A4 width in scene units
export const CANVAS_H = 2.10;  // A4 height in scene units
export const INK_Y    = 0.012; // height of ink above canvas surface

export function normTo3D(p: SimPoint): [number, number, number] {
  return [
    (p.x - 0.5) * CANVAS_W,
    INK_Y,
    (p.y - 0.5) * CANVAS_H,
  ];
}
