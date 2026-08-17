export default function ProblemSection() {
  return (
    <section id="problem" className="py-24 border-t border-zinc-800">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="max-w-2xl">
          <div className="font-mono text-xs text-zinc-600 tracking-widest mb-4">
            01 / THE PROBLEM
          </div>
          <h2 className="font-mono text-3xl lg:text-4xl font-bold text-white mb-6">
            Rate limiting across
            <br />
            <span className="text-cyan-400">multiple instances</span> is hard.
          </h2>
          <p className="text-zinc-400 leading-relaxed mb-8">
            A single API instance can use in-memory counters. But once you scale
            horizontally, requests hit different servers. Each server has its own
            counter. The rate limit is never enforced correctly.
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {[
            {
              problem: 'RACE CONDITIONS',
              description:
                'Two concurrent requests read the same counter, both check passes, the limit is bypassed.',
              code: 'GET → check → SET',
              bad: true,
            },
            {
              problem: 'SPLIT STATE',
              description:
                'Multiple API instances each maintain local counters. There is no shared view of the rate limit.',
              code: 'instance-1: 47/100\ninstance-2: 52/100',
              bad: true,
            },
            {
              problem: 'INCONSISTENT LIMITS',
              description:
                'A single identifier can consume 100× its limit if requests are distributed across enough servers.',
              code: 'effective limit: ∞',
              bad: true,
            },
          ].map(({ problem, description, code }) => (
            <div
              key={problem}
              className="border border-red-500/20 bg-red-500/5 p-6"
            >
              <div className="font-mono text-xs text-red-400 mb-3">✗ {problem}</div>
              <p className="text-zinc-400 text-sm leading-relaxed mb-4">{description}</p>
              <pre className="font-mono text-xs text-red-400/60 bg-zinc-950 p-3 overflow-x-auto">
                {code}
              </pre>
            </div>
          ))}
        </div>

        <div className="mt-8 border border-cyan-400/20 bg-cyan-400/5 p-6 max-w-2xl">
          <div className="font-mono text-xs text-cyan-400 mb-2">✓ THE SOLUTION</div>
          <p className="text-zinc-300 text-sm leading-relaxed">
            Move rate-limit state into Redis. Execute the entire read-modify-write
            as a single atomic Lua script. All API instances share the same Redis
            state. Concurrency is handled by Redis, not your application code.
          </p>
        </div>
      </div>
    </section>
  );
}
