'use client';

import type { CSSProperties } from 'react';

import type { RobotPresetId } from '@/lib/robot-presets';

type RobotAvatarPresetProps = {
  preset: RobotPresetId;
  /** Accent fill (CSS color / var) */
  accent: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
};

/** Lightweight SVG “buddy” robots for profile & header (Duolingo-style identity). */
export function RobotAvatarPreset({ preset, accent, size = 40, className, style }: RobotAvatarPresetProps) {
  const s = size;
  const common = { width: s, height: s, display: 'block' as const };

  switch (preset) {
    case 'boxy':
      return (
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ ...common, ...style }} className={className} aria-hidden>
          <rect x="10" y="14" width="28" height="26" rx="4" fill={accent} opacity={0.92} />
          <rect x="14" y="18" width="8" height="8" rx="1" fill="#0c1524" opacity={0.85} />
          <rect x="26" y="18" width="8" height="8" rx="1" fill="#0c1524" opacity={0.85} />
          <rect x="16" y="30" width="16" height="3" rx="1" fill="#0c1524" opacity={0.35} />
          <rect x="22" y="8" width="4" height="8" rx="1" fill={accent} />
        </svg>
      );
    case 'pulse':
      return (
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ ...common, ...style }} className={className} aria-hidden>
          <ellipse cx="24" cy="22" rx="14" ry="16" fill={accent} opacity={0.9} />
          <circle cx="18" cy="20" r="3.5" fill="#0c1524" opacity={0.8} />
          <circle cx="30" cy="20" r="3.5" fill="#0c1524" opacity={0.8} />
          <path d="M18 28q6 5 12 0" stroke="#0c1524" strokeWidth="1.8" strokeLinecap="round" opacity={0.5} fill="none" />
          <rect x="21" y="4" width="6" height="10" rx="2" fill={accent} opacity={0.85} />
        </svg>
      );
    case 'mech':
      return (
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ ...common, ...style }} className={className} aria-hidden>
          <path d="M12 32 L24 12 L36 32 Z" fill={accent} opacity={0.88} />
          <rect x="18" y="22" width="5" height="5" rx="1" fill="#0c1524" opacity={0.75} />
          <rect x="25" y="22" width="5" height="5" rx="1" fill="#0c1524" opacity={0.75} />
          <rect x="20" y="34" width="8" height="4" rx="1" fill={accent} opacity={0.6} />
        </svg>
      );
    case 'nano':
      return (
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ ...common, ...style }} className={className} aria-hidden>
          <rect x="14" y="18" width="20" height="18" rx="6" fill={accent} opacity={0.95} />
          <circle cx="19" cy="25" r="2.8" fill="#0c1524" opacity={0.8} />
          <circle cx="29" cy="25" r="2.8" fill="#0c1524" opacity={0.8} />
          <rect x="20" y="30" width="8" height="2" rx="1" fill="#0c1524" opacity={0.35} />
        </svg>
      );
    case 'spark':
      return (
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ ...common, ...style }} className={className} aria-hidden>
          <rect x="12" y="16" width="24" height="22" rx="8" fill={accent} opacity={0.9} />
          <circle cx="19" cy="24" r="3" fill="#0c1524" opacity={0.8} />
          <circle cx="29" cy="24" r="3" fill="#0c1524" opacity={0.8} />
          <path d="M10 12 L14 8 M38 12 L34 8" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'orbit':
    default:
      return (
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ ...common, ...style }} className={className} aria-hidden>
          <circle cx="24" cy="22" r="14" fill={accent} opacity={0.92} />
          <circle cx="19" cy="20" r="3.2" fill="#0c1524" opacity={0.82} />
          <circle cx="29" cy="20" r="3.2" fill="#0c1524" opacity={0.82} />
          <path d="M18 28q6 4 12 0" stroke="#0c1524" strokeWidth="1.6" strokeLinecap="round" opacity={0.45} fill="none" />
          <circle cx="24" cy="8" r="3" fill={accent} opacity={0.75} />
          <line x1="24" y1="11" x2="24" y2="16" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
  }
}
