'use client';

import { useState, useRef } from 'react';
import { api, ApiError } from '@/lib/api';
import type { CheckResult } from '@/types/api';

interface Decision {
  id: number;
  allowed: boolean;
  remaining: number;
  retryAfter: number | null;
  resetAt: string;
  latencyMs: number;
  identifier: string;
  algorithm: string;
}

let decisionCounter = 0;

function ResultDisplay({ result, latency }: { result: Decision; latency: number }) {
  return (
    <div
      className={`border p-8 transition-all ${
        result.allowed
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-red-500/30 bg-red-500/5'
      }`}
    >
      <div
        className={`font-mono text-4xl font-bold mb-6 ${
          result.allowed ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {result.allowed ? '✓ ALLOWED' : '✗ RATE LIMITED'}
      </div>

      <div className="space-y-3">
        {[
          { label: 'Remaining', value: String(result.remaining) },
          { label: 'Latency', value: `${latency} ms` },
          {
            label: result.allowed ? 'Reset at' : 'Retry after',
            value: result.retryAfter != null
              ? `${result.retryAfter}s`
              : new Date(result.resetAt).toLocaleTimeString(),
          },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-baseline justify-between border-b border-zinc-800 pb-2">
            <span className="font-mono text-xs text-zinc-500">{label}</span>
            <span
              className={`font-mono text-lg font-semibold ${
                label === 'Remaining' && result.remaining === 0
                  ? 'text-red-400'
                  : 'text-white'
              }`}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlaygroundPage() {
  const [identifier, setIdentifier] = useState('user:demo');
  const [algorithm, setAlgorithm] = useState<'token_bucket' | 'fixed_window'>('token_bucket');
  const [limit, setLimit] = useState(10);
  const [windowSeconds, setWindowSeconds] = useState(60);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<Decision | null>(null);
  const [lastLatency, setLastLatency] = useState(0);
  const [history, setHistory] = useState<Decision[]>([]);
  const historyRef = useRef<HTMLDivElement>(null);

  async function handleCheck() {
    if (!apiKey.trim()) {
      setError('Enter an API key. Create one on the API Keys page.');
      return;
    }
    if (!identifier.trim()) {
      setError('Identifier is required.');
      return;
    }
    setError('');
    setLoading(true);

    const t0 = performance.now();
    try {
      const result: CheckResult = await api.check.execute(apiKey.trim(), {
        identifier,
        algorithm,
        limit,
        window_seconds: windowSeconds,
      });
      const latency = Math.round(performance.now() - t0);

      const decision: Decision = {
        id: ++decisionCounter,
        allowed: result.allowed,
        remaining: result.remaining,
        retryAfter: result.retry_after,
        resetAt: result.reset_at,
        latencyMs: latency,
        identifier,
        algorithm,
      };
      setLastResult(decision);
      setLastLatency(latency);
      setHistory((prev) => [decision, ...prev].slice(0, 50));

      setTimeout(() => {
        historyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Invalid or revoked API key.');
        } else if (err.status === 503) {
          setError('Redis is unavailable. Is the backend stack running?');
        } else {
          setError(err.message);
        }
      } else {
        setError('Cannot reach the API. Check that the backend is running.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 border-b border-zinc-800 pb-6">
        <div className="font-mono text-xs text-zinc-600 tracking-widest mb-1">DASHBOARD / PLAYGROUND</div>
        <h1 className="font-mono text-2xl font-bold text-white">Request Playground</h1>
        <p className="font-mono text-xs text-zinc-600 mt-1">
          Click CHECK REQUEST repeatedly to watch the rate limit deplete in real time.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-0">
        {/* Left: configuration */}
        <div className="border border-zinc-800">
          <div className="px-6 py-4 border-b border-zinc-800">
            <span className="font-mono text-xs text-zinc-400 tracking-widest">CONFIGURATION</span>
          </div>

          <div className="p-6 space-y-5">
            {error && (
              <div className="border border-red-500/30 bg-red-500/10 text-red-400 font-mono text-xs p-3">
                {error}
              </div>
            )}

            <div>
              <label className="block font-mono text-xs text-zinc-500 mb-2">IDENTIFIER</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="user:123"
                className="w-full bg-zinc-950 border border-zinc-700 text-white font-mono text-sm px-4 py-3 placeholder-zinc-700 focus:outline-none focus:border-cyan-400/60 transition-colors"
              />
              <p className="font-mono text-xs text-zinc-700 mt-1.5">
                e.g. user:123, api-key:abc, ip:10.0.0.1
              </p>
            </div>

            <div>
              <label className="block font-mono text-xs text-zinc-500 mb-2">ALGORITHM</label>
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value as typeof algorithm)}
                className="w-full bg-zinc-950 border border-zinc-700 text-white font-mono text-sm px-4 py-3 focus:outline-none focus:border-cyan-400/60 transition-colors"
              >
                <option value="token_bucket">Token Bucket</option>
                <option value="fixed_window">Fixed Window</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-xs text-zinc-500 mb-2">LIMIT</label>
                <input
                  type="number"
                  min={1}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-700 text-white font-mono text-sm px-4 py-3 focus:outline-none focus:border-cyan-400/60 transition-colors"
                />
              </div>
              <div>
                <label className="block font-mono text-xs text-zinc-500 mb-2">WINDOW (sec)</label>
                <input
                  type="number"
                  min={1}
                  value={windowSeconds}
                  onChange={(e) => setWindowSeconds(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-700 text-white font-mono text-sm px-4 py-3 focus:outline-none focus:border-cyan-400/60 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block font-mono text-xs text-zinc-500 mb-2">
                API KEY
                <span className="ml-2 text-zinc-700">sk_shard_...</span>
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_shard_..."
                className="w-full bg-zinc-950 border border-zinc-700 text-white font-mono text-sm px-4 py-3 placeholder-zinc-700 focus:outline-none focus:border-cyan-400/60 transition-colors"
              />
              <p className="font-mono text-xs text-zinc-700 mt-1.5">
                Create a key on the{' '}
                <a href="/dashboard/api-keys" className="text-cyan-400 hover:text-cyan-300">
                  API Keys
                </a>{' '}
                page and paste it here.
              </p>
            </div>

            <button
              onClick={handleCheck}
              disabled={loading}
              className="w-full bg-cyan-400 text-zinc-950 font-mono font-semibold text-sm py-4 hover:bg-cyan-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'CHECKING...' : '▶ CHECK REQUEST'}
            </button>
          </div>
        </div>

        {/* Right: result + history */}
        <div className="border border-zinc-800 -ml-px flex flex-col">
          {/* Result */}
          <div className="px-6 py-4 border-b border-zinc-800">
            <span className="font-mono text-xs text-zinc-400 tracking-widest">RESULT</span>
          </div>

          <div className="p-6">
            {lastResult ? (
              <ResultDisplay result={lastResult} latency={lastLatency} />
            ) : (
              <div className="border border-zinc-800 p-8 text-center">
                <div className="font-mono text-xs text-zinc-700 mb-2">
                  Configure the parameters and click CHECK REQUEST.
                </div>
                <div className="font-mono text-xs text-zinc-800">
                  The decision executes as an atomic Redis Lua script.
                </div>
              </div>
            )}
          </div>

          {/* Request history */}
          {history.length > 0 && (
            <>
              <div className="px-6 py-3 border-t border-zinc-800 flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-600 tracking-widest">
                  REQUEST LOG
                </span>
                <button
                  onClick={() => setHistory([])}
                  className="font-mono text-xs text-zinc-700 hover:text-zinc-500 transition-colors"
                >
                  Clear
                </button>
              </div>

              <div
                ref={historyRef}
                className="flex-1 overflow-y-auto max-h-64 border-t border-zinc-800/50"
              >
                {history.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-center justify-between px-6 py-2 border-b border-zinc-800/40 font-mono text-xs ${
                      d.allowed ? '' : 'bg-red-500/3'
                    }`}
                  >
                    <span className="text-zinc-700 w-8 shrink-0">#{d.id}</span>
                    <span
                      className={`w-24 shrink-0 font-semibold ${
                        d.allowed ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {d.allowed ? 'ALLOWED' : 'REJECTED'}
                    </span>
                    <span className="text-zinc-600 w-20 shrink-0">
                      rem={d.remaining}
                    </span>
                    <span className="text-zinc-700">{d.latencyMs}ms</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Atomicity callout */}
      <div className="mt-0 border border-zinc-800 border-t-0 p-5 bg-zinc-900/20">
        <div className="flex items-start gap-3">
          <span className="font-mono text-xs text-cyan-400 shrink-0 mt-0.5">ATOMICITY</span>
          <p className="font-mono text-xs text-zinc-600 leading-relaxed">
            Each click executes a single Redis Lua script that reads state, checks the limit,
            updates state, and returns the result atomically. Under 1000 concurrent requests
            with limit=100, exactly 100 are allowed — no more, no less.
          </p>
        </div>
      </div>
    </div>
  );
}
