'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { LimitConfig } from '@/types/api';

type Algorithm = 'token_bucket' | 'fixed_window';

const ALGO_LABELS: Record<Algorithm, string> = {
  token_bucket: 'Token Bucket',
  fixed_window: 'Fixed Window',
};

function algoTag(algorithm: Algorithm) {
  return (
    <span
      className={`font-mono text-xs px-2 py-0.5 border ${
        algorithm === 'token_bucket'
          ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/5'
          : 'border-zinc-600/30 text-zinc-400 bg-zinc-700/10'
      }`}
    >
      {ALGO_LABELS[algorithm]}
    </span>
  );
}

export default function LimitsPage() {
  const [configs, setConfigs] = useState<LimitConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [algorithm, setAlgorithm] = useState<Algorithm>('token_bucket');
  const [limit, setLimit] = useState(100);
  const [windowSeconds, setWindowSeconds] = useState(60);
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);

  // Delete
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.limits.list();
      setConfigs(data.configs ?? []);
    } catch (err: unknown) {
      if (err instanceof Error) setFetchError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    if (!identifier.trim()) {
      setFormError('Identifier is required.');
      return;
    }
    if (limit <= 0) {
      setFormError('Limit must be greater than zero.');
      return;
    }
    if (windowSeconds <= 0) {
      setFormError('Window must be greater than zero.');
      return;
    }
    setFormError('');
    setCreating(true);

    try {
      const cfg = await api.limits.create({
        identifier: identifier.trim(),
        algorithm,
        limit,
        window_seconds: windowSeconds,
      });
      setConfigs((prev) => [cfg, ...prev]);
      setIdentifier('');
      setLimit(100);
      setWindowSeconds(60);
      setAlgorithm('token_bucket');
      setShowCreate(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFormError('A configuration for this identifier already exists.');
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('Failed to create configuration.');
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await api.limits.delete(id);
      setConfigs((prev) => prev.filter((c) => c.identifier !== id));
    } catch (err: unknown) {
      if (err instanceof Error) alert(err.message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 border-b border-zinc-800 pb-6 flex items-start justify-between">
        <div>
          <div className="font-mono text-xs text-zinc-600 tracking-widest mb-1">
            DASHBOARD / RATE LIMITS
          </div>
          <h1 className="font-mono text-2xl font-bold text-white">Rate Limit Configurations</h1>
          <p className="font-mono text-xs text-zinc-600 mt-1">
            Named configurations stored in PostgreSQL. Used by the Playground and /api/v1/check.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate((v) => !v); setFormError(''); }}
          className="font-mono text-xs bg-cyan-400 text-zinc-950 px-4 py-2 hover:bg-cyan-300 transition-colors font-semibold shrink-0"
        >
          {showCreate ? '✕ Cancel' : '+ New Configuration'}
        </button>
      </div>

      {fetchError && (
        <div className="border border-red-500/30 bg-red-500/10 text-red-400 font-mono text-xs p-4 mb-6">
          {fetchError}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="border border-cyan-400/20 bg-cyan-400/3 p-6 mb-6">
          <div className="font-mono text-xs text-cyan-400 tracking-widest mb-4">
            NEW CONFIGURATION
          </div>

          {formError && (
            <div className="border border-red-500/30 bg-red-500/10 text-red-400 font-mono text-xs p-3 mb-4">
              {formError}
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="lg:col-span-2">
              <label className="block font-mono text-xs text-zinc-500 mb-2">IDENTIFIER</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="user:123"
                className="w-full bg-zinc-950 border border-zinc-700 text-white font-mono text-sm px-4 py-2.5 placeholder-zinc-700 focus:outline-none focus:border-cyan-400/60 transition-colors"
              />
            </div>
            <div>
              <label className="block font-mono text-xs text-zinc-500 mb-2">ALGORITHM</label>
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value as Algorithm)}
                className="w-full bg-zinc-950 border border-zinc-700 text-white font-mono text-sm px-4 py-2.5 focus:outline-none focus:border-cyan-400/60 transition-colors"
              >
                <option value="token_bucket">Token Bucket</option>
                <option value="fixed_window">Fixed Window</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-mono text-xs text-zinc-500 mb-2">LIMIT</label>
                <input
                  type="number"
                  min={1}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-700 text-white font-mono text-sm px-3 py-2.5 focus:outline-none focus:border-cyan-400/60 transition-colors"
                />
              </div>
              <div>
                <label className="block font-mono text-xs text-zinc-500 mb-2">WINDOW</label>
                <input
                  type="number"
                  min={1}
                  value={windowSeconds}
                  onChange={(e) => setWindowSeconds(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-700 text-white font-mono text-sm px-3 py-2.5 focus:outline-none focus:border-cyan-400/60 transition-colors"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="font-mono text-xs bg-cyan-400 text-zinc-950 px-6 py-2.5 hover:bg-cyan-300 transition-colors font-semibold disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Configuration'}
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="border border-zinc-800 p-12 text-center font-mono text-xs text-zinc-700 animate-pulse">
          Loading configurations...
        </div>
      ) : configs.length === 0 ? (
        <div className="border border-zinc-800 p-16 text-center">
          <div className="font-mono text-xs text-zinc-600 mb-3">No configurations yet.</div>
          <div className="font-mono text-xs text-zinc-700">
            Create a configuration to define how an identifier is rate-limited.
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 font-mono text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            + Create your first configuration
          </button>
        </div>
      ) : (
        <div className="border border-zinc-800">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-6 py-3 border-b border-zinc-800 bg-zinc-900/50">
            {['IDENTIFIER', 'ALGORITHM', 'LIMIT', 'WINDOW', ''].map((h) => (
              <div key={h} className="font-mono text-xs text-zinc-600 tracking-widest">
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-zinc-800/60">
            {configs.map((cfg) => (
              <div
                key={cfg.identifier}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-6 py-4 items-center hover:bg-zinc-900/30 transition-colors"
              >
                <div className="font-mono text-sm text-white truncate">
                  {cfg.identifier}
                </div>
                <div>{algoTag(cfg.algorithm as Algorithm)}</div>
                <div className="font-mono text-sm text-zinc-300">
                  {cfg.limit}
                  <span className="text-zinc-600 text-xs ml-1">req</span>
                </div>
                <div className="font-mono text-sm text-zinc-300">
                  {cfg.window_seconds}
                  <span className="text-zinc-600 text-xs ml-1">s</span>
                </div>
                <button
                  onClick={() => handleDelete(cfg.identifier)}
                  disabled={deleting === cfg.identifier}
                  className="font-mono text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50 px-2 py-1"
                  title="Delete configuration"
                >
                  {deleting === cfg.identifier ? '...' : '✕'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
