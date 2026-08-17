package ratelimit_test

import (
	"context"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	goredis "github.com/redis/go-redis/v9"

	"github.com/shardleak/shardleak/internal/ratelimit"
)

// testRedisClient returns a Redis client connected to the test instance,
// or skips the test if Redis is unavailable.
func testRedisClient(t *testing.T) *goredis.Client {
	t.Helper()
	url := os.Getenv("REDIS_URL")
	if url == "" {
		url = "redis://localhost:6380"
	}
	opts, err := goredis.ParseURL(url)
	if err != nil {
		t.Skipf("invalid REDIS_URL: %v", err)
	}
	rdb := goredis.NewClient(opts)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		t.Skipf("redis unavailable at %s: %v", url, err)
	}
	t.Cleanup(func() { rdb.Close() })
	return rdb
}

// cleanKeys deletes all Redis keys matching pattern. Used before and after each test.
func cleanKeys(t *testing.T, rdb *goredis.Client, pattern string) {
	t.Helper()
	ctx := context.Background()
	keys, err := rdb.Keys(ctx, pattern).Result()
	if err != nil || len(keys) == 0 {
		return
	}
	rdb.Del(ctx, keys...)
}

// ── Token Bucket ─────────────────────────────────────────────────────────────

func TestTokenBucket_AllowsInitialRequest(t *testing.T) {
	rdb := testRedisClient(t)
	svc := ratelimit.NewService(rdb)
	ctx := context.Background()
	id := fmt.Sprintf("test:tb:%s", t.Name())
	cleanKeys(t, rdb, "shardleak:rate:tb:"+id+"*")
	t.Cleanup(func() { cleanKeys(t, rdb, "shardleak:rate:tb:"+id+"*") })

	result, err := svc.Check(ctx, ratelimit.Request{
		Identifier:    id,
		Limit:         10,
		WindowSeconds: 60,
		Algorithm:     ratelimit.TokenBucket,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Allowed {
		t.Error("first request should be allowed")
	}
	if result.Remaining != 9 {
		t.Errorf("remaining: want 9, got %d", result.Remaining)
	}
	if result.Limit != 10 {
		t.Errorf("limit: want 10, got %d", result.Limit)
	}
	if result.RetryAfter != 0 {
		t.Errorf("retry_after: want 0, got %d", result.RetryAfter)
	}
}

func TestTokenBucket_ConsumesTokensSequentially(t *testing.T) {
	rdb := testRedisClient(t)
	svc := ratelimit.NewService(rdb)
	ctx := context.Background()
	id := fmt.Sprintf("test:tb:%s", t.Name())
	cleanKeys(t, rdb, "shardleak:rate:tb:"+id+"*")
	t.Cleanup(func() { cleanKeys(t, rdb, "shardleak:rate:tb:"+id+"*") })

	const limit = 5
	req := ratelimit.Request{Identifier: id, Limit: limit, WindowSeconds: 60, Algorithm: ratelimit.TokenBucket}

	for i := 0; i < limit; i++ {
		r, err := svc.Check(ctx, req)
		if err != nil {
			t.Fatalf("request %d error: %v", i, err)
		}
		if !r.Allowed {
			t.Errorf("request %d should be allowed", i)
		}
		want := limit - 1 - i
		if r.Remaining != want {
			t.Errorf("request %d remaining: want %d, got %d", i, want, r.Remaining)
		}
	}
}

func TestTokenBucket_RejectsWhenExhausted(t *testing.T) {
	rdb := testRedisClient(t)
	svc := ratelimit.NewService(rdb)
	ctx := context.Background()
	id := fmt.Sprintf("test:tb:%s", t.Name())
	cleanKeys(t, rdb, "shardleak:rate:tb:"+id+"*")
	t.Cleanup(func() { cleanKeys(t, rdb, "shardleak:rate:tb:"+id+"*") })

	req := ratelimit.Request{Identifier: id, Limit: 3, WindowSeconds: 60, Algorithm: ratelimit.TokenBucket}
	for i := 0; i < 3; i++ {
		svc.Check(ctx, req) //nolint:errcheck
	}

	r, err := svc.Check(ctx, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Allowed {
		t.Error("request should be rejected when bucket is empty")
	}
	if r.Remaining != 0 {
		t.Errorf("remaining: want 0, got %d", r.Remaining)
	}
	if r.RetryAfter <= 0 {
		t.Errorf("retry_after should be positive, got %d", r.RetryAfter)
	}
}

func TestTokenBucket_ResetAtInFuture(t *testing.T) {
	rdb := testRedisClient(t)
	svc := ratelimit.NewService(rdb)
	ctx := context.Background()
	id := fmt.Sprintf("test:tb:%s", t.Name())
	cleanKeys(t, rdb, "shardleak:rate:tb:"+id+"*")
	t.Cleanup(func() { cleanKeys(t, rdb, "shardleak:rate:tb:"+id+"*") })

	r, err := svc.Check(ctx, ratelimit.Request{
		Identifier: id, Limit: 10, WindowSeconds: 60, Algorithm: ratelimit.TokenBucket,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !r.ResetAt.After(time.Now()) {
		t.Errorf("reset_at should be in the future, got %v", r.ResetAt)
	}
}

func TestTokenBucket_RejectedRequestReturnsRetryAfter(t *testing.T) {
	rdb := testRedisClient(t)
	svc := ratelimit.NewService(rdb)
	ctx := context.Background()
	id := fmt.Sprintf("test:tb:%s", t.Name())
	cleanKeys(t, rdb, "shardleak:rate:tb:"+id+"*")
	t.Cleanup(func() { cleanKeys(t, rdb, "shardleak:rate:tb:"+id+"*") })

	req := ratelimit.Request{Identifier: id, Limit: 1, WindowSeconds: 60, Algorithm: ratelimit.TokenBucket}
	svc.Check(ctx, req) //nolint:errcheck

	r, err := svc.Check(ctx, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Allowed {
		t.Fatal("expected rejection")
	}
	// refill rate = 1/60 tokens per sec, need 1 token → ~60s
	if r.RetryAfter < 1 || r.RetryAfter > 61 {
		t.Errorf("retry_after out of expected range [1,61]: %d", r.RetryAfter)
	}
}

// ── Fixed Window ──────────────────────────────────────────────────────────────

func TestFixedWindow_AllowsInitialRequest(t *testing.T) {
	rdb := testRedisClient(t)
	svc := ratelimit.NewService(rdb)
	ctx := context.Background()
	id := fmt.Sprintf("test:fw:%s", t.Name())
	cleanKeys(t, rdb, "shardleak:rate:fw:"+id+"*")
	t.Cleanup(func() { cleanKeys(t, rdb, "shardleak:rate:fw:"+id+"*") })

	r, err := svc.Check(ctx, ratelimit.Request{
		Identifier: id, Limit: 10, WindowSeconds: 60, Algorithm: ratelimit.FixedWindow,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !r.Allowed {
		t.Error("first request should be allowed")
	}
	if r.Remaining != 9 {
		t.Errorf("remaining: want 9, got %d", r.Remaining)
	}
}

func TestFixedWindow_CounterIncrements(t *testing.T) {
	rdb := testRedisClient(t)
	svc := ratelimit.NewService(rdb)
	ctx := context.Background()
	id := fmt.Sprintf("test:fw:%s", t.Name())
	cleanKeys(t, rdb, "shardleak:rate:fw:"+id+"*")
	t.Cleanup(func() { cleanKeys(t, rdb, "shardleak:rate:fw:"+id+"*") })

	const limit = 5
	req := ratelimit.Request{Identifier: id, Limit: limit, WindowSeconds: 60, Algorithm: ratelimit.FixedWindow}

	for i := 0; i < limit; i++ {
		r, err := svc.Check(ctx, req)
		if err != nil {
			t.Fatalf("request %d error: %v", i, err)
		}
		if !r.Allowed {
			t.Errorf("request %d should be allowed", i)
		}
		want := limit - 1 - i
		if r.Remaining != want {
			t.Errorf("request %d remaining: want %d, got %d", i, want, r.Remaining)
		}
	}
}

func TestFixedWindow_RejectsAtLimit(t *testing.T) {
	rdb := testRedisClient(t)
	svc := ratelimit.NewService(rdb)
	ctx := context.Background()
	id := fmt.Sprintf("test:fw:%s", t.Name())
	cleanKeys(t, rdb, "shardleak:rate:fw:"+id+"*")
	t.Cleanup(func() { cleanKeys(t, rdb, "shardleak:rate:fw:"+id+"*") })

	req := ratelimit.Request{Identifier: id, Limit: 3, WindowSeconds: 60, Algorithm: ratelimit.FixedWindow}
	for i := 0; i < 3; i++ {
		svc.Check(ctx, req) //nolint:errcheck
	}

	r, err := svc.Check(ctx, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Allowed {
		t.Error("request should be rejected at limit")
	}
	if r.Remaining != 0 {
		t.Errorf("remaining: want 0, got %d", r.Remaining)
	}
	if r.RetryAfter <= 0 {
		t.Errorf("retry_after should be positive, got %d", r.RetryAfter)
	}
}

func TestFixedWindow_ResetAtIsWindowEnd(t *testing.T) {
	rdb := testRedisClient(t)
	svc := ratelimit.NewService(rdb)
	ctx := context.Background()
	id := fmt.Sprintf("test:fw:%s", t.Name())
	cleanKeys(t, rdb, "shardleak:rate:fw:"+id+"*")
	t.Cleanup(func() { cleanKeys(t, rdb, "shardleak:rate:fw:"+id+"*") })

	now := time.Now()
	r, err := svc.Check(ctx, ratelimit.Request{
		Identifier: id, Limit: 10, WindowSeconds: 60, Algorithm: ratelimit.FixedWindow,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !r.ResetAt.After(now) {
		t.Error("reset_at should be in the future")
	}
	if r.ResetAt.After(now.Add(61 * time.Second)) {
		t.Errorf("reset_at too far ahead: %v (now+61s = %v)", r.ResetAt, now.Add(61*time.Second))
	}
}

// ── Concurrency ───────────────────────────────────────────────────────────────

func TestConcurrency_TokenBucketEnforcesLimit(t *testing.T) {
	rdb := testRedisClient(t)
	svc := ratelimit.NewService(rdb)
	ctx := context.Background()

	const limit = 100
	const total = 1000
	id := fmt.Sprintf("test:concurrency:tb:%d", time.Now().UnixNano())
	cleanKeys(t, rdb, "shardleak:rate:tb:"+id+"*")
	t.Cleanup(func() { cleanKeys(t, rdb, "shardleak:rate:tb:"+id+"*") })

	req := ratelimit.Request{
		Identifier:    id,
		Limit:         limit,
		WindowSeconds: 3600,
		Algorithm:     ratelimit.TokenBucket,
	}

	var allowed, rejected atomic.Int64
	var wg sync.WaitGroup

	for i := 0; i < total; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, err := svc.Check(ctx, req)
			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			if r.Allowed {
				allowed.Add(1)
			} else {
				rejected.Add(1)
			}
		}()
	}
	wg.Wait()

	got := allowed.Load()
	if got != limit {
		t.Errorf("allowed %d concurrent requests, want exactly %d (rejected %d) — atomicity violated",
			got, limit, rejected.Load())
	}
}

func TestConcurrency_FixedWindowEnforcesLimit(t *testing.T) {
	rdb := testRedisClient(t)
	svc := ratelimit.NewService(rdb)
	ctx := context.Background()

	const limit = 100
	const total = 1000
	id := fmt.Sprintf("test:concurrency:fw:%d", time.Now().UnixNano())
	cleanKeys(t, rdb, "shardleak:rate:fw:"+id+"*")
	t.Cleanup(func() { cleanKeys(t, rdb, "shardleak:rate:fw:"+id+"*") })

	req := ratelimit.Request{
		Identifier:    id,
		Limit:         limit,
		WindowSeconds: 3600,
		Algorithm:     ratelimit.FixedWindow,
	}

	var allowed, rejected atomic.Int64
	var wg sync.WaitGroup

	for i := 0; i < total; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, err := svc.Check(ctx, req)
			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			if r.Allowed {
				allowed.Add(1)
			} else {
				rejected.Add(1)
			}
		}()
	}
	wg.Wait()

	got := allowed.Load()
	if got != limit {
		t.Errorf("allowed %d concurrent requests, want exactly %d (rejected %d) — atomicity violated",
			got, limit, rejected.Load())
	}
}
