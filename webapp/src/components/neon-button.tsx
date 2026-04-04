import { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/ui';

type Variant = 'primary' | 'ghost' | 'danger';

const styles: Record<Variant, string> = {
  primary:
    'border-cyan-300/30 bg-[linear-gradient(135deg,rgba(77,226,255,0.26),rgba(91,124,255,0.2))] text-white shadow-[0_0_22px_rgba(77,226,255,0.12)] hover:border-cyan-200/50 hover:shadow-[0_0_28px_rgba(77,226,255,0.22)]',
  ghost:
    'border-[rgba(120,140,255,0.18)] bg-[rgba(8,12,24,0.68)] text-slate-100 hover:border-cyan-400/20 hover:bg-[rgba(12,17,33,0.92)]',
  danger:
    'border-rose-400/28 bg-[linear-gradient(135deg,rgba(255,107,138,0.22),rgba(190,24,93,0.14))] text-white hover:border-rose-300/40',
};

export function NeonButton({
  variant = 'ghost',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cn(
        'rounded-2xl border px-4 py-2.5 text-sm font-medium transition duration-200 disabled:cursor-not-allowed disabled:opacity-60',
        'min-h-[46px] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
        styles[variant],
        className,
      )}
    />
  );
}
