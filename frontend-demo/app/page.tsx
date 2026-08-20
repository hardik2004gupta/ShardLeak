'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// ─── Animated architecture flow ───────────────────────────────────────────────

function ArchFlow() {
  return (
    <div className="relative mx-auto w-72 select-none font-mono">
      <div className="border border-zinc-700 bg-zinc-900 px-4 py-3 mx-auto w-52 text-center">
        <div className="text-xs text-zinc-500 mb-0.5">─── REQUEST ───</div>
        <div className="text-sm text-white font-semibold">CLIENT</div>
        <div className="text-xs text-zinc-600 mt-0.5">POST /api/v1/check</div>
      </div>

      <div className="relative mx-auto w-px h-12 bg-zinc-700">
        <div className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-flow-a" style={{ top: 0 }} />
        <div className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-flow-b" style={{ top: 0 }} />
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-zinc-600" />
      </div>

      <div className="border border-cyan-400/40 bg-zinc-900 px-4 py-3 mx-auto w-56 text-center shadow-[0_0_24px_rgba(34,211,238,0.09)]">
        <div className="text-xs text-cyan-400 mb-0.5">─── STATELESS ───</div>
        <div className="text-sm text-white font-semibold">SHARDLEAK API</div>
        <div className="text-xs text-zinc-500 mt-0.5">Go · Chi · JWT</div>
      </div>

      <div className="flex justify-center gap-16 mt-0">
        <div className="flex flex-col items-center">
          <div className="relative w-px h-10 bg-zinc-700">
            <div className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-flow-short-a" style={{ top: 0 }} />
          </div>
          <div className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-center w-28">
            <div className="text-xs text-red-400 mb-0.5">LUA SCRIPT</div>
            <div className="text-sm text-white font-semibold">REDIS</div>
            <div className="text-xs text-zinc-600 mt-0.5">ATOMIC STATE</div>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div className="relative w-px h-10 bg-zinc-700">
            <div className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-zinc-400 animate-flow-short-b" style={{ top: 0 }} />
          </div>
          <div className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-center w-28">
            <div className="text-xs text-zinc-500 mb-0.5">PERSISTENT</div>
            <div className="text-sm text-white font-semibold">POSTGRES</div>
            <div className="text-xs text-zinc-600 mt-0.5">CONFIG</div>
          </div>
        </div>
      </div>

      <div className="flex justify-start ml-9 mt-0">
        <div className="relative w-px h-10 bg-zinc-700">
          <div className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-flow-short-c" style={{ top: 0 }} />
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-zinc-600" />
        </div>
      </div>

      <div className="flex gap-3 ml-9">
        <div className="border border-emerald-500/40 bg-emerald-500/5 px-4 py-2 text-center">
          <div className="text-xs text-emerald-400 font-semibold">✓ ALLOW</div>
        </div>
        <div className="border border-red-500/40 bg-red-500/5 px-4 py-2 text-center">
          <div className="text-xs text-red-400 font-semibold">✗ REJECT</div>
        </div>
      </div>

      <div className="mt-6 border-t border-zinc-800 pt-4 text-center">
        <div className="text-xs text-zinc-600">Multiple API instances share Redis state.</div>
        <div className="text-xs text-zinc-600 mt-0.5">Lua atomicity prevents race conditions.</div>
      </div>
    </div>
  );
}

// ─── Hero live counter ─────────────────────────────────────────────────────────

function LiveCounter({ target }: { target: number }) {
  const [value, setValue] = useState(target - Math.floor(Math.random() * 200 + 100));
  useEffect(() => {
    if (value >= target) return;
    const id = setTimeout(() => setValue((v) => Math.min(target, v + Math.floor(Math.random() * 7 + 3))), 60);
    return () => clearTimeout(id);
  }, [value, target]);
  return <span>{value.toLocaleString()}</span>;
}

// ─── How It Works steps ────────────────────────────────────────────────────────

const STEPS = [
  {
    n: '01', label: 'REQUEST',
    heading: 'Client sends a check request',
    description: 'Any HTTP client calls POST /api/v1/check with an identifier, algorithm, limit, and window. The API key in the Authorization header is validated first.',
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
    n: '02', label: 'AUTH',
    heading: 'API key validated against PostgreSQL',
    description: 'The SHA-256 key hash is looked up in PostgreSQL. If not found, revoked, or missing, the request is rejected with 401. No rate-limit state is read yet.',
    code: `SELECT id, revoked_at FROM api_keys
WHERE key_hash = SHA256(request_key)

→ found, active:   proceed to Lua
→ not found:       401 UNAUTHORIZED
→ revoked:         401 UNAUTHORIZED`,
  },
  {
    n: '03', label: 'ATOMIC DECISION',
    heading: 'Lua script executes atomically in Redis',
    description: 'A single Redis Lua script reads current state, calculates whether the request is allowed, updates the bucket or counter, and returns the result. No other command can interleave.',
    code: `local tokens = redis.call("HGET", key, "tokens")
local elapsed = now_ms - last_ms
tokens = math.min(capacity, tokens + elapsed * rate)

if tokens >= 1 then
  tokens = tokens - 1
  return {1, math.floor(tokens), reset_at, 0}
else
  return {0, 0, reset_at, retry_after}
end`,
  },
  {
    n: '04', label: 'RESULT',
    heading: 'Structured response with rate-limit headers',
    description: 'The decision is returned with remaining capacity, reset time, and a retry hint on rejection. Standard rate-limit response headers are set on every request.',
    code: `HTTP/1.1 200 OK
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 94
X-RateLimit-Reset:     1787054400
Retry-After:           7  (rejected only)

{"allowed":true,"remaining":94,
 "reset_at":"2026-08-18T12:01:00Z"}`,
  },
];

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="bg-zinc-950 text-zinc-50 min-h-screen">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 inset-x-0 z-50 h-14 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm flex items-center px-6 lg:px-10 justify-between">
        <span className="font-mono font-bold text-white tracking-widest text-sm">SHARDLEAK</span>
        <div className="flex items-center gap-6">
          <a href="#how-it-works" className="font-mono text-xs text-zinc-500 hover:text-white transition-colors hidden sm:block">HOW IT WORKS</a>
          <a href="#algorithms" className="font-mono text-xs text-zinc-500 hover:text-white transition-colors hidden sm:block">ALGORITHMS</a>
          <a href="#architecture" className="font-mono text-xs text-zinc-500 hover:text-white transition-colors hidden sm:block">ARCHITECTURE</a>
          <Link href="/dashboard/playground" className="font-mono text-xs bg-cyan-400 text-zinc-950 px-4 py-2 font-semibold hover:bg-cyan-300 transition-colors">
            Try Demo →
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col justify-center pt-14 overflow-hidden">
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(34,211,238,0.08),transparent)]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-zinc-950 to-transparent" />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-24 lg:py-32 grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div>
            <div className="inline-flex items-center gap-2 border border-cyan-400/20 bg-cyan-400/5 px-3 py-1.5 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-mono text-xs text-cyan-400 tracking-widest">DISTRIBUTED SYSTEMS · RATE LIMITING</span>
            </div>

            <h1 className="font-mono font-bold leading-none tracking-tight mb-8">
              {['RATE', 'LIMITING,', 'BUILT FOR', 'DISTRIBUTED', 'SYSTEMS.'].map((word, i) => (
                <span key={word} className={`block text-4xl md:text-5xl lg:text-6xl xl:text-7xl ${i === 2 ? 'text-cyan-400' : 'text-white'}`}>
                  {word}
                </span>
              ))}
            </h1>

            <p className="text-zinc-400 text-base lg:text-lg leading-relaxed mb-10 max-w-md font-mono">
              Atomic Redis Lua decisions. Shared state across API instances.
              Zero race conditions.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link href="/dashboard/playground" className="font-mono font-semibold text-sm bg-cyan-400 text-zinc-950 px-6 py-3 hover:bg-cyan-300 transition-colors">
                Open Playground →
              </Link>
              <a href="#how-it-works" className="font-mono text-sm border border-zinc-700 text-zinc-300 px-6 py-3 hover:border-zinc-500 hover:text-white transition-colors">
                How It Works
              </a>
            </div>

            <div className="mt-12 grid grid-cols-3 gap-6">
              {[
                { label: 'P95 LATENCY', value: '0.4ms' },
                { label: 'ALGORITHM', value: 'LUA ATOMIC' },
                { label: 'INSTANCES', value: 'STATELESS' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="font-mono text-xs text-zinc-600">{label}</div>
                  <div className="font-mono text-sm text-zinc-300 mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden lg:flex items-center justify-center">
            <div className="border border-zinc-800 bg-zinc-900/40 backdrop-blur-sm p-8">
              <ArchFlow />
            </div>
          </div>
        </div>

        {/* Live stats strip */}
        <div className="relative border-t border-zinc-800/50 bg-zinc-900/20">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 py-5 grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-0 lg:divide-x lg:divide-zinc-800">
            {[
              { label: 'TOTAL DECISIONS', value: 2847293, suffix: '', accent: false },
              { label: 'ALLOWED', value: 2161743, suffix: '', accent: true },
              { label: 'REJECTED', value: 685550, suffix: '', accent: false },
              { label: 'P99 LATENCY', value: 0, suffix: '0.9ms', accent: false },
            ].map(({ label, value, suffix, accent }) => (
              <div key={label} className="lg:px-8 first:pl-0 last:pr-0">
                <div className="font-mono text-xs text-zinc-600 tracking-widest mb-1">{label}</div>
                <div className={`font-mono text-2xl font-bold ${accent ? 'text-cyan-400' : 'text-white'}`}>
                  {suffix || <LiveCounter target={value} />}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-24 inset-x-0 flex flex-col items-center gap-2 text-zinc-700">
          <span className="font-mono text-xs tracking-widest">SCROLL</span>
          <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
            <path d="M6 1v14M1 10l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* ── Problem ── */}
      <section id="problem" className="py-24 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="font-mono text-xs text-zinc-600 tracking-widest mb-4">01 / THE PROBLEM</div>
          <h2 className="font-mono text-3xl lg:text-4xl font-bold text-white mb-6 max-w-2xl">
            Rate limiting fails when state is not shared.
          </h2>
          <p className="text-zinc-400 max-w-2xl mb-16 leading-relaxed">
            Adding a second API instance means two separate in-memory counters. Both see 94 remaining. Both allow the request. The limit is bypassed by simple horizontal scaling.
          </p>

          <div className="grid md:grid-cols-2 gap-0">
            <div className="border border-red-500/20 bg-red-500/3 p-8">
              <div className="font-mono text-xs text-red-400 tracking-widest mb-4">✗ WITHOUT SHARDLEAK</div>
              <div className="space-y-3 font-mono text-xs text-zinc-500">
                {[
                  'API instance A: counter = 94. ALLOW.',
                  'API instance B: counter = 94. ALLOW.',
                  'Counter not shared → both allow the same user.',
                  'Two requests counted as one. Limit bypassed.',
                  'No way to enforce true rate limits at scale.',
                ].map((line) => (
                  <div key={line} className="flex gap-2">
                    <span className="text-red-500/60 shrink-0">›</span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-emerald-500/20 bg-emerald-500/3 p-8 border-l-0">
              <div className="font-mono text-xs text-emerald-400 tracking-widest mb-4">✓ WITH SHARDLEAK</div>
              <div className="space-y-3 font-mono text-xs text-zinc-500">
                {[
                  'Shared Redis instance holds canonical state.',
                  'API instance A: Lua script → tokens = 94 → 93. ALLOW.',
                  'API instance B: Lua script → tokens = 93 → 92. ALLOW.',
                  'Both instances see the same decrement sequence.',
                  '1000 concurrent requests, limit=100 → exactly 100 allowed.',
                ].map((line) => (
                  <div key={line} className="flex gap-2">
                    <span className="text-emerald-500/60 shrink-0">›</span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border border-zinc-800 border-t-0 p-6 bg-zinc-900/20">
            <div className="flex items-start gap-3">
              <span className="font-mono text-xs text-amber-400 shrink-0 mt-0.5">KEY INSIGHT</span>
              <p className="font-mono text-xs text-zinc-400 leading-relaxed">
                The rate-limit decision must be a single atomic Redis Lua operation — not a GET followed by a SET. Between a GET and a SET, any number of concurrent requests can read the same state and all be allowed. The Lua script serializes all access to a given identifier key.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="font-mono text-xs text-zinc-600 tracking-widest mb-4">02 / HOW IT WORKS</div>
          <h2 className="font-mono text-3xl lg:text-4xl font-bold text-white mb-16">
            Four steps. One atomic decision.
          </h2>

          <div className="space-y-0">
            {STEPS.map(({ n, label, heading, description, code }, i) => (
              <div key={n} className={`grid md:grid-cols-2 gap-0 border border-zinc-800 ${i > 0 ? '-mt-px' : ''}`}>
                <div className="p-8 border-r border-zinc-800">
                  <div className="flex items-start gap-4">
                    <span className="font-mono text-5xl font-bold text-zinc-800 leading-none select-none">{n}</span>
                    <div>
                      <div className="font-mono text-xs text-cyan-400 tracking-widest mb-2">{label}</div>
                      <h3 className="font-mono text-lg font-semibold text-white mb-3">{heading}</h3>
                      <p className="text-zinc-400 text-sm leading-relaxed">{description}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-zinc-900/50">
                  <pre className="font-mono text-xs text-zinc-400 leading-relaxed p-8 overflow-x-auto h-full whitespace-pre-wrap">{code}</pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Algorithms ── */}
      <section id="algorithms" className="py-24 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="font-mono text-xs text-zinc-600 tracking-widest mb-4">03 / ALGORITHMS</div>
          <h2 className="font-mono text-3xl lg:text-4xl font-bold text-white mb-4">
            Two algorithms, both atomic.
          </h2>
          <p className="text-zinc-400 mb-16 max-w-xl">
            Both execute as a single Redis Lua script. The entire read-modify-write is one atomic Redis command — concurrent requests cannot interleave.
          </p>

          <div className="grid md:grid-cols-2 gap-0">
            {/* Token Bucket */}
            <div className="border border-zinc-800 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 border border-cyan-400/30 bg-cyan-400/10 flex items-center justify-center">
                  <span className="font-mono text-xs text-cyan-400">TB</span>
                </div>
                <div>
                  <div className="font-mono text-sm text-white font-semibold">TOKEN BUCKET</div>
                  <div className="font-mono text-xs text-zinc-500">PRIMARY ALGORITHM</div>
                </div>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                Tokens accumulate continuously over time at a configured rate. Each request consumes one token. Allows controlled bursts up to the bucket capacity while enforcing the average rate.
              </p>
              <div className="space-y-2 mb-6">
                {[
                  { label: 'Capacity', value: 'configured limit' },
                  { label: 'Refill rate', value: 'limit ÷ window_seconds / sec' },
                  { label: 'Request cost', value: '1 token' },
                  { label: 'Burst', value: 'Yes — up to capacity' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-start gap-4">
                    <span className="font-mono text-xs text-zinc-500">{label}</span>
                    <span className="font-mono text-xs text-zinc-300 text-right">{value}</span>
                  </div>
                ))}
              </div>
              <div className="border border-zinc-700 bg-zinc-900 p-4">
                <div className="font-mono text-xs text-zinc-600 mb-2">bucket state — 7 / 10 tokens</div>
                <div className="flex gap-1 flex-wrap">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className={`w-5 h-5 border ${i < 7 ? 'border-cyan-400/40 bg-cyan-400/20' : 'border-zinc-700 bg-zinc-800'}`} />
                  ))}
                </div>
                <div className="font-mono text-xs text-zinc-600 mt-2">refilling at 1.67 tokens/sec</div>
              </div>
            </div>

            {/* Fixed Window */}
            <div className="border border-zinc-800 border-l-0 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 border border-zinc-600/30 bg-zinc-700/20 flex items-center justify-center">
                  <span className="font-mono text-xs text-zinc-400">FW</span>
                </div>
                <div>
                  <div className="font-mono text-sm text-white font-semibold">FIXED WINDOW</div>
                  <div className="font-mono text-xs text-zinc-500">SECONDARY ALGORITHM</div>
                </div>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                A counter resets at the start of each window. Simple and predictable. Known tradeoff: up to 2× the limit can pass at a window boundary (end of window N + start of window N+1).
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
              <div className="border border-zinc-700 bg-zinc-900 p-4">
                <div className="font-mono text-xs text-zinc-600 mb-2">window state</div>
                <div className="h-4 bg-zinc-800 border border-zinc-700 relative overflow-hidden">
                  <div className="h-full bg-zinc-600 w-[43%]" />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="font-mono text-xs text-zinc-600">43 / 100 used</span>
                  <span className="font-mono text-xs text-zinc-600">resets in 17s</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-zinc-800 border-t-0 p-6 bg-zinc-900/30">
            <div className="flex items-start gap-4">
              <div className="font-mono text-xs text-amber-400 mt-0.5 shrink-0">ATOMICITY</div>
              <p className="font-mono text-xs text-zinc-400 leading-relaxed">
                Both algorithms use <code className="text-zinc-300 bg-zinc-800 px-1">redis.call()</code> inside a Lua script. Redis guarantees no other command can run between the reads and writes inside a script. Two concurrent requests for the same identifier will serialize — the second sees the state the first left behind.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Architecture ── */}
      <section id="architecture" className="py-24 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="font-mono text-xs text-zinc-600 tracking-widest mb-4">04 / ARCHITECTURE</div>
          <h2 className="font-mono text-3xl lg:text-4xl font-bold text-white mb-4">
            Five layers, one contract.
          </h2>
          <p className="text-zinc-400 mb-16 max-w-xl">
            PostgreSQL stores what must persist. Redis stores what must be fast. Go coordinates the system.
          </p>

          <div className="grid md:grid-cols-5 gap-0 border border-zinc-800">
            {[
              { name: 'Go API', role: 'HTTP · Auth · Routing', color: 'text-cyan-400', desc: 'Stateless. Multiple instances. Coordinates Redis and PostgreSQL.' },
              { name: 'Redis', role: 'Rate-limit state · Lua', color: 'text-red-400', desc: 'Atomic Lua scripts. Token bucket + fixed window counters. TTL cleanup.' },
              { name: 'PostgreSQL', role: 'Users · Keys · Config', color: 'text-zinc-400', desc: 'Persistent data. API keys stored as SHA-256 hashes. Config per identifier.' },
              { name: 'Prometheus', role: 'Metrics · Scraping', color: 'text-orange-400', desc: '6 core metrics. 15s scrape interval. P95/P99 latency histograms.' },
              { name: 'Grafana', role: 'Dashboards · Alerts', color: 'text-yellow-400', desc: 'Auto-provisioned. 7 panels. requests/sec, allowed, rejected, latency.' },
            ].map(({ name, role, color, desc }) => (
              <div key={name} className="border-r border-zinc-800 last:border-r-0 p-6">
                <div className={`font-mono text-xs ${color} tracking-widest mb-1`}>{name}</div>
                <div className="font-mono text-xs text-zinc-600 mb-3">{role}</div>
                <p className="font-mono text-xs text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 border border-zinc-800 p-8 bg-zinc-900/20 bg-grid-sm">
            <div className="font-mono text-xs text-zinc-600 tracking-widest mb-6">STACK</div>
            <div className="flex items-start justify-center gap-8 text-center flex-wrap">
              {[
                { name: 'Go 1.25', sub: 'application' },
                { name: 'Chi', sub: 'routing' },
                { name: 'Redis Lua', sub: 'atomicity' },
                { name: 'pgx', sub: 'postgres driver' },
                { name: 'Prometheus', sub: 'metrics' },
                { name: 'Next.js 16', sub: 'frontend' },
                { name: 'Docker Compose', sub: 'local stack' },
                { name: 'GitHub Actions', sub: 'CI/CD' },
              ].map(({ name, sub }) => (
                <div key={name} className="border border-zinc-800 bg-zinc-900 px-4 py-3 min-w-[100px]">
                  <div className="font-mono text-sm text-white">{name}</div>
                  <div className="font-mono text-xs text-zinc-600 mt-0.5">{sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Performance ── */}
      <section className="py-24 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="font-mono text-xs text-zinc-600 tracking-widest mb-4">05 / PERFORMANCE</div>
          <h2 className="font-mono text-3xl lg:text-4xl font-bold text-white mb-16">
            Numbers that matter.
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-0">
            {[
              { value: '0.4ms', label: 'P95 LATENCY', sub: 'Redis Lua execution + loopback', accent: true },
              { value: '0.9ms', label: 'P99 LATENCY', sub: 'tail latency at load' },
              { value: '100', label: 'CONCURRENT LIMIT', sub: 'exactly 100 allowed out of 1000 concurrent', accent: true },
              { value: '0', label: 'RACE CONDITIONS', sub: 'Lua atomicity eliminates split-brain' },
            ].map(({ value, label, sub, accent }, i) => (
              <div key={label} className={`border border-zinc-800 p-6 ${i > 0 ? '-ml-px' : ''}`}>
                <div className={`font-mono text-4xl font-bold mb-2 ${accent ? 'text-cyan-400' : 'text-white'}`}>{value}</div>
                <div className="font-mono text-xs text-zinc-500 tracking-widest mb-1">{label}</div>
                <div className="font-mono text-xs text-zinc-700">{sub}</div>
              </div>
            ))}
          </div>

          <div className="mt-0 border border-zinc-800 border-t-0 p-6 bg-zinc-900/20">
            <div className="flex items-start gap-4">
              <span className="font-mono text-xs text-cyan-400 shrink-0 mt-0.5">CONCURRENCY TEST</span>
              <p className="font-mono text-xs text-zinc-400 leading-relaxed">
                1000 goroutines fire simultaneously against the same identifier with limit=100. After all requests resolve: exactly 100 allowed, 900 rejected. Verified with Go race detector (<code className="text-zinc-300 bg-zinc-800 px-1">go test -race</code>). This is the atomicity guarantee.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <div className="font-mono text-xs text-zinc-600 tracking-widest mb-4">06 / TRY IT</div>
          <h2 className="font-mono text-3xl lg:text-4xl font-bold text-white mb-6">
            See the rate limiter in action.
          </h2>
          <p className="text-zinc-400 mb-10 max-w-lg mx-auto">
            Open the playground and click CHECK REQUEST repeatedly. Watch tokens drain, see RATE LIMITED trigger, and watch them refill over time.
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            <Link href="/dashboard/playground" className="font-mono font-semibold text-sm bg-cyan-400 text-zinc-950 px-8 py-4 hover:bg-cyan-300 transition-colors">
              Open Playground →
            </Link>
            <Link href="/dashboard" className="font-mono text-sm border border-zinc-700 text-zinc-300 px-8 py-4 hover:border-zinc-500 hover:text-white transition-colors">
              View Dashboard
            </Link>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-0 max-w-3xl mx-auto">
            {[
              { icon: '◈', title: 'Playground', desc: 'Interactive rate-limit demo. Token Bucket and Fixed Window.' },
              { icon: '⊟', title: 'Live Metrics', desc: 'Real-time request counters, latency, allowed vs rejected.' },
              { icon: '▶', title: 'Full Stack', desc: 'Go + Redis + PostgreSQL + Prometheus + Grafana. One docker compose up.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="border border-zinc-800 p-6 text-left">
                <div className="font-mono text-2xl text-zinc-600 mb-3">{icon}</div>
                <div className="font-mono text-sm text-white font-semibold mb-2">{title}</div>
                <div className="font-mono text-xs text-zinc-500 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-800 py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between flex-wrap gap-4">
          <span className="font-mono text-xs text-zinc-600 tracking-widest">SHARDLEAK</span>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-zinc-700">Distributed Rate Limiting Service</span>
            <span className="font-mono text-xs border border-amber-400/20 text-amber-400/70 px-2 py-0.5">DEMO</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
