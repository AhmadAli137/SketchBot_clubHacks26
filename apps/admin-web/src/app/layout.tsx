import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { ReactNode } from 'react';

import { CLERK_ENABLED } from '@/lib/config';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SketchBot — Robotics education for every classroom',
  description: 'SketchBot is a drawing robot with a built-in AI tutor. Students learn real engineering — kinematics, computer vision, control theory — by watching a robot bring their ideas to life.',
  openGraph: {
    title: 'SketchBot — Robotics education for every classroom',
    description: 'A drawing robot with a built-in AI tutor. Real engineering for every age.',
    type: 'website',
  },
};

function OptionalClerkProvider({ children }: { children: ReactNode }) {
  if (!CLERK_ENABLED) return <>{children}</>;
  return <ClerkProvider>{children}</ClerkProvider>;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body style={{ fontFamily: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif' }}>
        <OptionalClerkProvider>{children}</OptionalClerkProvider>
      </body>
    </html>
  );
}
