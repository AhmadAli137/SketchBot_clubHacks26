'use client';

import dynamic from 'next/dynamic';

export const HeroScene3DClient = dynamic(
  () => import('./hero-scene-3d').then(m => ({ default: m.HeroScene3D })),
  { ssr: false },
);
