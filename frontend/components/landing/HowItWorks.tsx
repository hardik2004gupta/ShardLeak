const STEPS = [
  {
    n: '01',
    label: 'REQUEST',
    heading: 'Client sends a check request',
    description:
      'Any HTTP client calls POST /api/v1/check with an identifier, algorithm, limit, and window. The API key in the Authorization header is validated first.',
    code: `POST /api/v1/check
Authorization: Bearer sk_shard_...

{
  "identifier":     "user:123",
  "algorithm":      "token_bucket",
  "limit":          100,
  "window_seconds": 60
}`,
  },
  {
    n: '02',
    label: 'AUTH',
    heading: 'API key validated against PostgreSQL',
    description:
      'The key hash is looked up in PostgreSQL. If it is not found, has been revoked, or is missing, the request is rejected with 401. No rate-limit state is read yet.',
    code: `SELECT id, revoked_at FROM api_keys
WHERE key_hash = SHA256(request_key)

→ found, not revoked: proceed
→ not found or revoked: 401`,
  },
  {
    n: '03',
    label: 'ATOMIC DECISION',
    heading: 'Lua script executes in Redis',
    description:
      'A Redis Lua script reads the current token bucket or window counter, calculates whether the request is allowed, updates state, and returns the result — all in one atomic operation. No other request can interleave.',
    code: `-- Atomic read-modify-write
local tokens = redis.call("HGET", key, "tokens")
local now     = tonumber(ARGV[1])

-- Refill tokens since last request
local refill  = (now - last) * rate
tokens        = math.min(capacity, tokens + refill)

if tokens >= cost then
  tokens = tokens - cost
  -- ALLOWED
else
  -- REJECTED
end

redis.call("HSET", key, "tokens", tokens)
return { allowed, remaining }`,
  },
  {
    n: '04',
    label: 'RESULT',
    heading: 'Structured response with rate-limit headers',
    description:
      'The decision is returned with remaining capacity, reset time, and a retry hint on rejection. Standard rate-limit headers are set on every response.',
    code: `HTTP/1.1 200 OK
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 94
X-RateLimit-Reset:     1787054400

{
  "allowed":     true,
  "remaining":   94,
  "reset_at":    "2026-08-18T12:01:00Z",
  "retry_after": null
}`,
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 border-t border-zinc-800">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="font-mono text-xs text-zinc-600 tracking-widest mb-4">
          02 / HOW IT WORKS
        </div>
        <h2 className="font-mono text-3xl lg:text-4xl font-bold text-white mb-16">
          Four steps. One atomic decision.
        </h2>

        <div className="space-y-0">
          {STEPS.map(({ n, label, heading, description, code }, i) => (
            <div
              key={n}
              className={`grid md:grid-cols-2 gap-0 border border-zinc-800 ${
                i > 0 ? '-mt-px' : ''
              }`}
            >
              {/* Left */}
              <div className="p-8 border-r border-zinc-800">
                <div className="flex items-start gap-4">
                  <span className="font-mono text-5xl font-bold text-zinc-800 leading-none select-none">
                    {n}
                  </span>
                  <div>
                    <div className="font-mono text-xs text-cyan-400 tracking-widest mb-2">
                      {label}
                    </div>
                    <h3 className="font-mono text-lg font-semibold text-white mb-3">
                      {heading}
                    </h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">{description}</p>
                  </div>
                </div>
              </div>

              {/* Right: code */}
              <div className="bg-zinc-900/50">
                <pre className="font-mono text-xs text-zinc-400 leading-relaxed p-8 overflow-x-auto h-full">
                  {code}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
