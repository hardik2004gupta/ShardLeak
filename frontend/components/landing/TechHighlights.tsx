const HIGHLIGHTS = [
  {
    tag: 'CORRECTNESS',
    title: 'Atomic Lua scripts',
    body: 'Every rate-limit decision is a single Redis Lua script. The read-modify-write is unbreakable — no concurrent request can slip between the read and write.',
  },
  {
    tag: 'DISTRIBUTION',
    title: 'Stateless Go API',
    body: 'No in-memory counters. Any number of API instances can run simultaneously and share state through Redis. Horizontal scaling works out of the box.',
  },
  {
    tag: 'PERFORMANCE',
    title: 'Redis hot path',
    body: 'The rate-limit decision path touches Redis once and PostgreSQL zero times (unless the API key changes). Sub-millisecond decisions at scale.',
  },
  {
    tag: 'PERSISTENCE',
    title: 'PostgreSQL configs',
    body: 'Rate-limit configurations (identifier, algorithm, limit, window) live in PostgreSQL. They persist across Redis restarts. Configs never become stale.',
  },
  {
    tag: 'SECURITY',
    title: 'Hashed API keys',
    body: 'API keys are stored as SHA-256 hashes. The plaintext is shown exactly once. A database breach cannot expose usable keys. Keys can be revoked instantly.',
  },
  {
    tag: 'FAILURE MODE',
    title: 'Fail closed',
    body: 'If Redis is unavailable, the API returns 503 rather than silently allowing unlimited traffic. A rate limiter that fails open is no rate limiter at all.',
  },
  {
    tag: 'ALGORITHMS',
    title: 'Token Bucket + Fixed Window',
    body: 'Token Bucket supports controlled bursts and is the primary algorithm. Fixed Window is simpler with predictable boundary behavior. Both are atomic.',
  },
  {
    tag: 'CONCURRENCY',
    title: '1000 concurrent test',
    body: 'The concurrency test sends 1000 simultaneous requests for the same identifier with a limit of 100. Exactly 100 are allowed. The Lua script holds the guarantee.',
  },
];

export default function TechHighlights() {
  return (
    <section id="architecture" className="py-24 border-t border-zinc-800">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="font-mono text-xs text-zinc-600 tracking-widest mb-4">
          04 / ENGINEERING
        </div>
        <h2 className="font-mono text-3xl lg:text-4xl font-bold text-white mb-16">
          Built on five distributed-systems concepts.
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-0">
          {HIGHLIGHTS.map(({ tag, title, body }, i) => (
            <div
              key={tag}
              className={`border border-zinc-800 p-6 hover:bg-zinc-900/40 transition-colors ${
                i % 4 !== 0 ? '-ml-px' : ''
              } ${i >= 4 ? '-mt-px' : ''}`}
            >
              <div className="font-mono text-xs text-cyan-400 mb-3 tracking-widest">{tag}</div>
              <div className="font-mono text-sm font-semibold text-white mb-3">{title}</div>
              <p className="text-zinc-500 text-xs leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* Stack strip */}
        <div className="mt-12 border border-zinc-800 p-6">
          <div className="font-mono text-xs text-zinc-600 mb-4 tracking-widest">TECH STACK</div>
          <div className="flex flex-wrap gap-3">
            {[
              'Go 1.22',
              'Chi (routing)',
              'go-redis',
              'pgx/v5',
              'JWT (golang-jwt)',
              'bcrypt',
              'Redis',
              'PostgreSQL',
              'Prometheus',
              'Grafana',
              'Docker Compose',
              'Next.js',
              'TypeScript',
              'Tailwind CSS',
            ].map((tech) => (
              <span
                key={tech}
                className="font-mono text-xs text-zinc-400 border border-zinc-700 px-3 py-1.5 bg-zinc-900"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
