'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckResult, Simulator } from '../../../lib/simulator';

// Singleton simulator for the page
const sim = new Simulator();

// ─── Token Bucket visual ───────────────────────────────────────────────────────

function TokenGrid({ tokens, limit }: { tokens: number; limit: number }) {
  const cells = Math.min(limit, 64);
  const filled = Math.round((tokens / limit) * cells);
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: cells }).map((_, i) => (
        <div
          key={i}
          className={`w-4 h-4 border transition-all duration-200 ${
            i < filled
              ? 'border-cyan-400/50 bg-cyan-400/25'
              : 'border-zinc-700 bg-zinc-900'
          }`}
        />
      ))}
    </div>
  );
}

// ─── Fixed Window bar ──────────────────────────────────────────────────────────

function WindowBar({ count, limit, secondsLeft, windowSeconds }: {
  count: number;
  limit: number;
  secondsLeft: number;
  windowSeconds: number;
}) {
  const pct = Math.min(100, (count / limit) * 100);
  const timePct = Math.min(100, ((windowSeconds - secondsLeft) / windowSeconds) * 100);
  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between font-mono text-xs text-zinc-500 mb-1.5">
          <span>Requests used</span>
          <span>{count} / {limit}</span>
        </div>
        <div className="h-5 bg-zinc-900 border border-zinc-700 relative overflow-hidden">
          <div
            className={`h-full transition-all duration-200 ${pct >= 100 ? 'bg-red-500/40 border-r border-red-500' : 'bg-cyan-400/25 border-r border-cyan-400/50'}`}
            style={{ width: `${pct}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-end px-2">
            <span className="font-mono text-xs text-zinc-400">{pct.toFixed(0)}%</span>
          </div>
        </div>
      </div>
      <div>
        <div className="flex justify-between font-mono text-xs text-zinc-500 mb-1.5">
          <span>Window time elapsed</span>
          <span>resets in {secondsLeft}s</span>
        </div>
        <div className="h-2 bg-zinc-900 border border-zinc-700 overflow-hidden">
          <div className="h-full bg-zinc-700 transition-all duration-1000" style={{ width: `${timePct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Request log row ────────────────────────────────────────────────────────────

interface LogEntry {
  id: number;
  allowed: boolean;
  remaining: number;
  latencyMs: number;
  ts: string;
}

// ─── Main playground ────────────────────────────────────────────────────────────

let _logId = 1;

export default function PlaygroundPage() {
  // Config
  const [identifier, setIdentifier] = useState('demo-user:1');
  const [algorithm, setAlgorithm] = useState<'token_bucket' | 'fixed_window'>('token_bucket');
  const [limit, setLimit] = useState(10);
  const [windowSeconds, setWindowSeconds] = useState(30);

  // Last result
  const [result, setResult] = useState<CheckResult | null>(null);

  // Log
  const [log, setLog] = useState<LogEntry[]>([]);

  // Token bucket state (polled continuously for the visual)
  const [tokens, setTokens] = useState<number>(10);
  const [windowState, setWindowState] = useState<{ count: number; secondsLeft: number }>({ count: 0, secondsLeft: 30 });

  // Burst mode
  const [bursting, setBursting] = useState(false);
  const burstRef = useRef(false);

  // Poll visual state
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      setTokens(sim.peekTokens(identifier, limit, windowSeconds));
      setWindowState(sim.peekWindow(identifier, limit, windowSeconds));
    }, 200);
  }, [identifier, limit, windowSeconds]);

  useEffect(() => {
    setTokens(sim.peekTokens(identifier, limit, windowSeconds));
    setWindowState(sim.peekWindow(identifier, limit, windowSeconds));
    startPolling();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [identifier, limit, windowSeconds, startPolling]);

  const fireRequest = useCallback(() => {
    const r = sim.check({ identifier, algorithm, limit, windowSeconds });
    setResult(r);
    setLog((prev) => [{
      id: _logId++,
      allowed: r.allowed,
      remaining: r.remaining,
      latencyMs: r.latencyMs,
      ts: new Date().toISOString().split('T')[1].slice(0, 12),
    }, ...prev].slice(0, 50));
  }, [identifier, algorithm, limit, windowSeconds]);

  const handleReset = () => {
    sim.reset(identifier);
    setResult(null);
    setLog([]);
  };

  const handleBurst = async () => {
    if (bursting) return;
    setBursting(true);
    burstRef.current = true;
    for (let i = 0; i < 20 && burstRef.current; i++) {
      fireRequest();
      await new Promise((r) => setTimeout(r, 80));
    }
    setBursting(false);
    burstRef.current = false;
  };

  const allowedCount = log.filter((e) => e.allowed).length;
  const rejectedCount = log.filter((e) => !e.allowed).length;

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="font-mono text-xl font-bold text-white">Request Playground</h1>
        <p className="font-mono text-xs text-zinc-600 mt-1">
          Rate-limit simulation runs entirely in your browser. No backend. Real token bucket and fixed window math.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: Config + action */}
        <div className="lg:col-span-2 space-y-0">
          {/* Config panel */}
          <div className="border border-zinc-800">
            <div className="border-b border-zinc-800 px-4 py-3">
              <span className="font-mono text-xs text-zinc-400 tracking-widest">CONFIGURATION</span>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block font-mono text-xs text-zinc-500 mb-1.5">IDENTIFIER</label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value || 'demo-user:1')}
                  className="w-full bg-zinc-900 border border-zinc-700 px-3 py-2 font-mono text-xs text-white focus:outline-none focus:border-cyan-400/50 transition-colors"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-zinc-500 mb-1.5">ALGORITHM</label>
                <div className="flex">
                  {(['token_bucket', 'fixed_window'] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => setAlgorithm(a)}
                      className={`flex-1 py-2 font-mono text-xs border transition-colors ${
                        algorithm === a
                          ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-400'
                          : 'border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                      } ${a === 'fixed_window' ? '-ml-px' : ''}`}
                    >
                      {a === 'token_bucket' ? 'TOKEN BUCKET' : 'FIXED WINDOW'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-xs text-zinc-500 mb-1.5">LIMIT</label>
                  <input
                    type="number"
                    min={1} max={200}
                    value={limit}
                    onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value))))}
                    className="w-full bg-zinc-900 border border-zinc-700 px-3 py-2 font-mono text-xs text-white focus:outline-none focus:border-cyan-400/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block font-mono text-xs text-zinc-500 mb-1.5">WINDOW (s)</label>
                  <input
                    type="number"
                    min={5} max={300}
                    value={windowSeconds}
                    onChange={(e) => setWindowSeconds(Math.max(5, Math.min(300, Number(e.target.value))))}
                    className="w-full bg-zinc-900 border border-zinc-700 px-3 py-2 font-mono text-xs text-white focus:outline-none focus:border-cyan-400/50 transition-colors"
                  />
                </div>
              </div>

              <div className="border border-zinc-800 bg-zinc-900/30 px-3 py-2.5 font-mono text-xs text-zinc-500 leading-relaxed">
                {algorithm === 'token_bucket'
                  ? `Refill rate: ${(limit / windowSeconds).toFixed(2)} tokens/sec. Burst up to ${limit}.`
                  : `Counter resets every ${windowSeconds}s. No burst smoothing.`}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="border border-zinc-800 border-t-0 p-4 space-y-2">
            <button
              onClick={fireRequest}
              className="w-full font-mono text-sm font-bold bg-cyan-400 text-zinc-950 py-4 hover:bg-cyan-300 transition-colors active:scale-[0.99]"
            >
              CHECK REQUEST →
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleBurst}
                disabled={bursting}
                className="flex-1 font-mono text-xs border border-zinc-700 text-zinc-400 py-2.5 hover:border-zinc-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bursting ? 'BURSTING...' : 'BURST ×20'}
              </button>
              <button
                onClick={handleReset}
                className="flex-1 font-mono text-xs border border-zinc-700 text-zinc-500 py-2.5 hover:border-red-500/40 hover:text-red-400 transition-colors"
              >
                RESET
              </button>
            </div>
          </div>

          {/* Session stats */}
          {log.length > 0 && (
            <div className="border border-zinc-800 border-t-0 px-4 py-3 grid grid-cols-3 gap-0 divide-x divide-zinc-800">
              <div className="pr-4 text-center">
                <div className="font-mono text-xl font-bold text-white">{log.length}</div>
                <div className="font-mono text-xs text-zinc-600 mt-0.5">TOTAL</div>
              </div>
              <div className="px-4 text-center">
                <div className="font-mono text-xl font-bold text-cyan-400">{allowedCount}</div>
                <div className="font-mono text-xs text-zinc-600 mt-0.5">ALLOWED</div>
              </div>
              <div className="pl-4 text-center">
                <div className="font-mono text-xl font-bold text-red-400">{rejectedCount}</div>
                <div className="font-mono text-xs text-zinc-600 mt-0.5">REJECTED</div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Result + state + log */}
        <div className="lg:col-span-3 space-y-0">
          {/* Decision result */}
          <div className={`border p-6 transition-all duration-300 ${
            result === null
              ? 'border-zinc-800 bg-zinc-900/20'
              : result.allowed
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-red-500/30 bg-red-500/5'
          }`}>
            {result === null ? (
              <div className="text-center py-6">
                <div className="font-mono text-zinc-700 text-4xl mb-3">—</div>
                <div className="font-mono text-xs text-zinc-600">Click CHECK REQUEST to fire a rate-limit check.</div>
              </div>
            ) : (
              <div>
                <div className={`font-mono text-4xl font-bold mb-4 ${result.allowed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.allowed ? '✓ ALLOWED' : '✗ RATE LIMITED'}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  {[
                    { label: 'REMAINING', value: result.remaining.toString() },
                    { label: 'LATENCY', value: `${result.latencyMs}ms` },
                    { label: 'RESET AT', value: new Date(result.resetAt * 1000).toLocaleTimeString() },
                    { label: result.retryAfter ? 'RETRY IN' : 'STATUS', value: result.retryAfter ? `${result.retryAfter}s` : 'OK' },
                  ].map(({ label, value }) => (
                    <div key={label} className="border border-zinc-800/60 px-3 py-2.5 bg-zinc-900/40">
                      <div className="font-mono text-xs text-zinc-600 mb-1">{label}</div>
                      <div className="font-mono text-sm text-white">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800 p-3 font-mono text-xs text-zinc-500 leading-relaxed">
                  <span className="text-zinc-400">X-RateLimit-Limit: </span>{limit}{'   '}
                  <span className="text-zinc-400">X-RateLimit-Remaining: </span>{result.remaining}
                  {result.retryAfter && (
                    <><br/><span className="text-zinc-400">Retry-After: </span>{result.retryAfter}</>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Algorithm state */}
          <div className="border border-zinc-800 border-t-0 p-5">
            <div className="font-mono text-xs text-zinc-500 tracking-widest mb-4">
              {algorithm === 'token_bucket' ? 'TOKEN BUCKET STATE' : 'FIXED WINDOW STATE'}
            </div>
            {algorithm === 'token_bucket' ? (
              <div className="space-y-3">
                <div className="flex justify-between font-mono text-xs text-zinc-500 mb-2">
                  <span>Tokens available</span>
                  <span className="text-white">{tokens.toFixed(1)} / {limit}</span>
                </div>
                <TokenGrid tokens={tokens} limit={Math.min(limit, 64)} />
                <div className="font-mono text-xs text-zinc-700 mt-2">
                  Refilling at {(limit / windowSeconds).toFixed(2)} tokens/sec · Click repeatedly to drain the bucket
                </div>
              </div>
            ) : (
              <WindowBar
                count={windowState.count}
                limit={limit}
                secondsLeft={windowState.secondsLeft}
                windowSeconds={windowSeconds}
              />
            )}
          </div>

          {/* Request log */}
          <div className="border border-zinc-800 border-t-0">
            <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
              <span className="font-mono text-xs text-zinc-400 tracking-widest">REQUEST LOG</span>
              <span className="font-mono text-xs text-zinc-600">{log.length} requests</span>
            </div>
            <div className="divide-y divide-zinc-800/40 max-h-[320px] overflow-y-auto">
              {log.length === 0 && (
                <div className="px-4 py-8 text-center font-mono text-xs text-zinc-700">
                  No requests yet. Click CHECK REQUEST.
                </div>
              )}
              {log.map((entry) => (
                <div key={entry.id} className="px-4 py-2 flex items-center gap-3 font-mono text-xs hover:bg-zinc-900/30 transition-colors">
                  <span className={`shrink-0 w-16 text-center border px-1.5 py-0.5 ${entry.allowed ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                    {entry.allowed ? 'ALLOW' : 'REJECT'}
                  </span>
                  <span className="text-zinc-600 flex-1">remaining: <span className="text-zinc-400">{entry.remaining}</span></span>
                  <span className="text-zinc-700 shrink-0 w-14 text-right">{entry.latencyMs}ms</span>
                  <span className="text-zinc-800 shrink-0 hidden sm:block w-20 text-right">{entry.ts}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Info strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-zinc-800">
        {[
          {
            label: 'SIMULATOR',
            text: 'This demo runs entirely in your browser. The Simulator class implements the same token bucket and fixed window math as the Go/Lua backend — sub-millisecond, no network calls.',
          },
          {
            label: 'ATOMICITY',
            text: 'In production, the entire read-modify-write is a single Redis Lua script. Concurrent requests serialize at the Lua layer — no race conditions, no split-brain decisions.',
          },
          {
            label: 'DEMO',
            text: 'The real backend handles 1000 concurrent requests with limit=100 and allows exactly 100. Verified with Go race detector (go test -race). Try BURST ×20 to drain the bucket fast.',
          },
        ].map(({ label, text }, i) => (
          <div key={label} className={`p-5 ${i > 0 ? 'border-l border-zinc-800' : ''}`}>
            <div className="font-mono text-xs text-zinc-600 tracking-widest mb-2">{label}</div>
            <p className="font-mono text-xs text-zinc-500 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
