import { ReactNode } from 'react';

import { cn } from '@/lib/ui';

export function GlassPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'rounded-[30px] border border-[rgba(120,140,255,0.16)] bg-[linear-gradient(180deg,rgba(11,16,34,0.9),rgba(7,10,24,0.82))] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_22px_80px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:mb-6 md:flex-row md:items-start md:justify-between">
      <div>
        {eyebrow ? <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/80 md:text-[11px] md:tracking-[0.32em]">{eyebrow}</div> : null}
        <h2 className="mt-2 text-lg font-semibold text-white md:text-xl">{title}</h2>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{subtitle}</p> : null}
      </div>
      {right ? <div className="w-full md:w-auto">{right}</div> : null}
    </div>
  );
}
