package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/shardleak/shardleak/internal/postgres"
)

// ErrNotFound is returned when a requested record does not exist.
var ErrNotFound = errors.New("not found")

// ErrConflict is returned when a unique constraint would be violated.
var ErrConflict = errors.New("conflict")

// Store wraps a postgres.DB and exposes typed data-access methods.
type Store struct {
	db *postgres.DB
}

// New returns a Store backed by db.
func New(db *postgres.DB) *Store {
	return &Store{db: db}
}

// ── User ──────────────────────────────────────────────────────────────────────

type User struct {
	ID           string
	Email        string
	PasswordHash string
	CreatedAt    time.Time
}

func (s *Store) CreateUser(ctx context.Context, email, passwordHash string) (*User, error) {
	u := &User{}
	err := s.db.Pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash) VALUES ($1, $2)
		 RETURNING id, email, password_hash, created_at`,
		email, passwordHash,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrConflict
		}
		return nil, fmt.Errorf("create user: %w", err)
	}
	return u, nil
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	u := &User{}
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id, email, password_hash, created_at FROM users WHERE email = $1`,
		email,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return u, nil
}

func (s *Store) GetUserByID(ctx context.Context, id string) (*User, error) {
	u := &User{}
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id, email, password_hash, created_at FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return u, nil
}

// ── API Key ───────────────────────────────────────────────────────────────────

type APIKey struct {
	ID        string
	UserID    string
	KeyHash   string
	Name      string
	CreatedAt time.Time
	RevokedAt *time.Time
}

func (s *Store) CreateAPIKey(ctx context.Context, userID, keyHash, name string) (*APIKey, error) {
	k := &APIKey{}
	err := s.db.Pool.QueryRow(ctx,
		`INSERT INTO api_keys (user_id, key_hash, name)
		 VALUES ($1, $2, $3)
		 RETURNING id, user_id, key_hash, name, created_at, revoked_at`,
		userID, keyHash, name,
	).Scan(&k.ID, &k.UserID, &k.KeyHash, &k.Name, &k.CreatedAt, &k.RevokedAt)
	if err != nil {
		return nil, fmt.Errorf("create api key: %w", err)
	}
	return k, nil
}

func (s *Store) GetAPIKeysByUser(ctx context.Context, userID string) ([]APIKey, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT id, user_id, key_hash, name, created_at, revoked_at
		 FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list api keys: %w", err)
	}
	defer rows.Close()

	var keys []APIKey
	for rows.Next() {
		var k APIKey
		if err := rows.Scan(&k.ID, &k.UserID, &k.KeyHash, &k.Name, &k.CreatedAt, &k.RevokedAt); err != nil {
			return nil, fmt.Errorf("scan api key: %w", err)
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

func (s *Store) GetAPIKeyByHash(ctx context.Context, keyHash string) (*APIKey, error) {
	k := &APIKey{}
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id, user_id, key_hash, name, created_at, revoked_at
		 FROM api_keys WHERE key_hash = $1`,
		keyHash,
	).Scan(&k.ID, &k.UserID, &k.KeyHash, &k.Name, &k.CreatedAt, &k.RevokedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get api key by hash: %w", err)
	}
	return k, nil
}

// RevokeAPIKey sets revoked_at on the key identified by id, but only if it
// belongs to userID and has not already been revoked.
func (s *Store) RevokeAPIKey(ctx context.Context, id, userID string) error {
	tag, err := s.db.Pool.Exec(ctx,
		`UPDATE api_keys SET revoked_at = NOW()
		 WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
		id, userID,
	)
	if err != nil {
		return fmt.Errorf("revoke api key: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ── Rate Limit Config ─────────────────────────────────────────────────────────

type LimitConfig struct {
	ID            string
	UserID        string
	Identifier    string
	Algorithm     string
	Limit         int
	WindowSeconds int
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (s *Store) CreateLimitConfig(ctx context.Context, userID, identifier, algorithm string, limit, windowSeconds int) (*LimitConfig, error) {
	c := &LimitConfig{}
	err := s.db.Pool.QueryRow(ctx,
		`INSERT INTO rate_limit_configs (user_id, identifier, algorithm, "limit", window_seconds)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, user_id, identifier, algorithm, "limit", window_seconds, created_at, updated_at`,
		userID, identifier, algorithm, limit, windowSeconds,
	).Scan(&c.ID, &c.UserID, &c.Identifier, &c.Algorithm, &c.Limit, &c.WindowSeconds, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrConflict
		}
		return nil, fmt.Errorf("create limit config: %w", err)
	}
	return c, nil
}

func (s *Store) GetLimitConfig(ctx context.Context, userID, identifier string) (*LimitConfig, error) {
	c := &LimitConfig{}
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id, user_id, identifier, algorithm, "limit", window_seconds, created_at, updated_at
		 FROM rate_limit_configs WHERE user_id = $1 AND identifier = $2`,
		userID, identifier,
	).Scan(&c.ID, &c.UserID, &c.Identifier, &c.Algorithm, &c.Limit, &c.WindowSeconds, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get limit config: %w", err)
	}
	return c, nil
}

func (s *Store) DeleteLimitConfig(ctx context.Context, userID, identifier string) error {
	tag, err := s.db.Pool.Exec(ctx,
		`DELETE FROM rate_limit_configs WHERE user_id = $1 AND identifier = $2`,
		userID, identifier,
	)
	if err != nil {
		return fmt.Errorf("delete limit config: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
