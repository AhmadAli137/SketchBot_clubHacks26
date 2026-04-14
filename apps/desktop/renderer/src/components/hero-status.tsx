import { cn } from '@/lib/ui';

export function HeroStatus({
  label,
  value,
  accent = 'cyan',
}: {
  label: string;
  value: string;
  accent?: 'cyan' | 'green' | 'violet' | 'amber' | 'pink';
}) {
  const accentMap = {
    cyan: 'before:bg-cyan-400/35 from-cyan-400/16 to-sky-500/8 border-cyan-400/18',
    green: 'before:bg-emerald-400/35 from-emerald-400/16 to-green-500/8 border-emerald-400/18',
    violet: 'before:bg-violet-400/35 from-violet-400/16 to-fuchsia-500/8 border-violet-400/18',
    amber: 'before:bg-amber-300/35 from-amber-300/16 to-orange-500/8 border-amber-300/18',
    pink: 'before:bg-pink-400/35 from-pink-400/16 to-fuchsia-500/8 border-pink-400/18',
  };

  return (
    <div className={cn('relative overflow-hidden rounded-2xl border bg-gradient-to-br p-3.5 md:p-4', accentMap[accent])}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      <div className="absolute left-3 top-3 h-1.5 w-1.5 rounded-full blur-[1px]" />
      <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-base font-semibold text-white md:text-lg">{value}</div>
    </div>
  );
}
