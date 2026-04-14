import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: 'SketchBot Operator UI',
  description: 'Operator dashboard for the SketchBot drawing robot',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
