import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'LMS Package Maker',
  description: 'Author once, export to SCORM, xAPI, cmi5, AICC or HTML5.',
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
