'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { getToken, clearToken } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/types/api';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: '◈' },
  { href: '/dashboard/playground', label: 'Playground', icon: '▶' },
  { href: '/dashboard/limits', label: 'Rate Limits', icon: '⊟' },
  { href: '/dashboard/api-keys', label: 'API Keys', icon: '⌘' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    api.auth
      .me()
      .then(setUser)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          router.replace('/login');
        }
      })
      .finally(() => setReady(true));
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="font-mono text-xs text-zinc-700 tracking-widest animate-pulse">
          LOADING...
        </div>
      </div>
    );
  }

  function handleLogout() {
    clearToken();
    router.push('/');
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-zinc-800 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="h-14 border-b border-zinc-800 flex items-center px-5">
          <Link
            href="/"
            className="font-mono font-bold text-white tracking-widest text-sm hover:text-cyan-400 transition-colors"
          >
            SHARDLEAK
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label, icon }) => {
            const active = href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 font-mono text-xs transition-colors ${
                  active
                    ? 'text-cyan-400 bg-cyan-400/8 border-l-2 border-cyan-400 pl-[10px]'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50 border-l-2 border-transparent'
                }`}
              >
                <span className="text-base leading-none">{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-zinc-800 p-3">
          {user && (
            <div className="font-mono text-xs text-zinc-600 truncate px-3 py-1 mb-1">
              {user.email}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 font-mono text-xs text-zinc-600 hover:text-red-400 hover:bg-red-500/5 transition-colors border-l-2 border-transparent"
          >
            <span>↩</span>
            Logout
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-h-screen overflow-auto bg-zinc-950">
        {children}
      </main>
    </div>
  );
}
