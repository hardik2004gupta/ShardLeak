import Link from 'next/link';
import ArchitectureFlow from './ArchitectureFlow';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center pt-14 overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 bg-grid" />

      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(34,211,238,0.08),transparent)]" />

      {/* Bottom fade */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-zinc-950 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-24 lg:py-32 grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
        {/* Left: headline */}
        <div>
          <div className="inline-flex items-center gap-2 border border-cyan-400/20 bg-cyan-400/5 px-3 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-mono text-xs text-cyan-400 tracking-widest">
              DISTRIBUTED SYSTEMS / RATE LIMITING
            </span>
          </div>

          <h1 className="font-mono font-bold leading-none tracking-tight mb-8">
            <span className="block text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-white">
              RATE
            </span>
            <span className="block text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-white">
              LIMITING,
            </span>
            <span className="block text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-cyan-400">
              BUILT FOR
            </span>
            <span className="block text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-white">
              DISTRIBUTED
            </span>
            <span className="block text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-white">
              SYSTEMS.
            </span>
          </h1>

          <p className="text-zinc-400 text-base lg:text-lg leading-relaxed mb-10 max-w-md font-mono">
            Atomic Redis Lua decisions. Shared state across API instances.
            Zero race conditions.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link
              href="/signup"
              className="font-mono font-semibold text-sm bg-cyan-400 text-zinc-950 px-6 py-3 hover:bg-cyan-300 transition-colors"
            >
              Get Started →
            </Link>
            <a
              href="#architecture"
              className="font-mono text-sm border border-zinc-700 text-zinc-300 px-6 py-3 hover:border-zinc-500 hover:text-white transition-colors"
            >
              View Architecture
            </a>
          </div>

          {/* Metrics strip */}
          <div className="mt-12 flex gap-8">
            {[
              { label: 'ALGORITHM', value: 'TOKEN BUCKET' },
              { label: 'ATOMICITY', value: 'LUA SCRIPT' },
              { label: 'INSTANCES', value: 'STATELESS' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="font-mono text-xs text-zinc-600">{label}</div>
                <div className="font-mono text-sm text-zinc-300 mt-0.5">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: architecture flow */}
        <div className="hidden lg:flex items-center justify-center">
          <div className="border border-zinc-800 bg-zinc-900/40 backdrop-blur-sm p-8">
            <ArchitectureFlow />
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-2 text-zinc-700">
        <span className="font-mono text-xs tracking-widest">SCROLL</span>
        <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
          <path d="M6 1v14M1 10l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </section>
  );
}
