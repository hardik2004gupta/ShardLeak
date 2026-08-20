import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShardLeak — Distributed Rate Limiting',
  description:
    'Atomic Redis Lua decisions. Shared state across API instances. Zero race conditions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-50 antialiased">{children}</body>
    </html>
  );
}
