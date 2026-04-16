'use client';

import { HTMLAttributes, forwardRef } from 'react';

import { cn } from '@/lib/ui';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: 'panel' | 'glass';
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = 'panel', ...props },
  ref,
) {
  const base =
    variant === 'glass'
      ? 'border border-[rgba(120,140,255,0.16)] bg-[linear-gradient(180deg,rgba(11,16,34,0.88),rgba(7,10,24,0.8))] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_22px_80px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl'
      : 'border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow-lg)] backdrop-blur-xl';

  return (
    <div
      ref={ref}
      className={cn('rounded-[var(--radius-2xl)] p-5 md:p-6', base, className)}
      {...props}
    />
  );
});

export function CardHeader({
  eyebrow,
  title,
  subtitle,
  right,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-col gap-3 md:mb-5 md:flex-row md:items-start md:justify-between', className)}>
      <div>
        {eyebrow ? (
          <div className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-cyan/90">{eyebrow}</div>
        ) : null}
        <h2 className="mt-2 text-lg font-extrabold text-[var(--text)] md:text-xl">{title}</h2>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{subtitle}</p> : null}
      </div>
      {right ? <div className="w-full md:w-auto">{right}</div> : null}
    </div>
  );
}

