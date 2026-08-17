'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { APIKeyMeta, LimitConfig } from '@/types/api';

function KPICard({
  label,
  value,
  sublabel,
  accent = false,
  dim = false,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  accent?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="border border-zinc-800 p-6 bg-zinc-900/30">
      <div className="font-mono text-xs text-zinc-600 tracking-widest mb-3">{label}</div>
      <div
        className={`font-mono text-3xl font-bold mb-1 ${
          dim ? 'text-zinc-700' : accent ? 'text-cyan-400' : 'text-white'
        }`}
      >
        {value}
      </div>
      {sublabel && (
        <div className="font-mono text-xs text-zinc-700">{sublabel}</div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [apiKeys, setApiKeys] = useState<APIKeyMeta[]>([]);
  const [limits, setLimits] = useState<LimitConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.apiKeys.list(), api.limits.list()])
      .then(([keysData, limitsData]) => {
        setApiKeys(keysData.api_keys ?? []);
        setLimits(limitsData.configs ?? []);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const activeKeys = apiKeys.filter((k) => !k.revoked_at).length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 border-b border-zinc-800 pb-6">
        <div className="font-mono text-xs text-zinc-600 tracking-widest mb-1">DASHBOARD</div>
        <h1 className="font-mono text-2xl font-bold text-white">Overview</h1>
      </div>

      {error && (
        <div className="border border-red-500/30 bg-red-500/10 text-red-400 font-mono text-xs p-4 mb-6">
          {error}
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 mb-8">
        <KPICard
          label="ACTIVE LIMITS"
          value={loading ? '—' : limits.length}
          sublabel="rate-limit configurations"
          accent={!loading && limits.length > 0}
        />
        <div className="-ml-px">
          <KPICard
            label="API KEYS"
            value={loading ? '—' : activeKeys}
            sublabel={loading ? '' : `${apiKeys.length} total`}
            accent={!loading && activeKeys > 0}
          />
        </div>
        <div className="-ml-px">
          <KPICard
            label="TOTAL REQUESTS"
            value="—"
            sublabel="available in Phase 5"
            dim
          />
        </div>
        <div className="-ml-px">
          <KPICard
            label="P95 LATENCY"
            value="—"
            sublabel="available in Phase 5"
            dim
          />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-2 gap-0">
        {/* Active Rate Limits */}
        <div className="border border-zinc-800">
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
            <div className="font-mono text-xs text-zinc-400 tracking-widest">ACTIVE RATE LIMITS</div>
            <Link
              href="/dashboard/limits"
              className="font-mono text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Manage →
            </Link>
          </div>

          {loading ? (
            <div className="p-8 text-center font-mono text-xs text-zinc-700 animate-pulse">
              Loading...
            </div>
          ) : limits.length === 0 ? (
            <div className="p-8 text-center">
              <div className="font-mono text-xs text-zinc-700 mb-3">No rate limits configured yet.</div>
              <Link
                href="/dashboard/limits"
                className="font-mono text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                + Create your first configuration
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {limits.slice(0, 5).map((cfg) => (
                <div key={cfg.identifier} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-xs text-white">{cfg.identifier}</div>
                    <div className="font-mono text-xs text-zinc-600 mt-0.5">
                      {cfg.algorithm === 'token_bucket' ? 'Token Bucket' : 'Fixed Window'} ·{' '}
                      {cfg.limit}/{cfg.window_seconds}s
                    </div>
                  </div>
                  <span className="font-mono text-xs text-emerald-400 border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5">
                    ACTIVE
                  </span>
                </div>
              ))}
              {limits.length > 5 && (
                <div className="px-6 py-3 font-mono text-xs text-zinc-700">
                  +{limits.length - 5} more
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Decisions */}
        <div className="border border-zinc-800 -ml-px">
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
            <div className="font-mono text-xs text-zinc-400 tracking-widest">RECENT DECISIONS</div>
            <Link
              href="/dashboard/playground"
              className="font-mono text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Playground →
            </Link>
          </div>

          <div className="p-8 text-center">
            <div className="font-mono text-xs text-zinc-700 mb-3">
              No decisions yet in this session.
            </div>
            <div className="font-mono text-xs text-zinc-700 mb-4">
              Run requests in the Playground to see live results.
            </div>
            <Link
              href="/dashboard/playground"
              className="font-mono text-xs bg-cyan-400 text-zinc-950 px-4 py-2 hover:bg-cyan-300 transition-colors font-semibold"
            >
              Open Playground →
            </Link>
          </div>
        </div>
      </div>

      {/* Observability note */}
      <div className="mt-0 border border-zinc-800 border-t-0 p-5 bg-zinc-900/20">
        <div className="flex items-start gap-3">
          <span className="font-mono text-xs text-amber-400 shrink-0 mt-0.5">PHASE 5</span>
          <p className="font-mono text-xs text-zinc-600 leading-relaxed">
            Prometheus metrics, Grafana dashboards, total request counts, and latency
            histograms will be available in Phase 5 — Observability & Testing. The metrics
            endpoint at <code className="text-zinc-500">/metrics</code> is reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
