'use client';

/**
 * TopView — 2D orthographic overhead view of the workspace.
 * Shows the paper, drawn paths, robot footprint, and coordinate grid.
 * Rendered with a plain Canvas2D (no Three.js overhead) for snappiness.
 */

import { useEffect, useRef } from 'react';

import type { SimPoint } from '@/lib/sim-path-utils';
import { CANVAS_W, CANVAS_H } from '@/lib/sim-path-utils';

type Props = {
  settledLines: SimPoint[][];
  activeLine: SimPoint[];
  penPos: SimPoint | null;
  isAnimating: boolean;
  width: number;
  height: number;
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

export function TopView({ settledLines, activeLine, penPos, isAnimating, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 10 || height < 10) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    // ── Clear ──
    ctx.fillStyle = '#050816';
    ctx.fillRect(0, 0, width, height);

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

    // ── Paper background ──
    ctx.fillStyle = '#eeeae0';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 12;
    ctx.fillRect(paperLeft, paperTop, paperW, paperH);
    ctx.shadowBlur = 0;

    // ── Paper grid ──
    ctx.strokeStyle = 'rgba(100,120,200,0.18)';
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

    // ── Paper border ──
    ctx.strokeStyle = 'rgba(140,130,110,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(paperLeft, paperTop, paperW, paperH);

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
      ctx.strokeStyle = 'rgba(93,228,255,0.65)';
      ctx.lineWidth = 1.5;
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
      ctx.strokeStyle = 'rgba(93,228,255,1)';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = 'rgba(93,228,255,0.6)';
      ctx.shadowBlur = 6;
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

  }, [settledLines, activeLine, penPos, isAnimating, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  );
}
