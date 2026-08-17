'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { APIKeyMeta } from '@/types/api';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="font-mono text-xs text-zinc-600 hover:text-cyan-400 transition-colors px-2 py-0.5 border border-zinc-700 hover:border-cyan-400/40"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function APIKeysPage() {
  const [keys, setKeys] = useState<APIKeyMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);

  // Revoke
  const [revoking, setRevoking] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.apiKeys.list();
      setKeys(data.api_keys ?? []);
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
    if (!keyName.trim()) {
      setFormError('Name is required.');
      return;
    }
    setFormError('');
    setCreating(true);

    try {
      const created = await api.apiKeys.create(keyName.trim());
      setNewKey({ name: created.name, key: created.key });
      const meta: APIKeyMeta = {
        id: created.id,
        name: created.name,
        created_at: created.created_at,
        revoked_at: null,
      };
      setKeys((prev) => [meta, ...prev]);
      setKeyName('');
      setShowCreate(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('Failed to create API key.');
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    setRevoking(id);
    try {
      await api.apiKeys.revoke(id);
      setKeys((prev) =>
        prev.map((k) =>
          k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k
        )
      );
    } catch (err: unknown) {
      if (err instanceof Error) alert(err.message);
    } finally {
      setRevoking(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 border-b border-zinc-800 pb-6 flex items-start justify-between">
        <div>
          <div className="font-mono text-xs text-zinc-600 tracking-widest mb-1">
            DASHBOARD / API KEYS
          </div>
          <h1 className="font-mono text-2xl font-bold text-white">API Keys</h1>
          <p className="font-mono text-xs text-zinc-600 mt-1">
            Keys are shown in full exactly once at creation. Only the SHA-256 hash is stored.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate((v) => !v); setFormError(''); }}
          className="font-mono text-xs bg-cyan-400 text-zinc-950 px-4 py-2 hover:bg-cyan-300 transition-colors font-semibold shrink-0"
        >
          {showCreate ? '✕ Cancel' : '+ Create Key'}
        </button>
      </div>

      {fetchError && (
        <div className="border border-red-500/30 bg-red-500/10 text-red-400 font-mono text-xs p-4 mb-6">
          {fetchError}
        </div>
      )}

      {/* One-time key display */}
      {newKey && (
        <div className="border border-amber-400/30 bg-amber-400/5 p-5 mb-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <div className="font-mono text-xs text-amber-400 tracking-widest mb-1">
                ⚠ COPY YOUR API KEY NOW
              </div>
              <div className="font-mono text-xs text-zinc-400">
                This is the only time{' '}
                <span className="text-white font-semibold">{newKey.name}</span> will be shown.
                It cannot be retrieved again.
              </div>
            </div>
            <button
              onClick={() => setNewKey(null)}
              className="font-mono text-xs text-zinc-600 hover:text-white transition-colors shrink-0"
            >
              ✕ Dismiss
            </button>
          </div>
          <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-700 px-4 py-3">
            <code className="font-mono text-sm text-white flex-1 break-all select-all">
              {newKey.key}
            </code>
            <CopyButton text={newKey.key} />
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="border border-cyan-400/20 bg-cyan-400/3 p-6 mb-6">
          <div className="font-mono text-xs text-cyan-400 tracking-widest mb-4">
            NEW API KEY
          </div>

          {formError && (
            <div className="border border-red-500/30 bg-red-500/10 text-red-400 font-mono text-xs p-3 mb-4">
              {formError}
            </div>
          )}

          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block font-mono text-xs text-zinc-500 mb-2">KEY NAME</label>
              <input
                type="text"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="Production, Development, CI..."
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                className="w-full bg-zinc-950 border border-zinc-700 text-white font-mono text-sm px-4 py-2.5 placeholder-zinc-700 focus:outline-none focus:border-cyan-400/60 transition-colors"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="font-mono text-xs bg-cyan-400 text-zinc-950 px-6 py-2.5 hover:bg-cyan-300 transition-colors font-semibold disabled:opacity-50 shrink-0"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="border border-zinc-800 p-12 text-center font-mono text-xs text-zinc-700 animate-pulse">
          Loading API keys...
        </div>
      ) : keys.length === 0 ? (
        <div className="border border-zinc-800 p-16 text-center">
          <div className="font-mono text-xs text-zinc-600 mb-3">No API keys yet.</div>
          <div className="font-mono text-xs text-zinc-700 mb-4">
            Create a key to authenticate requests to POST /api/v1/check.
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="font-mono text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            + Create your first API key
          </button>
        </div>
      ) : (
        <div className="border border-zinc-800">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-6 py-3 border-b border-zinc-800 bg-zinc-900/50">
            {['NAME', 'CREATED', 'STATUS', ''].map((h) => (
              <div key={h} className="font-mono text-xs text-zinc-600 tracking-widest">
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-zinc-800/60">
            {keys.map((k) => (
              <div
                key={k.id}
                className={`grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-6 py-4 items-center transition-colors ${
                  k.revoked_at ? 'opacity-50' : 'hover:bg-zinc-900/30'
                }`}
              >
                <div>
                  <div className="font-mono text-sm text-white">{k.name}</div>
                  <div className="font-mono text-xs text-zinc-700 mt-0.5">
                    id: {k.id.slice(0, 8)}...
                  </div>
                </div>
                <div className="font-mono text-xs text-zinc-500">
                  {formatDate(k.created_at)}
                </div>
                <div>
                  {k.revoked_at ? (
                    <span className="font-mono text-xs px-2 py-0.5 border border-red-500/30 text-red-400 bg-red-500/5">
                      Revoked
                    </span>
                  ) : (
                    <span className="font-mono text-xs px-2 py-0.5 border border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
                      Active
                    </span>
                  )}
                </div>
                <div>
                  {!k.revoked_at && (
                    <button
                      onClick={() => handleRevoke(k.id)}
                      disabled={revoking === k.id}
                      className="font-mono text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50 px-2 py-1"
                      title="Revoke key"
                    >
                      {revoking === k.id ? '...' : 'Revoke'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security note */}
      <div className="mt-0 border border-zinc-800 border-t-0 p-5 bg-zinc-900/20">
        <div className="flex items-start gap-3">
          <span className="font-mono text-xs text-zinc-600 shrink-0 mt-0.5">SECURITY</span>
          <p className="font-mono text-xs text-zinc-700 leading-relaxed">
            API keys are hashed with SHA-256 before storage. The plaintext key is never
            saved anywhere — it is computed once and returned to you once. If you lose a
            key, revoke it and create a new one.
          </p>
        </div>
      </div>
    </div>
  );
}
