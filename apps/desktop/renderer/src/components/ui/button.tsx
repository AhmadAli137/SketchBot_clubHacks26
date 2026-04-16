'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

import { cn } from '@/lib/ui';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const stylesByVariant: Record<Variant, string> = {
  primary: 'btn-cta',
  secondary: 'btn-ghost',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

const stylesBySize: Record<Size, string> = {
  sm: 'btn-size-sm',
  md: 'btn-size-md',
  lg: 'btn-size-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 transition-all',
        stylesBySize[size],
        stylesByVariant[variant],
        className,
      )}
      {...props}
    />
  );
});

