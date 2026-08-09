import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Subtitler',
  description: 'Subtitle search API for the Subtitler browser extension.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-200 antialiased">{children}</body>
    </html>
  );
}
