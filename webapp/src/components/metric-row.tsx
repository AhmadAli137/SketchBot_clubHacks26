export function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-[rgba(120,140,255,0.12)] bg-[linear-gradient(180deg,rgba(7,10,22,0.88),rgba(4,7,18,0.82))] px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="max-w-[55%] text-right font-medium text-white">{value}</span>
    </div>
  );
}
