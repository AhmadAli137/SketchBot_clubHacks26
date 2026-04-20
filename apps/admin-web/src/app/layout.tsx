import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Aibotics — AI-powered robotics education',
  description:
    'Aibotics gives every classroom a drawing robot with a built-in AI tutor. Students learn real engineering — kinematics, computer vision, control theory — by watching a robot bring their ideas to life.',
  openGraph: {
    title: 'Aibotics — AI-powered robotics education',
    description: 'A drawing robot with a built-in AI tutor. Real engineering for every age.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body style={{ fontFamily: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
