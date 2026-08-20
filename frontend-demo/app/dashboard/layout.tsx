'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/dashboard', label: 'OVERVIEW', icon: '⊟' },
  { href: '/dashboard/playground', label: 'PLAYGROUND', icon: '▶' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Top bar */}
      <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 lg:px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-mono font-bold text-white tracking-widest text-sm hover:text-cyan-400 transition-colors">
            SHARDLEAK
          </Link>
          <span className="text-zinc-700 select-none">/</span>
          <span className="font-mono text-xs text-zinc-500">DASHBOARD</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs border border-amber-400/20 text-amber-400/70 px-2 py-0.5">DEMO MODE</span>
          <div className="flex items-center gap-1.5 border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-xs text-emerald-400">LIVE</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-48 border-r border-zinc-800 shrink-0 hidden md:flex flex-col py-4">
          <nav className="flex flex-col gap-0.5 px-2">
            {NAV.map(({ href, label, icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 px-3 py-2.5 font-mono text-xs tracking-widest transition-colors ${
                    active
                      ? 'bg-zinc-800/80 text-white border-l-2 border-cyan-400 pl-[10px]'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  <span className="text-base leading-none">{icon}</span>
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto px-3 pb-2">
            <div className="border border-zinc-800 p-3 bg-zinc-900/50">
              <div className="font-mono text-xs text-zinc-600 mb-2">API KEY</div>
              <code className="font-mono text-xs text-zinc-400">sk_shard_demo...</code>
              <div className="mt-2 text-xs text-zinc-700 font-mono leading-relaxed">
                Demo key — simulated locally
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile nav */}
        <div className="md:hidden border-b border-zinc-800 flex">
          {NAV.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 text-center py-3 font-mono text-xs tracking-widest transition-colors ${
                  active ? 'text-white border-b-2 border-cyan-400' : 'text-zinc-500'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
