import Link from 'next/link';

export default function Navbar() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="font-mono font-bold text-white tracking-widest text-sm hover:text-cyan-400 transition-colors"
        >
          SHARDLEAK
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <a
            href="#problem"
            className="text-zinc-400 hover:text-white font-mono text-xs tracking-wide transition-colors"
          >
            PROBLEM
          </a>
          <a
            href="#how-it-works"
            className="text-zinc-400 hover:text-white font-mono text-xs tracking-wide transition-colors"
          >
            HOW IT WORKS
          </a>
          <a
            href="#algorithms"
            className="text-zinc-400 hover:text-white font-mono text-xs tracking-wide transition-colors"
          >
            ALGORITHMS
          </a>
          <a
            href="#architecture"
            className="text-zinc-400 hover:text-white font-mono text-xs tracking-wide transition-colors"
          >
            ARCHITECTURE
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="font-mono text-xs text-zinc-400 hover:text-white transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="font-mono text-xs bg-cyan-400 text-zinc-950 px-4 py-2 font-semibold hover:bg-cyan-300 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}
