import './globals.css';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ReactNode } from 'react';

import { XPToastProvider } from '@/components/gamification';
import { THEME_STORAGE_KEY } from '@/lib/theme-preference';
import MusicPreloader from '@/components/music-preloader';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SaySpark — AI-Tutored Robotics',
  description: 'Learn robotics by doing — real robots, real code, AI personal tutor.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Inline script: apply saved theme before first paint to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'dark';}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <MusicPreloader />
        <XPToastProvider>{children}</XPToastProvider>
      </body>
    </html>
  );
}
