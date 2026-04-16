export const colors = {
  bg: '#050816',
  panel: '#0d1525',
  panel2: '#091428',
  border: '#1c2a46',
  text: '#e8f0ff',
  muted: '#8096bf',
  muted2: '#5a6d96',
  cyan: '#7be0ff',
  pink: '#ff4f8c',
  green: '#7dffb5',
  danger: '#ff6b8a',
} as const;

export const radius = {
  sm: 14,
  md: 18,
  lg: 22,
  xl: 28,
  '2xl': 34,
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
} as const;

export const type = {
  eyebrow: { fontSize: 12, fontWeight: '800' as const, letterSpacing: 1.6 },
  title: { fontSize: 31, lineHeight: 36, fontWeight: '900' as const },
  subtitle: { fontSize: 15, lineHeight: 23, fontWeight: '700' as const },
  body: { fontSize: 14, lineHeight: 21, fontWeight: '700' as const },
} as const;

