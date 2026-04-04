import { AppState } from '@/lib/types';

export function CanvasPreview({ state }: { state: AppState | null }) {
  const pose = state?.robot_pose;
  const canvas = state?.canvas;
  const xPct = pose ? Math.max(5, Math.min(95, (pose.x_mm / (canvas?.width_mm || 297)) * 100)) : 50;
  const yPct = pose ? Math.max(5, Math.min(95, (pose.y_mm / (canvas?.height_mm || 210)) * 100)) : 50;

  return (
    <div className="rounded-[28px] border border-[rgba(120,140,255,0.14)] bg-[linear-gradient(180deg,rgba(4,7,18,0.95),rgba(2,5,14,0.98))] p-3 md:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Live workspace view</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">Camera overlay placeholder with pathing, localization, and robot body tracking.</p>
        </div>
        <div className="inline-flex w-fit rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
          {canvas?.detected ? 'canvas locked' : 'searching for tags'}
        </div>
      </div>

      <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-[24px] border border-[rgba(120,140,255,0.14)] bg-[radial-gradient(circle_at_top,_rgba(77,226,255,0.12),_transparent_30%),radial-gradient(circle_at_80%_20%,_rgba(168,85,247,0.16),_transparent_28%),linear-gradient(180deg,_rgba(7,10,24,0.98),_rgba(2,6,20,0.98))]">
        <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(125,145,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(125,145,255,0.12)_1px,transparent_1px)] [background-size:26px_26px] md:[background-size:34px_34px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_40%,rgba(0,0,0,0.34)_100%)]" />

        <div className="relative h-[80%] w-[82%] rounded-[18px] border border-cyan-300/45 bg-[linear-gradient(180deg,rgba(77,226,255,0.07),rgba(91,124,255,0.03))] shadow-[0_0_55px_rgba(77,226,255,0.08)]">
          <div className="absolute left-2 top-2 rounded-full border border-cyan-300/25 bg-slate-950/75 px-2 py-1 text-[10px] text-cyan-200 md:left-3 md:top-3 md:text-[11px]">Tag 0</div>
          <div className="absolute right-2 top-2 rounded-full border border-cyan-300/25 bg-slate-950/75 px-2 py-1 text-[10px] text-cyan-200 md:right-3 md:top-3 md:text-[11px]">Tag 1</div>
          <div className="absolute bottom-2 left-2 rounded-full border border-cyan-300/25 bg-slate-950/75 px-2 py-1 text-[10px] text-cyan-200 md:bottom-3 md:left-3 md:text-[11px]">Tag 2</div>
          <div className="absolute bottom-2 right-2 rounded-full border border-cyan-300/25 bg-slate-950/75 px-2 py-1 text-[10px] text-cyan-200 md:bottom-3 md:right-3 md:text-[11px]">Tag 3</div>

          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline fill="none" stroke="rgba(255,79,216,0.65)" strokeWidth="0.55" strokeDasharray="2 2" points="14,30 20,30 20,18 31,18 31,44 44,44 44,22 56,22" />
            <polyline fill="none" stroke="rgba(77,226,255,0.95)" strokeWidth="0.9" points="18,25 28,25 28,40 40,40 40,28 52,28 52,45 64,45 64,32 78,32" />
            <polyline fill="none" stroke="rgba(168,85,247,0.78)" strokeWidth="0.85" points="22,68 32,58 42,68 52,58 62,68 72,58" />
          </svg>

          <div
            className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200/40 bg-emerald-400 shadow-[0_0_28px_rgba(77,255,184,0.58)] md:h-6 md:w-6"
            style={{ left: `${xPct}%`, top: `${yPct}%` }}
          >
            <div
              className="absolute left-1/2 top-1/2 h-7 w-[2px] -translate-x-1/2 -translate-y-[92%] rounded bg-white shadow-[0_0_12px_rgba(255,255,255,0.65)] md:h-9"
              style={{ transform: `translate(-50%, -92%) rotate(${pose?.heading_deg ?? 0}deg)` }}
            />
            <div className="absolute left-[118%] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-pink-400 shadow-[0_0_18px_rgba(255,79,216,0.58)] md:h-3 md:w-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
