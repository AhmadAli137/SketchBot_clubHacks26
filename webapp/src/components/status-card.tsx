type StatusCardProps = {
  title: string;
  value: string;
  accent?: 'green' | 'yellow' | 'red' | 'blue';
};

const accentMap = {
  green: 'border-emerald-500/40 bg-emerald-500/10',
  yellow: 'border-amber-500/40 bg-amber-500/10',
  red: 'border-rose-500/40 bg-rose-500/10',
  blue: 'border-sky-500/40 bg-sky-500/10',
};

export function StatusCard({ title, value, accent = 'blue' }: StatusCardProps) {
  return (
    <div className={`rounded-xl border p-4 ${accentMap[accent]}`}>
      <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-2 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}
