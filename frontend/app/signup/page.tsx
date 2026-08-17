'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { setToken, isAuthenticated } from '@/lib/auth';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/dashboard');
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    try {
      await api.auth.signup(email, password);
      const { token } = await api.auth.login(email, password);
      setToken(token);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError('An account with this email already exists.');
        } else if (err.status === 400) {
          setError(err.message);
        } else {
          setError(err.message);
        }
      } else {
        setError('Unable to connect to the API. Is the backend running?');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 bg-grid flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="font-mono font-bold text-white tracking-widest text-lg hover:text-cyan-400 transition-colors">
            SHARDLEAK
          </Link>
          <p className="font-mono text-xs text-zinc-600 mt-2 tracking-wide">DISTRIBUTED RATE LIMITING</p>
        </div>

        <div className="border border-zinc-800 bg-zinc-900/50 p-8">
          <h1 className="font-mono text-lg font-semibold text-white mb-2">Create account</h1>
          <p className="font-mono text-xs text-zinc-600 mb-6">
            Free. No credit card required.
          </p>

          {error && (
            <div className="border border-red-500/30 bg-red-500/10 text-red-400 font-mono text-xs p-3 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block font-mono text-xs text-zinc-500 mb-2">EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                className="w-full bg-zinc-950 border border-zinc-700 text-white font-mono text-sm px-4 py-3 placeholder-zinc-700 focus:outline-none focus:border-cyan-400/60 transition-colors"
              />
            </div>

            <div>
              <label className="block font-mono text-xs text-zinc-500 mb-2">
                PASSWORD
                <span className="ml-2 text-zinc-700">min 8 characters</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className="w-full bg-zinc-950 border border-zinc-700 text-white font-mono text-sm px-4 py-3 placeholder-zinc-700 focus:outline-none focus:border-cyan-400/60 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-400 text-zinc-950 font-mono font-semibold text-sm py-3 hover:bg-cyan-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center font-mono text-xs text-zinc-600 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-cyan-400 hover:text-cyan-300 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
