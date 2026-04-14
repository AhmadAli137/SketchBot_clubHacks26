import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { ReactNode } from 'react';

import { CLERK_ENABLED } from '@/lib/config';

import './globals.css';

export const metadata: Metadata = {
  title: 'SketchBot Admin',
  description: 'Hosted site for SketchBot accounts, updates, and classroom administration',
};

function OptionalClerkProvider({ children }: { children: ReactNode }) {
  if (!CLERK_ENABLED) {
    return <>{children}</>;
  }
  return <ClerkProvider>{children}</ClerkProvider>;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <OptionalClerkProvider>{children}</OptionalClerkProvider>
      </body>
    </html>
  );
}
