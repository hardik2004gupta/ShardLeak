package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	goredis "github.com/redis/go-redis/v9"

	"github.com/shardleak/shardleak/internal/auth"
	"github.com/shardleak/shardleak/internal/handlers"
	appmiddleware "github.com/shardleak/shardleak/internal/middleware"
	"github.com/shardleak/shardleak/internal/postgres"
	"github.com/shardleak/shardleak/internal/ratelimit"
	"github.com/shardleak/shardleak/internal/store"
)

func testCheckDB(t *testing.T) (*postgres.DB, *store.Store) {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://shardleak:shardleak@localhost:5435/shardleak?sslmode=disable"
	}
	ctx := context.Background()
	db, err := postgres.New(ctx, url)
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	if err := db.Ping(ctx); err != nil {
		db.Close()
		t.Skipf("postgres ping failed: %v", err)
	}
	t.Cleanup(db.Close)
	return db, store.New(db)
}

func testCheckRedis(t *testing.T) *goredis.Client {
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

func checkBody(t *testing.T) []byte {
	t.Helper()
	b, _ := json.Marshal(map[string]any{
		"identifier":     fmt.Sprintf("check-apikey-test:%d", time.Now().UnixNano()),
		"limit":          100,
		"window_seconds": 60,
		"algorithm":      "token_bucket",
	})
	return b
}

// ── Missing API key — no DB needed ────────────────────────────────────────────

func TestCheck_MissingAPIKey(t *testing.T) {
	h := handlers.NewCheckHandler(ratelimit.NewService(nil))
	// nil store is safe: the middleware returns 401 before calling GetAPIKeyByHash when token is empty
	wrapped := appmiddleware.APIKeyAuth(nil)(http.HandlerFunc(h.Check))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/check", bytes.NewReader(checkBody(t)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)

	assertStatus(t, w, http.StatusUnauthorized)
	assertErrorCode(t, w, "UNAUTHORIZED")
}

// ── Invalid API key — DB required ─────────────────────────────────────────────

func TestCheck_InvalidAPIKey(t *testing.T) {
	_, st := testCheckDB(t)
	rdb := testCheckRedis(t)
	h := handlers.NewCheckHandler(ratelimit.NewService(rdb))
	wrapped := appmiddleware.APIKeyAuth(st)(http.HandlerFunc(h.Check))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/check", bytes.NewReader(checkBody(t)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer sk_shard_invalid_key_that_does_not_exist_in_db")
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)

	assertStatus(t, w, http.StatusUnauthorized)
	assertErrorCode(t, w, "UNAUTHORIZED")
}

// ── Revoked API key — DB required ─────────────────────────────────────────────

func TestCheck_RevokedAPIKey(t *testing.T) {
	db, st := testCheckDB(t)
	rdb := testCheckRedis(t)

	// Create user
	email := fmt.Sprintf("check.revoke.%d@example.com", time.Now().UnixNano())
	u, err := st.CreateUser(context.Background(), email, "hash")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u.ID)
	})

	// Generate and store an API key
	plaintext, keyHash, _ := auth.GenerateAPIKey()
	k, err := st.CreateAPIKey(context.Background(), u.ID, keyHash, "Revoke Test")
	if err != nil {
		t.Fatalf("create api key: %v", err)
	}

	// Revoke it
	if err := st.RevokeAPIKey(context.Background(), k.ID, u.ID); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	// Request with the revoked key
	h := handlers.NewCheckHandler(ratelimit.NewService(rdb))
	wrapped := appmiddleware.APIKeyAuth(st)(http.HandlerFunc(h.Check))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/check", bytes.NewReader(checkBody(t)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+plaintext)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)

	assertStatus(t, w, http.StatusUnauthorized)
	assertErrorCode(t, w, "UNAUTHORIZED")
}

// ── Valid API key → rate-limit succeeds — DB + Redis required ─────────────────

func TestCheck_ValidAPIKey_RateLimitSucceeds(t *testing.T) {
	db, st := testCheckDB(t)
	rdb := testCheckRedis(t)

	// Create user
	email := fmt.Sprintf("check.valid.%d@example.com", time.Now().UnixNano())
	u, err := st.CreateUser(context.Background(), email, "hash")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u.ID)
	})

	// Generate and store an API key
	plaintext, keyHash, _ := auth.GenerateAPIKey()
	if _, err := st.CreateAPIKey(context.Background(), u.ID, keyHash, "Valid Test"); err != nil {
		t.Fatalf("create api key: %v", err)
	}

	h := handlers.NewCheckHandler(ratelimit.NewService(rdb))
	wrapped := appmiddleware.APIKeyAuth(st)(http.HandlerFunc(h.Check))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/check", bytes.NewReader(checkBody(t)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+plaintext)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)

	// Valid API key → proceeds to rate-limit check → 200 with allowed/rejected decision
	assertStatus(t, w, http.StatusOK)
	var resp struct {
		Allowed bool `json:"allowed"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.Allowed {
		t.Error("first request with fresh identifier should be allowed")
	}
}
