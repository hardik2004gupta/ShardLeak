import Link from 'next/link';

export default function CTASection() {
  return (
    <section className="py-32 border-t border-zinc-800 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_50%,rgba(34,211,238,0.05),transparent)]" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 text-center">
        <div className="font-mono text-xs text-zinc-600 tracking-widest mb-6">
          05 / START BUILDING
        </div>

        <h2 className="font-mono text-4xl lg:text-6xl font-bold text-white mb-8 leading-tight">
          Try it in 60 seconds.
        </h2>

        <p className="text-zinc-400 text-lg max-w-xl mx-auto mb-12 font-mono">
          Sign up, create an API key, configure a rate limit, and hit the
          playground to watch the token bucket drain in real time.
        </p>

        <div className="flex flex-wrap gap-4 justify-center mb-16">
          <Link
            href="/signup"
            className="font-mono font-semibold text-sm bg-cyan-400 text-zinc-950 px-8 py-4 hover:bg-cyan-300 transition-colors"
          >
            Create Account →
          </Link>
          <Link
            href="/login"
            className="font-mono text-sm border border-zinc-700 text-zinc-300 px-8 py-4 hover:border-zinc-500 hover:text-white transition-colors"
          >
            Sign In
          </Link>
        </div>

        <div className="border border-zinc-800 bg-zinc-900/50 p-6 max-w-2xl mx-auto text-left">
          <div className="font-mono text-xs text-zinc-600 mb-3">OR RUN LOCALLY</div>
          <pre className="font-mono text-sm text-zinc-300 overflow-x-auto">
            <span className="text-zinc-600">$ </span>
            <span className="text-cyan-400">git clone</span>
            <span className="text-zinc-300"> github.com/shardleak/shardleak</span>
            {'\n'}
            <span className="text-zinc-600">$ </span>
            <span className="text-cyan-400">docker compose up</span>
          </pre>
        </div>
      </div>
    </section>
  );
}
