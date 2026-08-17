package auth_test

import (
	"strings"
	"testing"

	"github.com/shardleak/shardleak/internal/auth"
)

func TestHashPassword_RoundTrip(t *testing.T) {
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if err := auth.CheckPassword(hash, "password123"); err != nil {
		t.Errorf("correct password rejected: %v", err)
	}
	if err := auth.CheckPassword(hash, "wrongpassword"); err == nil {
		t.Error("wrong password should be rejected")
	}
}

func TestHashPassword_NotPlaintext(t *testing.T) {
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
	if hash == "password123" {
		t.Error("password must not be stored as plaintext")
	}
}

func TestHashPassword_DifferentHashes(t *testing.T) {
	h1, _ := auth.HashPassword("password123")
	h2, _ := auth.HashPassword("password123")
	// bcrypt includes a random salt, so hashes differ
	if h1 == h2 {
		t.Error("same password should produce different bcrypt hashes (random salt)")
	}
}

func TestCreateToken_ValidateToken(t *testing.T) {
	secret := "test-jwt-secret"
	userID := "user-uuid-abc123"

	token, err := auth.CreateToken(userID, secret)
	if err != nil {
		t.Fatalf("create token: %v", err)
	}
	if token == "" {
		t.Fatal("token should not be empty")
	}

	claims, err := auth.ValidateToken(token, secret)
	if err != nil {
		t.Fatalf("validate token: %v", err)
	}
	if claims.Subject != userID {
		t.Errorf("subject: want %q, got %q", userID, claims.Subject)
	}
}

func TestValidateToken_WrongSecret(t *testing.T) {
	token, _ := auth.CreateToken("user-id", "secret-a")
	if _, err := auth.ValidateToken(token, "secret-b"); err == nil {
		t.Error("token with wrong secret should be invalid")
	}
}

func TestValidateToken_Malformed(t *testing.T) {
	if _, err := auth.ValidateToken("not.a.valid.jwt", "secret"); err == nil {
		t.Error("malformed token should be invalid")
	}
	if _, err := auth.ValidateToken("", "secret"); err == nil {
		t.Error("empty token should be invalid")
	}
}

func TestGenerateAPIKey_Format(t *testing.T) {
	plain, hash, err := auth.GenerateAPIKey()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if !strings.HasPrefix(plain, "sk_shard_") {
		t.Errorf("key should start with sk_shard_, got %q", plain)
	}
	if hash == plain {
		t.Error("hash should differ from plaintext")
	}
	if hash == "" {
		t.Error("hash should not be empty")
	}
}

func TestGenerateAPIKey_Uniqueness(t *testing.T) {
	plain1, _, _ := auth.GenerateAPIKey()
	plain2, _, _ := auth.GenerateAPIKey()
	if plain1 == plain2 {
		t.Error("generated keys should be unique")
	}
}

func TestHashAPIKey_Deterministic(t *testing.T) {
	key := "sk_shard_abc123def456"
	h1 := auth.HashAPIKey(key)
	h2 := auth.HashAPIKey(key)
	if h1 != h2 {
		t.Error("HashAPIKey should be deterministic for the same input")
	}
}

func TestHashAPIKey_DifferentInputs(t *testing.T) {
	h1 := auth.HashAPIKey("sk_shard_aaa")
	h2 := auth.HashAPIKey("sk_shard_bbb")
	if h1 == h2 {
		t.Error("different keys should produce different hashes")
	}
}
