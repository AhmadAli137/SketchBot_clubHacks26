'use client';

/**
 * TopView — 2D orthographic overhead view of the workspace.
 *
 * Two modes:
 *  - 'drawing'  → paper, drawn paths, robot footprint, coordinate grid
 *  - 'sandbox'  → user-placed scene objects on a metric grid (mirrors 3D)
 *
 * Rendered with plain Canvas2D for snappiness.
 */

import { useEffect, useRef } from 'react';

import type { SimPoint } from '@/lib/sim-path-utils';
import { CANVAS_W, CANVAS_H } from '@/lib/sim-path-utils';
import { GRID_SIZE, type SceneObject } from '@/lib/scene-builder';

type Props = {
  settledLines: SimPoint[][];
  activeLine: SimPoint[];
  penPos: SimPoint | null;
  isAnimating: boolean;
  width: number;
  height: number;
  /** When 'sandbox', renders user-placed scene objects on a metric grid. */
  mode?: 'drawing' | 'sandbox';
  sceneObjects?: SceneObject[];
};

// Map normalized [0,1] coords to canvas2D pixel coords
function toPixel(
  norm: SimPoint,
  paperLeft: number,
  paperTop: number,
  paperW: number,
  paperH: number,
): { px: number; py: number } {
  return {
    px: paperLeft + norm.x * paperW,
    py: paperTop + norm.y * paperH,
  };
}

export function TopView({ settledLines, activeLine, penPos, isAnimating, width, height, mode = 'drawing', sceneObjects = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 10 || height < 10) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── Panel backdrop ──
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#0a1430');
    bg.addColorStop(0.45, '#060a18');
    bg.addColorStop(1, '#04060f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Subtle vignette
    const vignette = ctx.createRadialGradient(
      width * 0.5,
      height * 0.45,
      Math.min(width, height) * 0.15,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.75,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // ── Sandbox mode: render scene objects on a metric grid ──
    if (mode === 'sandbox') {
      drawSandboxTopView(ctx, width, height, sceneObjects);
      return;
    }

    // ── Compute paper rect (letterboxed) ──
    const aspect = CANVAS_W / CANVAS_H;
    const margin = 24;
    let paperW = width - margin * 2;
    let paperH = paperW / aspect;
    if (paperH > height - margin * 2) {
      paperH = height - margin * 2;
      paperW = paperH * aspect;
    }
    const paperLeft = (width - paperW) / 2;
    const paperTop = (height - paperH) / 2;

    // ── Paper background (rounded) ──
    const cornerR = Math.min(10, paperW * 0.02);
    ctx.fillStyle = '#f2eee6';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.roundRect(paperLeft, paperTop, paperW, paperH, cornerR);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Inner warm lift
    const inner = ctx.createLinearGradient(paperLeft, paperTop, paperLeft + paperW, paperTop + paperH);
    inner.addColorStop(0, 'rgba(255,255,255,0.14)');
    inner.addColorStop(0.5, 'rgba(255,255,255,0)');
    inner.addColorStop(1, 'rgba(180,170,150,0.06)');
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.roundRect(paperLeft, paperTop, paperW, paperH, cornerR);
    ctx.fill();

    // ── Paper grid (clipped to rounded sheet) ──
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(paperLeft, paperTop, paperW, paperH, cornerR);
    ctx.clip();
    ctx.strokeStyle = 'rgba(95, 115, 190, 0.16)';
    ctx.lineWidth = 0.5;
    const gridCols = 6;
    const gridRows = 4;
    for (let c = 1; c < gridCols; c++) {
      const x = paperLeft + (c / gridCols) * paperW;
      ctx.beginPath();
      ctx.moveTo(x, paperTop);
      ctx.lineTo(x, paperTop + paperH);
      ctx.stroke();
    }
    for (let r = 1; r < gridRows; r++) {
      const y = paperTop + (r / gridRows) * paperH;
      ctx.beginPath();
      ctx.moveTo(paperLeft, y);
      ctx.lineTo(paperLeft + paperW, y);
      ctx.stroke();
    }
    ctx.restore();

    // ── Paper border ──
    ctx.strokeStyle = 'rgba(120,110,95,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(paperLeft, paperTop, paperW, paperH, cornerR);
    ctx.stroke();

    // ── AprilTag corners ──
    const tagSize = Math.min(paperW, paperH) * 0.07;
    const corners: [number, number][] = [
      [paperLeft + tagSize * 0.5, paperTop + tagSize * 0.5],
      [paperLeft + paperW - tagSize * 0.5, paperTop + tagSize * 0.5],
      [paperLeft + tagSize * 0.5, paperTop + paperH - tagSize * 0.5],
      [paperLeft + paperW - tagSize * 0.5, paperTop + paperH - tagSize * 0.5],
    ];
    corners.forEach(([cx, cy]) => {
      ctx.fillStyle = '#111';
      ctx.fillRect(cx - tagSize / 2, cy - tagSize / 2, tagSize, tagSize);
      ctx.fillStyle = '#eeeae0';
      ctx.fillRect(cx - tagSize * 0.3, cy - tagSize * 0.3, tagSize * 0.6, tagSize * 0.6);
      ctx.fillStyle = '#111';
      ctx.fillRect(cx - tagSize * 0.1, cy - tagSize * 0.1, tagSize * 0.2, tagSize * 0.2);
    });

    // ── Coordinate labels ──
    ctx.font = `bold ${Math.max(9, paperW * 0.032)}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = 'rgba(93,228,255,0.55)';
    ctx.textAlign = 'center';
    // X axis label
    ctx.fillText('X →', paperLeft + paperW + 18, paperTop + paperH + 14);
    // Y axis label
    ctx.save();
    ctx.translate(paperLeft - 14, paperTop + paperH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Y →', 0, 0);
    ctx.restore();

    // ── Tick marks ──
    ctx.strokeStyle = 'rgba(93,228,255,0.25)';
    ctx.lineWidth = 0.7;
    for (let c = 0; c <= gridCols; c++) {
      const x = paperLeft + (c / gridCols) * paperW;
      ctx.beginPath();
      ctx.moveTo(x, paperTop + paperH);
      ctx.lineTo(x, paperTop + paperH + 5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(93,228,255,0.4)';
      ctx.font = `${Math.max(8, paperW * 0.024)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round((c / gridCols) * 297)}`, x, paperTop + paperH + 14);
    }

    // ── Settled ink paths ──
    settledLines.forEach((line) => {
      if (line.length < 2) return;
      ctx.beginPath();
      const start = toPixel(line[0], paperLeft, paperTop, paperW, paperH);
      ctx.moveTo(start.px, start.py);
      for (let i = 1; i < line.length; i++) {
        const p = toPixel(line[i], paperLeft, paperTop, paperW, paperH);
        ctx.lineTo(p.px, p.py);
      }
      ctx.strokeStyle = 'rgba(100, 220, 255, 0.72)';
      ctx.lineWidth = 1.65;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    });

    // ── Active / drawing path ──
    if (activeLine.length >= 2) {
      ctx.beginPath();
      const start = toPixel(activeLine[0], paperLeft, paperTop, paperW, paperH);
      ctx.moveTo(start.px, start.py);
      for (let i = 1; i < activeLine.length; i++) {
        const p = toPixel(activeLine[i], paperLeft, paperTop, paperW, paperH);
        ctx.lineTo(p.px, p.py);
      }
      ctx.strokeStyle = 'rgba(124, 240, 255, 1)';
      ctx.lineWidth = 2.35;
      ctx.shadowColor = 'rgba(93,228,255,0.55)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // ── Robot footprint (scaled to match 4× smaller 3D model) ──
    if (penPos) {
      const { px, py } = toPixel(penPos, paperLeft, paperTop, paperW, paperH);
      const robotW = paperW * 0.025;
      const robotH = paperH * 0.03;

      // Body
      ctx.fillStyle = 'rgba(30,30,40,0.92)';
      ctx.strokeStyle = 'rgba(93,228,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(93,228,255,0.35)';
      ctx.shadowBlur = 8;
      const rx = px - robotW / 2;
      const ry = py - robotH / 2;
      const rr = 3;
      ctx.beginPath();
      ctx.moveTo(rx + rr, ry);
      ctx.lineTo(rx + robotW - rr, ry);
      ctx.arcTo(rx + robotW, ry, rx + robotW, ry + rr, rr);
      ctx.lineTo(rx + robotW, ry + robotH - rr);
      ctx.arcTo(rx + robotW, ry + robotH, rx + robotW - rr, ry + robotH, rr);
      ctx.lineTo(rx + rr, ry + robotH);
      ctx.arcTo(rx, ry + robotH, rx, ry + robotH - rr, rr);
      ctx.lineTo(rx, ry + rr);
      ctx.arcTo(rx, ry, rx + rr, ry, rr);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Direction arrow (pointing forward = toward smaller y = toward top by default)
      ctx.strokeStyle = 'rgba(93,228,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - robotH * 0.45);
      ctx.stroke();

      // Pen tip dot
      if (isAnimating) {
        ctx.fillStyle = '#5de4ff';
        ctx.shadowColor = '#5de4ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(px - robotW * 0.28, py - robotH * 0.38, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Coordinate readout
      const xMm = Math.round(penPos.x * 297);
      const yMm = Math.round(penPos.y * 210);
      ctx.font = `bold ${Math.max(9, paperW * 0.032)}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = 'rgba(93,228,255,0.9)';
      ctx.textAlign = 'left';
      ctx.fillText(`X:${xMm} Y:${yMm} mm`, paperLeft + 4, paperTop + paperH - 5);
    }

  }, [settledLines, activeLine, penPos, isAnimating, width, height, mode, sceneObjects]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  );
}

// ─── Sandbox top-down renderer ───────────────────────────────────────────────

function drawSandboxTopView(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  objects: SceneObject[],
) {
  // Auto-fit: compute world bbox of placed objects, default to ±2 m.
  const margin = 24;
  const baseHalf = 2.0;
  let half = baseHalf;
  if (objects.length > 0) {
    let max = 0;
    for (const o of objects) {
      max = Math.max(max, Math.abs(o.gx * GRID_SIZE), Math.abs(o.gz * GRID_SIZE));
    }
    half = Math.max(baseHalf, max + 0.5);
  }

  const scale = Math.min(
    (width  - margin * 2) / (half * 2),
    (height - margin * 2) / (half * 2),
  );
  const cx = width  / 2;
  const cy = height / 2;
  const m2px = (mx: number, mz: number) => ({ px: cx + mx * scale, py: cy + mz * scale });

  // ── Minor grid (0.25 m) ──
  ctx.strokeStyle = 'rgba(120,140,255,0.07)';
  ctx.lineWidth = 0.6;
  const minStep = GRID_SIZE;
  const minHalf = Math.ceil(half / minStep) * minStep;
  for (let g = -minHalf; g <= minHalf + 1e-6; g += minStep) {
    const x = cx + g * scale;
    const y = cy + g * scale;
    ctx.beginPath(); ctx.moveTo(x, cy - half * scale); ctx.lineTo(x, cy + half * scale); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - half * scale, y); ctx.lineTo(cx + half * scale, y); ctx.stroke();
  }

  // ── Major grid (1 m) ──
  ctx.strokeStyle = 'rgba(168,85,247,0.18)';
  ctx.lineWidth = 0.8;
  for (let g = -Math.ceil(half); g <= Math.ceil(half); g += 1) {
    const x = cx + g * scale;
    const y = cy + g * scale;
    ctx.beginPath(); ctx.moveTo(x, cy - half * scale); ctx.lineTo(x, cy + half * scale); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - half * scale, y); ctx.lineTo(cx + half * scale, y); ctx.stroke();
  }

  // ── Origin crosshair ──
  ctx.strokeStyle = 'rgba(93,228,255,0.55)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy);
  ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9);
  ctx.stroke();

  // ── Empty state ──
  if (objects.length === 0) {
    ctx.fillStyle = 'rgba(120,140,255,0.5)';
    ctx.font = `600 ${Math.max(11, width * 0.04)}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Empty sandbox', cx, cy - 26);
    ctx.fillStyle = 'rgba(120,140,255,0.35)';
    ctx.font = `${Math.max(9, width * 0.028)}px 'Segoe UI', sans-serif`;
    ctx.fillText('Open Build to place objects', cx, cy - 8);
    return;
  }

  // ── Objects ──
  for (const o of objects) {
    const wx = o.gx * GRID_SIZE;
    const wz = o.gz * GRID_SIZE;
    const { px, py } = m2px(wx, wz);
    const rotY = (o.rotY ?? 0) * Math.PI / 2;

    switch (o.type) {
      case 'wall': {
        const w = GRID_SIZE * 0.95 * scale;
        const d = GRID_SIZE * 0.22 * scale;
        ctx.save(); ctx.translate(px, py); ctx.rotate(rotY);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(-w / 2, -d / 2, w, d);
        ctx.restore();
        break;
      }
      case 'block': {
        const w = GRID_SIZE * 0.85 * scale;
        ctx.save(); ctx.translate(px, py); ctx.rotate(rotY);
        ctx.fillStyle = o.color || '#5dadff';
        ctx.fillRect(-w / 2, -w / 2, w, w);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 0.6;
        ctx.strokeRect(-w / 2, -w / 2, w, w);
        ctx.restore();
        break;
      }
      case 'cone': {
        const r = 0.07 * scale;
        ctx.fillStyle = '#ff8c00';
        ctx.shadowColor = '#ff5500';
        ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
      case 'sphere': {
        const r = 0.1 * scale;
        ctx.fillStyle = o.color || '#a855f7';
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'cylinder': {
        const r = 0.07 * scale;
        ctx.fillStyle = o.color || '#cccccc';
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 0.6; ctx.stroke();
        break;
      }
      case 'waypoint': {
        const r = 0.06 * scale;
        const col = o.color || '#4dffb8';
        ctx.shadowColor = col;
        ctx.shadowBlur = 8;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
      case 'apriltag': {
        const w = 0.18 * scale;
        ctx.save(); ctx.translate(px, py); ctx.rotate(rotY);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(-w / 2, -w / 2, w, w);
        ctx.fillStyle = '#f3eee0';
        ctx.fillRect(-w * 0.36, -w * 0.36, w * 0.72, w * 0.72);
        ctx.restore();
        break;
      }
      case 'bot': {
        const isSumo = o.botVariant === 'sumo';
        const r = (isSumo ? 0.13 : 0.10) * scale;
        ctx.fillStyle   = isSumo ? '#cc1818' : '#3a4d8a';
        ctx.strokeStyle = isSumo ? '#ffaa00' : '#5de4ff';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Direction nub
        const nubX = px + Math.cos(rotY) * r * 1.05;
        const nubY = py + Math.sin(rotY) * r * 1.05;
        ctx.fillStyle = isSumo ? '#ffaa00' : '#5de4ff';
        ctx.beginPath(); ctx.arc(nubX, nubY, r * 0.32, 0, Math.PI * 2); ctx.fill();
        break;
      }
    }
  }

  // ── Friendly footer ──
  ctx.font = `600 11px 'Segoe UI', sans-serif`;
  ctx.fillStyle = 'rgba(93,228,255,0.75)';
  ctx.textAlign = 'left';
  ctx.fillText(
    `${objects.length} thing${objects.length === 1 ? '' : 's'} in your sandbox`,
    10,
    height - 12,
  );
}
