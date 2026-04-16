'use client';

import { Bot, Camera, PencilLine, ScanLine, Wifi } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type ReadinessItemDef = {
  icon: LucideIcon;
  label: string;
  ready: boolean;
  value?: string;
};

type ReadinessGridProps = {
  backendReachable: boolean;
  cameraReady: boolean;
  canvasReady: boolean;
  drawingReady: boolean;
  robotReady: boolean;
  activeJobName?: string | null;
};

export function ReadinessGrid({
  backendReachable,
  cameraReady,
  canvasReady,
  drawingReady,
  robotReady,
  activeJobName,
}: ReadinessGridProps) {
  const items: ReadinessItemDef[] = [
    {
      icon: Wifi,
      label: 'App connected',
      ready: backendReachable,
      value: backendReachable ? 'Ready' : 'Connecting…',
    },
    {
      icon: Camera,
      label: 'Camera',
      ready: cameraReady,
      value: cameraReady ? 'Live' : 'Not connected',
    },
    {
      icon: ScanLine,
      label: 'Paper detected',
      ready: canvasReady,
      value: canvasReady ? 'Found' : 'Show all AprilTags',
    },
    {
      icon: PencilLine,
      label: 'Drawing ready',
      ready: drawingReady,
      value: drawingReady ? (activeJobName ?? 'Ready') : 'Make one first',
    },
    {
      icon: Bot,
      label: 'Robot',
      ready: robotReady,
      value: robotReady ? 'Connected' : 'Not connected',
    },
  ];

  const allReady = items.every((i) => i.ready);

  return (
    <div className="readiness-grid">
      {items.map(({ icon: Icon, label, ready, value }) => (
        <div key={label} className={`readiness-item ${ready ? 'ready' : 'waiting'}`}>
          <div className={`readiness-dot ${ready ? 'ready' : 'waiting'}`} />
          <Icon size={14} style={{ color: ready ? 'var(--green)' : 'var(--muted)', flexShrink: 0 }} />
          <span className="readiness-label">{label}</span>
          <span className="readiness-value">{value}</span>
        </div>
      ))}
      {allReady && (
        <div
          style={{
            marginTop: 4,
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(77, 255, 184, 0.3)',
            background: 'linear-gradient(135deg, rgba(77, 255, 184, 0.08), rgba(93, 228, 255, 0.05))',
            fontSize: '0.82rem',
            color: 'var(--green)',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          ✓ All systems ready
        </div>
      )}
    </div>
  );
}
