export interface CheckResult {
  allowed: boolean;
  remaining: number;
  /** Unix seconds */
  resetAt: number;
  retryAfter: number | null;
  /** Simulated latency in ms */
  latencyMs: number;
}

interface TBState {
  tokens: number;
  lastMs: number;
}
interface FWState {
  count: number;
  windowStart: number;
}

/**
 * In-browser rate-limit simulator.
 * Implements the same token-bucket and fixed-window math as the Go/Lua backend.
 * State is scoped per (identifier, limit, windowSeconds) triple so changing
 * any parameter starts a fresh bucket/window.
 */
export class Simulator {
  private tb = new Map<string, TBState>();
  private fw = new Map<string, FWState>();

  check(opts: {
    identifier: string;
    algorithm: 'token_bucket' | 'fixed_window';
    limit: number;
    windowSeconds: number;
  }): CheckResult {
    const t0 = performance.now();
    const result =
      opts.algorithm === 'token_bucket'
        ? this.tokenBucket(opts.identifier, opts.limit, opts.windowSeconds)
        : this.fixedWindow(opts.identifier, opts.limit, opts.windowSeconds);
    // Simulate sub-millisecond Redis + loopback overhead: 0.2–1.1 ms
    const overhead = 0.2 + Math.random() * 0.9;
    const latencyMs = Math.round((performance.now() - t0 + overhead) * 10) / 10;
    return { ...result, latencyMs };
  }

  /** Read-only current token count (including time-based refill since last request). */
  peekTokens(identifier: string, limit: number, windowSeconds: number): number {
    const key = this.tbKey(identifier, limit, windowSeconds);
    const state = this.tb.get(key);
    if (!state) return limit;
    const ratePerMs = limit / windowSeconds / 1000;
    const elapsed = Math.max(0, Date.now() - state.lastMs);
    return Math.min(limit, state.tokens + elapsed * ratePerMs);
  }

  /** Read-only current window count and seconds remaining. */
  peekWindow(
    identifier: string,
    limit: number,
    windowSeconds: number
  ): { count: number; secondsLeft: number } {
    const nowSecs = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(nowSecs / windowSeconds) * windowSeconds;
    const key = this.fwKey(identifier, limit, windowSeconds);
    const state = this.fw.get(key);
    if (!state || state.windowStart < windowStart) {
      return { count: 0, secondsLeft: windowStart + windowSeconds - nowSecs };
    }
    return {
      count: state.count,
      secondsLeft: state.windowStart + windowSeconds - nowSecs,
    };
  }

  /** Reset state for the given identifier (all algorithms). */
  reset(identifier: string) {
    for (const [k] of this.tb) {
      if (k.startsWith(`tb:${identifier}:`)) this.tb.delete(k);
    }
    for (const [k] of this.fw) {
      if (k.startsWith(`fw:${identifier}:`)) this.fw.delete(k);
    }
  }

  private tokenBucket(
    identifier: string,
    limit: number,
    windowSeconds: number
  ): Omit<CheckResult, 'latencyMs'> {
    const key = this.tbKey(identifier, limit, windowSeconds);
    const nowMs = Date.now();
    const ratePerMs = limit / windowSeconds / 1000;

    const state = this.tb.get(key) ?? { tokens: limit, lastMs: nowMs };
    const elapsed = Math.max(0, nowMs - state.lastMs);
    const tokens = Math.min(limit, state.tokens + elapsed * ratePerMs);

    const allowed = tokens >= 1;
    const newTokens = allowed ? tokens - 1 : tokens;
    this.tb.set(key, { tokens: newTokens, lastMs: nowMs });

    const remaining = Math.floor(newTokens);
    const secsToFull =
      ratePerMs > 0 && newTokens < limit
        ? Math.ceil((limit - newTokens) / ratePerMs / 1000)
        : 0;
    const resetAt = Math.floor(nowMs / 1000) + secsToFull;
    const retryAfter = allowed
      ? null
      : Math.ceil((1 - newTokens) / ratePerMs / 1000);

    return { allowed, remaining, resetAt, retryAfter };
  }

  private fixedWindow(
    identifier: string,
    limit: number,
    windowSeconds: number
  ): Omit<CheckResult, 'latencyMs'> {
    const nowSecs = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(nowSecs / windowSeconds) * windowSeconds;
    const resetAt = windowStart + windowSeconds;
    const key = this.fwKey(identifier, limit, windowSeconds);

    const state = this.fw.get(key);
    if (!state || state.windowStart < windowStart) {
      this.fw.set(key, { count: 1, windowStart });
      return { allowed: true, remaining: limit - 1, resetAt, retryAfter: null };
    }
    if (state.count < limit) {
      state.count++;
      return { allowed: true, remaining: limit - state.count, resetAt, retryAfter: null };
    }
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter: resetAt - nowSecs,
    };
  }

  private tbKey(id: string, limit: number, win: number) {
    return `tb:${id}:${limit}:${win}`;
  }
  private fwKey(id: string, limit: number, win: number) {
    return `fw:${id}:${limit}:${win}`;
  }
}
