'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// ─── Live counter hook (counts up to target over time, then drifts) ───────────

function useLiveCounter(base: number, ratePerSec: number) {
  const [value, setValue] = useState(base);
  const ref = useRef({ value: base, last: Date.now() });

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - ref.current.last) / 1000;
      ref.current.last = now;
      const delta = Math.round(ratePerSec * elapsed * (0.85 + Math.random() * 0.3));
      ref.current.value += delta;
      setValue(ref.current.value);
    }, 400);
    return () => clearInterval(id);
  }, [ratePerSec]);

  return value;
}

// ─── Sparkline (SVG mini chart) ───────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 120, h = 32;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - (v / max) * h * 0.85 - 2,
  ]);
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Hook: rolling sparkline ───────────────────────────────────────────────────

function useSparkline(initialRate: number, points = 16) {
  const [data, setData] = useState<number[]>(() =>
    Array.from({ length: points }, () => Math.round(initialRate * (0.8 + Math.random() * 0.4)))
  );
  useEffect(() => {
    const id = setInterval(() => {
      setData((prev) => {
        const next = [...prev.slice(1), Math.round(initialRate * (0.75 + Math.random() * 0.5))];
        return next;
      });
    }, 800);
    return () => clearInterval(id);
  }, [initialRate]);
  return data;
}

// ─── Decision feed entry ──────────────────────────────────────────────────────

interface Decision {
  id: number;
  identifier: string;
  algorithm: string;
  allowed: boolean;
  remaining: number;
  latencyMs: number;
  ts: string;
}

const IDENTIFIERS = ['user:7291', 'user:3847', 'api:checkout', 'ip:203.0.113.42', 'api:search', 'user:5512'];
const ALGORITHMS = ['token_bucket', 'token_bucket', 'token_bucket', 'fixed_window'];

let _id = 1;
function makeDecision(): Decision {
  const allowed = Math.random() > 0.28;
  return {
    id: _id++,
    identifier: IDENTIFIERS[Math.floor(Math.random() * IDENTIFIERS.length)],
    algorithm: ALGORITHMS[Math.floor(Math.random() * ALGORITHMS.length)],
    allowed,
    remaining: allowed ? Math.floor(Math.random() * 80 + 5) : 0,
    latencyMs: Math.round((0.2 + Math.random() * 0.9) * 10) / 10,
    ts: new Date().toISOString(),
  };
}

function useDecisionFeed(maxLen = 12) {
  const [feed, setFeed] = useState<Decision[]>(() =>
    Array.from({ length: 8 }, makeDecision)
  );
  useEffect(() => {
    const id = setInterval(() => {
      setFeed((prev) => [makeDecision(), ...prev].slice(0, maxLen));
    }, 650);
    return () => clearInterval(id);
  }, [maxLen]);
  return feed;
}

// ─── Active rate limit rows (static demo data) ───────────────────────────────

const ACTIVE_LIMITS = [
  { identifier: 'user:7291', algorithm: 'token_bucket', limit: 100, window: 60 },
  { identifier: 'api:checkout', algorithm: 'token_bucket', limit: 50, window: 10 },
  { identifier: 'ip:203.0.113.42', algorithm: 'fixed_window', limit: 200, window: 60 },
  { identifier: 'api:search', algorithm: 'token_bucket', limit: 300, window: 60 },
  { identifier: 'user:5512', algorithm: 'fixed_window', limit: 20, window: 30 },
];

// ─── Main dashboard page ───────────────────────────────────────────────────────

export default function DashboardPage() {
  const totalRequests = useLiveCounter(2_847_293, 48);
  const allowed = useLiveCounter(2_161_743, 36);
  const rejected = useLiveCounter(685_550, 12);
  const redisErrors = useLiveCounter(0, 0);

  const reqSpark = useSparkline(48);
  const allowSpark = useSparkline(36);
  const rejSpark = useSparkline(12);
  const latSpark = useSparkline(0.41, 16);

  const feed = useDecisionFeed();

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="font-mono text-xl font-bold text-white">Overview</h1>
        <p className="font-mono text-xs text-zinc-600 mt-1">Simulated metrics — demo mode, no backend required.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-0">
        {[
          { label: 'TOTAL REQUESTS', value: totalRequests.toLocaleString(), sub: '+48/sec', spark: reqSpark, color: '#a1a1aa', accent: false },
          { label: 'ALLOWED', value: allowed.toLocaleString(), sub: '75.9% allow rate', spark: allowSpark, color: '#22d3ee', accent: true },
          { label: 'REJECTED', value: rejected.toLocaleString(), sub: '24.1% reject rate', spark: rejSpark, color: '#f87171', accent: false },
          { label: 'P95 LATENCY', value: '0.4ms', sub: 'Redis Lua decision', spark: latSpark, color: '#a3e635', accent: false },
        ].map(({ label, value, sub, spark, color, accent }, i) => (
          <div key={label} className={`border border-zinc-800 p-5 ${i > 0 ? '-ml-px' : ''} bg-zinc-900/20`}>
            <div className="flex items-start justify-between mb-3">
              <div className="font-mono text-xs text-zinc-500 tracking-widest">{label}</div>
              <Sparkline data={spark} color={color} />
            </div>
            <div className={`font-mono text-2xl font-bold mb-1 ${accent ? 'text-cyan-400' : 'text-white'}`}>{value}</div>
            <div className="font-mono text-xs text-zinc-600">{sub}</div>
          </div>
        ))}
      </div>

      {/* P99 / Redis errors / DB errors secondary row */}
      <div className="grid grid-cols-3 gap-0 -mt-px">
        {[
          { label: 'P99 LATENCY', value: '0.9ms', color: 'text-white' },
          { label: 'REDIS ERRORS', value: redisErrors.toString(), color: 'text-white' },
          { label: 'DB ERRORS', value: '0', color: 'text-white' },
        ].map(({ label, value, color }, i) => (
          <div key={label} className={`border border-zinc-800 border-t-0 px-5 py-3 ${i > 0 ? '-ml-px' : ''} flex items-center justify-between`}>
            <span className="font-mono text-xs text-zinc-600">{label}</span>
            <span className={`font-mono text-sm font-semibold ${color}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Decision feed */}
        <div className="lg:col-span-3 border border-zinc-800">
          <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
            <span className="font-mono text-xs text-zinc-400 tracking-widest">RECENT DECISIONS</span>
            <span className="font-mono text-xs text-zinc-600">live</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {feed.map((d) => (
              <div key={d.id} className="px-4 py-2.5 flex items-center gap-3 font-mono text-xs hover:bg-zinc-900/40 transition-colors animate-tick">
                <span className={`shrink-0 w-16 text-center border px-1.5 py-0.5 ${d.allowed ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                  {d.allowed ? 'ALLOW' : 'REJECT'}
                </span>
                <span className="text-zinc-400 truncate flex-1">{d.identifier}</span>
                <span className="text-zinc-600 shrink-0 hidden sm:block">{d.algorithm === 'token_bucket' ? 'TB' : 'FW'}</span>
                <span className="text-zinc-600 shrink-0 w-12 text-right">{d.remaining}</span>
                <span className="text-zinc-700 shrink-0 w-14 text-right">{d.latencyMs}ms</span>
              </div>
            ))}
          </div>
        </div>

        {/* Active rate limits */}
        <div className="lg:col-span-2 border border-zinc-800">
          <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
            <span className="font-mono text-xs text-zinc-400 tracking-widest">ACTIVE LIMITS</span>
            <span className="font-mono text-xs text-zinc-600">{ACTIVE_LIMITS.length}</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {ACTIVE_LIMITS.map((l) => (
              <div key={l.identifier} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-mono text-xs text-zinc-300 truncate">{l.identifier}</span>
                  <span className={`font-mono text-xs shrink-0 ${l.algorithm === 'token_bucket' ? 'text-cyan-400' : 'text-zinc-500'}`}>
                    {l.algorithm === 'token_bucket' ? 'TB' : 'FW'}
                  </span>
                </div>
                <div className="font-mono text-xs text-zinc-600">
                  {l.limit} req / {l.window}s
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-zinc-800 p-4">
            <Link
              href="/dashboard/playground"
              className="block w-full text-center font-mono text-xs text-cyan-400 border border-cyan-400/30 py-2.5 hover:bg-cyan-400/5 transition-colors"
            >
              Open Playground →
            </Link>
          </div>
        </div>
      </div>

      {/* Architecture reminder */}
      <div className="border border-zinc-800 p-5 bg-zinc-900/20">
        <div className="font-mono text-xs text-zinc-600 tracking-widest mb-3">ARCHITECTURE</div>
        <div className="flex items-center gap-3 flex-wrap font-mono text-xs text-zinc-500">
          {[
            'CLIENT', '→', 'SHARDLEAK API (Go · stateless)', '→', 'Redis Lua (atomic)',
            '→', 'PostgreSQL (config)', '→', 'ALLOW / REJECT',
          ].map((s, i) => (
            <span key={i} className={s === '→' ? 'text-zinc-700' : s.includes('Lua') ? 'text-cyan-400/80' : ''}>
              {s}
            </span>
          ))}
        </div>
        <div className="mt-3 font-mono text-xs text-zinc-700">
          Multiple API instances share Redis state. Lua atomicity prevents race conditions at any scale.
        </div>
      </div>
    </div>
  );
}
