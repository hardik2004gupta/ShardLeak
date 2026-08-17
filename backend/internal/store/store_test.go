package store_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/shardleak/shardleak/internal/postgres"
	"github.com/shardleak/shardleak/internal/store"
)

func testDB(t *testing.T) (*postgres.DB, *store.Store) {
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

func uniqueEmail(t *testing.T) string {
	return fmt.Sprintf("test.%d@example.com", time.Now().UnixNano())
}

// ── User ──────────────────────────────────────────────────────────────────────

func TestUser_CreateAndGetByEmail(t *testing.T) {
	db, st := testDB(t)
	ctx := context.Background()
	email := uniqueEmail(t)

	u, err := st.CreateUser(ctx, email, "bcrypt-hash")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u.ID)
	})

	if u.Email != email {
		t.Errorf("email: want %q, got %q", email, u.Email)
	}
	if u.ID == "" {
		t.Error("ID should not be empty")
	}

	got, err := st.GetUserByEmail(ctx, email)
	if err != nil {
		t.Fatalf("get by email: %v", err)
	}
	if got.ID != u.ID {
		t.Errorf("ID mismatch: want %q, got %q", u.ID, got.ID)
	}
}

func TestUser_GetByID(t *testing.T) {
	db, st := testDB(t)
	ctx := context.Background()
	email := uniqueEmail(t)

	u, err := st.CreateUser(ctx, email, "bcrypt-hash")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u.ID)
	})

	got, err := st.GetUserByID(ctx, u.ID)
	if err != nil {
		t.Fatalf("get by id: %v", err)
	}
	if got.Email != email {
		t.Errorf("email: want %q, got %q", email, got.Email)
	}
}

func TestUser_DuplicateEmail(t *testing.T) {
	db, st := testDB(t)
	ctx := context.Background()
	email := uniqueEmail(t)

	u, err := st.CreateUser(ctx, email, "hash")
	if err != nil {
		t.Fatalf("first create: %v", err)
	}
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u.ID)
	})

	_, err = st.CreateUser(ctx, email, "hash")
	if err == nil {
		t.Fatal("duplicate email should return error")
	}
	if err != store.ErrConflict {
		t.Errorf("want ErrConflict, got %v", err)
	}
}

func TestUser_GetByEmail_NotFound(t *testing.T) {
	_, st := testDB(t)
	ctx := context.Background()

	_, err := st.GetUserByEmail(ctx, "does.not.exist@example.com")
	if err != store.ErrNotFound {
		t.Errorf("want ErrNotFound, got %v", err)
	}
}

// ── API Key ───────────────────────────────────────────────────────────────────

func TestAPIKey_CreateAndList(t *testing.T) {
	db, st := testDB(t)
	ctx := context.Background()
	email := uniqueEmail(t)

	u, _ := st.CreateUser(ctx, email, "hash")
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u.ID)
	})

	k, err := st.CreateAPIKey(ctx, u.ID, "key-hash-abc", "Test Key")
	if err != nil {
		t.Fatalf("create api key: %v", err)
	}
	if k.ID == "" {
		t.Error("key ID should not be empty")
	}
	if k.RevokedAt != nil {
		t.Error("new key should not be revoked")
	}

	keys, err := st.GetAPIKeysByUser(ctx, u.ID)
	if err != nil {
		t.Fatalf("list api keys: %v", err)
	}
	if len(keys) != 1 {
		t.Fatalf("want 1 key, got %d", len(keys))
	}
	if keys[0].ID != k.ID {
		t.Errorf("key ID mismatch: want %q, got %q", k.ID, keys[0].ID)
	}
	// Verify hash is stored, not plaintext key
	if keys[0].KeyHash != "key-hash-abc" {
		t.Error("key hash should be stored")
	}
}

func TestAPIKey_GetByHash(t *testing.T) {
	db, st := testDB(t)
	ctx := context.Background()
	email := uniqueEmail(t)

	u, _ := st.CreateUser(ctx, email, "hash")
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u.ID)
	})

	st.CreateAPIKey(ctx, u.ID, "lookup-hash-xyz", "Test") //nolint:errcheck

	k, err := st.GetAPIKeyByHash(ctx, "lookup-hash-xyz")
	if err != nil {
		t.Fatalf("get by hash: %v", err)
	}
	if k.UserID != u.ID {
		t.Errorf("user ID mismatch: want %q, got %q", u.ID, k.UserID)
	}
}

func TestAPIKey_GetByHash_NotFound(t *testing.T) {
	_, st := testDB(t)
	ctx := context.Background()

	_, err := st.GetAPIKeyByHash(ctx, "nonexistent-hash")
	if err != store.ErrNotFound {
		t.Errorf("want ErrNotFound, got %v", err)
	}
}

func TestAPIKey_Revoke(t *testing.T) {
	db, st := testDB(t)
	ctx := context.Background()
	email := uniqueEmail(t)

	u, _ := st.CreateUser(ctx, email, "hash")
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u.ID)
	})

	k, _ := st.CreateAPIKey(ctx, u.ID, "revoke-hash-abc", "To Revoke")

	if err := st.RevokeAPIKey(ctx, k.ID, u.ID); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	// Verify it's now revoked
	found, err := st.GetAPIKeyByHash(ctx, "revoke-hash-abc")
	if err != nil {
		t.Fatal(err)
	}
	if found.RevokedAt == nil {
		t.Error("key should be revoked")
	}
}

func TestAPIKey_Revoke_UserIsolation(t *testing.T) {
	db, st := testDB(t)
	ctx := context.Background()

	u1, _ := st.CreateUser(ctx, uniqueEmail(t), "hash")
	u2, _ := st.CreateUser(ctx, uniqueEmail(t), "hash")
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u1.ID)
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u2.ID)
	})

	k, _ := st.CreateAPIKey(ctx, u1.ID, "isolation-hash", "User1 Key")

	// u2 should not be able to revoke u1's key
	err := st.RevokeAPIKey(ctx, k.ID, u2.ID)
	if err != store.ErrNotFound {
		t.Errorf("want ErrNotFound when revoking another user's key, got %v", err)
	}
}

// ── Rate Limit Config ─────────────────────────────────────────────────────────

func TestLimitConfig_CreateAndGet(t *testing.T) {
	db, st := testDB(t)
	ctx := context.Background()
	email := uniqueEmail(t)

	u, _ := st.CreateUser(ctx, email, "hash")
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u.ID)
	})

	cfg, err := st.CreateLimitConfig(ctx, u.ID, "user:store-test", "token_bucket", 100, 60)
	if err != nil {
		t.Fatalf("create limit config: %v", err)
	}
	if cfg.Limit != 100 {
		t.Errorf("limit: want 100, got %d", cfg.Limit)
	}
	if cfg.Algorithm != "token_bucket" {
		t.Errorf("algorithm: want token_bucket, got %q", cfg.Algorithm)
	}

	got, err := st.GetLimitConfig(ctx, u.ID, "user:store-test")
	if err != nil {
		t.Fatalf("get limit config: %v", err)
	}
	if got.ID != cfg.ID {
		t.Errorf("ID mismatch: want %q, got %q", cfg.ID, got.ID)
	}
}

func TestLimitConfig_GetNotFound(t *testing.T) {
	db, st := testDB(t)
	ctx := context.Background()
	email := uniqueEmail(t)

	u, _ := st.CreateUser(ctx, email, "hash")
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u.ID)
	})

	_, err := st.GetLimitConfig(ctx, u.ID, "nonexistent-identifier")
	if err != store.ErrNotFound {
		t.Errorf("want ErrNotFound, got %v", err)
	}
}

func TestLimitConfig_Delete(t *testing.T) {
	db, st := testDB(t)
	ctx := context.Background()
	email := uniqueEmail(t)

	u, _ := st.CreateUser(ctx, email, "hash")
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u.ID)
	})

	st.CreateLimitConfig(ctx, u.ID, "delete-test", "fixed_window", 50, 120) //nolint:errcheck

	if err := st.DeleteLimitConfig(ctx, u.ID, "delete-test"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	if err := st.DeleteLimitConfig(ctx, u.ID, "delete-test"); err != store.ErrNotFound {
		t.Errorf("second delete should return ErrNotFound, got %v", err)
	}
}

func TestLimitConfig_CrossUserIsolation(t *testing.T) {
	db, st := testDB(t)
	ctx := context.Background()

	u1, _ := st.CreateUser(ctx, uniqueEmail(t), "hash")
	u2, _ := st.CreateUser(ctx, uniqueEmail(t), "hash")
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u1.ID)
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u2.ID)
	})

	st.CreateLimitConfig(ctx, u1.ID, "user:cross-test", "token_bucket", 10, 60) //nolint:errcheck

	// u2 should not see u1's config
	_, err := st.GetLimitConfig(ctx, u2.ID, "user:cross-test")
	if err != store.ErrNotFound {
		t.Errorf("user2 should not see user1's config, got %v", err)
	}
}
