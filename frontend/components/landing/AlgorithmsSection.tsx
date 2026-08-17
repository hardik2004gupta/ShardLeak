export default function AlgorithmsSection() {
  return (
    <section id="algorithms" className="py-24 border-t border-zinc-800">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="font-mono text-xs text-zinc-600 tracking-widest mb-4">
          03 / ALGORITHMS
        </div>
        <h2 className="font-mono text-3xl lg:text-4xl font-bold text-white mb-4">
          Two algorithms, both atomic.
        </h2>
        <p className="text-zinc-400 mb-16 max-w-xl">
          Both execute as a single Redis Lua script. The entire read-modify-write
          is one atomic Redis command — concurrent requests cannot interleave.
        </p>

        <div className="grid md:grid-cols-2 gap-0">
          {/* Token Bucket */}
          <div className="border border-zinc-800 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 border border-cyan-400/30 bg-cyan-400/10 flex items-center justify-center">
                <span className="font-mono text-xs text-cyan-400">TB</span>
              </div>
              <div>
                <div className="font-mono text-sm text-white font-semibold">
                  TOKEN BUCKET
                </div>
                <div className="font-mono text-xs text-zinc-500">PRIMARY ALGORITHM</div>
              </div>
            </div>

            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              Tokens accumulate continuously over time at a configured rate.
              Each request consumes tokens. Allows controlled bursts up to the
              bucket capacity while enforcing the average rate.
            </p>

            <div className="space-y-2 mb-6">
              {[
                { label: 'Capacity', value: '100 tokens' },
                { label: 'Refill rate', value: 'limit ÷ window_seconds per second' },
                { label: 'Request cost', value: '1 token' },
                { label: 'Burst', value: 'Yes — up to capacity' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-start gap-4">
                  <span className="font-mono text-xs text-zinc-500">{label}</span>
                  <span className="font-mono text-xs text-zinc-300 text-right">{value}</span>
                </div>
              ))}
            </div>

            {/* Visual token bucket */}
            <div className="border border-zinc-700 bg-zinc-900 p-4">
              <div className="font-mono text-xs text-zinc-600 mb-2">bucket state</div>
              <div className="flex gap-1 flex-wrap">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-5 h-5 border ${
                      i < 7
                        ? 'border-cyan-400/40 bg-cyan-400/20'
                        : 'border-zinc-700 bg-zinc-800'
                    }`}
                  />
                ))}
              </div>
              <div className="font-mono text-xs text-zinc-600 mt-2">7/10 tokens remaining</div>
            </div>
          </div>

          {/* Fixed Window */}
          <div className="border border-zinc-800 border-l-0 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 border border-zinc-600/30 bg-zinc-700/20 flex items-center justify-center">
                <span className="font-mono text-xs text-zinc-400">FW</span>
              </div>
              <div>
                <div className="font-mono text-sm text-white font-semibold">
                  FIXED WINDOW
                </div>
                <div className="font-mono text-xs text-zinc-500">SECONDARY ALGORITHM</div>
              </div>
            </div>

            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              A counter resets at the start of each window. Simple and predictable.
              Known tradeoff: up to 2× the limit can pass at a window boundary
              (end of window N + start of window N+1).
            </p>

            <div className="space-y-2 mb-6">
              {[
                { label: 'Counter', value: 'requests per window' },
                { label: 'Window alignment', value: 'wall-clock boundary' },
                { label: 'Request cost', value: '1 count' },
                { label: 'Burst', value: 'At boundary only' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-start gap-4">
                  <span className="font-mono text-xs text-zinc-500">{label}</span>
                  <span className="font-mono text-xs text-zinc-300 text-right">{value}</span>
                </div>
              ))}
            </div>

            {/* Visual fixed window */}
            <div className="border border-zinc-700 bg-zinc-900 p-4">
              <div className="font-mono text-xs text-zinc-600 mb-2">window state</div>
              <div className="h-4 bg-zinc-800 border border-zinc-700 relative overflow-hidden">
                <div className="h-full bg-zinc-600 w-[43%]" />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="font-mono text-xs text-zinc-600">43 / 100 used</span>
                <span className="font-mono text-xs text-zinc-600">resets in 31s</span>
              </div>
            </div>
          </div>
        </div>

        {/* Atomicity callout */}
        <div className="mt-0 border border-zinc-800 border-t-0 p-6 bg-zinc-900/30">
          <div className="flex items-start gap-4">
            <div className="font-mono text-xs text-amber-400 mt-0.5 shrink-0">ATOMICITY</div>
            <p className="font-mono text-xs text-zinc-400 leading-relaxed">
              Both algorithms use{' '}
              <code className="text-zinc-300 bg-zinc-800 px-1">redis.call()</code> inside a
              Lua script. Redis guarantees no other command can run between the reads and writes
              inside a script. Two concurrent requests for the same identifier will serialize —
              the second sees the state the first left behind.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
