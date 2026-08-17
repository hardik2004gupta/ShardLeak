package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/shardleak/shardleak/internal/auth"
	"github.com/shardleak/shardleak/internal/handlers"
	appmiddleware "github.com/shardleak/shardleak/internal/middleware"
	"github.com/shardleak/shardleak/internal/postgres"
	"github.com/shardleak/shardleak/internal/store"
)

const authTestSecret = "test-jwt-secret-handlers"

func testAuthDB(t *testing.T) (*postgres.DB, *store.Store) {
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

func uniqueAuthEmail(t *testing.T) string {
	return fmt.Sprintf("authtest.%d@example.com", time.Now().UnixNano())
}

func authJSONReq(t *testing.T, body any) *http.Request {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/signup", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	return req
}

// ── Signup validation (no DB needed) ─────────────────────────────────────────

func TestSignup_InvalidJSON(t *testing.T) {
	h := handlers.NewAuthHandler(nil, authTestSecret)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString("not json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Signup(w, req)
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestSignup_InvalidEmail(t *testing.T) {
	h := handlers.NewAuthHandler(nil, authTestSecret)
	w := httptest.NewRecorder()
	h.Signup(w, authJSONReq(t, map[string]any{"email": "notanemail", "password": "password123"}))
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestSignup_EmailMissingDomain(t *testing.T) {
	h := handlers.NewAuthHandler(nil, authTestSecret)
	w := httptest.NewRecorder()
	h.Signup(w, authJSONReq(t, map[string]any{"email": "user@nodot", "password": "password123"}))
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestSignup_ShortPassword(t *testing.T) {
	h := handlers.NewAuthHandler(nil, authTestSecret)
	w := httptest.NewRecorder()
	h.Signup(w, authJSONReq(t, map[string]any{"email": "user@example.com", "password": "short"}))
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

// ── Signup integration (DB required) ─────────────────────────────────────────

func TestSignup_Success(t *testing.T) {
	db, st := testAuthDB(t)
	h := handlers.NewAuthHandler(st, authTestSecret)
	email := uniqueAuthEmail(t)

	req := authJSONReq(t, map[string]any{"email": email, "password": "securepassword"})
	w := httptest.NewRecorder()
	h.Signup(w, req)
	assertStatus(t, w, http.StatusCreated)

	var resp struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.ID == "" {
		t.Error("response should contain id")
	}
	if resp.Email != email {
		t.Errorf("email: want %q, got %q", email, resp.Email)
	}

	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", resp.ID)
	})
}

func TestSignup_DuplicateEmail(t *testing.T) {
	db, st := testAuthDB(t)
	h := handlers.NewAuthHandler(st, authTestSecret)
	email := uniqueAuthEmail(t)

	// First signup
	req1 := authJSONReq(t, map[string]any{"email": email, "password": "securepassword"})
	w1 := httptest.NewRecorder()
	h.Signup(w1, req1)

	var first struct {
		ID string `json:"id"`
	}
	json.NewDecoder(w1.Body).Decode(&first) //nolint:errcheck
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", first.ID)
	})

	// Second signup with same email
	req2 := authJSONReq(t, map[string]any{"email": email, "password": "anotherpass"})
	w2 := httptest.NewRecorder()
	h.Signup(w2, req2)
	assertStatus(t, w2, http.StatusConflict)
	assertErrorCode(t, w2, "CONFLICT")
}

func TestSignup_PasswordIsHashed(t *testing.T) {
	db, st := testAuthDB(t)
	h := handlers.NewAuthHandler(st, authTestSecret)
	email := uniqueAuthEmail(t)
	password := "securepassword123"

	req := authJSONReq(t, map[string]any{"email": email, "password": password})
	w := httptest.NewRecorder()
	h.Signup(w, req)

	var resp struct {
		ID string `json:"id"`
	}
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", resp.ID)
	})

	// Verify stored hash is not the plaintext
	user, err := st.GetUserByEmail(context.Background(), email)
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if user.PasswordHash == password {
		t.Error("password must not be stored as plaintext")
	}
	if !strings.HasPrefix(user.PasswordHash, "$2a$") && !strings.HasPrefix(user.PasswordHash, "$2b$") {
		t.Errorf("password should be bcrypt hashed, got prefix from %q", user.PasswordHash[:4])
	}
}

// ── Login ─────────────────────────────────────────────────────────────────────

func TestLogin_EmptyFields(t *testing.T) {
	h := handlers.NewAuthHandler(nil, authTestSecret)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(`{"email":"","password":""}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Login(w, req)
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestLogin_Success(t *testing.T) {
	db, st := testAuthDB(t)
	h := handlers.NewAuthHandler(st, authTestSecret)
	email := uniqueAuthEmail(t)

	// Create user via signup
	signupReq := authJSONReq(t, map[string]any{"email": email, "password": "mypassword!"})
	signupW := httptest.NewRecorder()
	h.Signup(signupW, signupReq)
	var signup struct {
		ID string `json:"id"`
	}
	json.NewDecoder(signupW.Body).Decode(&signup) //nolint:errcheck
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", signup.ID)
	})

	// Login
	loginReq := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(
		fmt.Sprintf(`{"email":%q,"password":"mypassword!"}`, email),
	))
	loginReq.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Login(w, loginReq)
	assertStatus(t, w, http.StatusOK)

	var resp struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Token == "" {
		t.Error("token should not be empty")
	}

	// Validate the JWT
	claims, err := auth.ValidateToken(resp.Token, authTestSecret)
	if err != nil {
		t.Fatalf("validate token: %v", err)
	}
	if claims.Subject != signup.ID {
		t.Errorf("token subject: want %q, got %q", signup.ID, claims.Subject)
	}
}

func TestLogin_InvalidPassword(t *testing.T) {
	db, st := testAuthDB(t)
	h := handlers.NewAuthHandler(st, authTestSecret)
	email := uniqueAuthEmail(t)

	signupReq := authJSONReq(t, map[string]any{"email": email, "password": "correctpassword"})
	signupW := httptest.NewRecorder()
	h.Signup(signupW, signupReq)
	var signup struct {
		ID string `json:"id"`
	}
	json.NewDecoder(signupW.Body).Decode(&signup) //nolint:errcheck
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", signup.ID)
	})

	loginReq := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(
		fmt.Sprintf(`{"email":%q,"password":"wrongpassword"}`, email),
	))
	loginReq.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Login(w, loginReq)
	assertStatus(t, w, http.StatusUnauthorized)
	assertErrorCode(t, w, "UNAUTHORIZED")
}

func TestLogin_NonexistentUser(t *testing.T) {
	_, st := testAuthDB(t)
	h := handlers.NewAuthHandler(st, authTestSecret)

	loginReq := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(
		`{"email":"nobody@example.com","password":"somepassword"}`,
	))
	loginReq.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Login(w, loginReq)
	assertStatus(t, w, http.StatusUnauthorized)
	assertErrorCode(t, w, "UNAUTHORIZED")
}

// ── Me ────────────────────────────────────────────────────────────────────────

func TestMe_RequiresJWT(t *testing.T) {
	_, st := testAuthDB(t)
	// Wrap with JWT middleware, send no auth
	h := appmiddleware.JWTAuth(authTestSecret)(
		http.HandlerFunc(handlers.NewAuthHandler(st, authTestSecret).Me),
	)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	assertStatus(t, w, http.StatusUnauthorized)
}

func TestMe_ReturnsUserInfo(t *testing.T) {
	db, st := testAuthDB(t)
	h := handlers.NewAuthHandler(st, authTestSecret)
	email := uniqueAuthEmail(t)

	// Signup
	signupReq := authJSONReq(t, map[string]any{"email": email, "password": "password123!"})
	signupW := httptest.NewRecorder()
	h.Signup(signupW, signupReq)
	var signup struct {
		ID string `json:"id"`
	}
	json.NewDecoder(signupW.Body).Decode(&signup) //nolint:errcheck
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", signup.ID)
	})

	// Create token
	token, _ := auth.CreateToken(signup.ID, authTestSecret)

	// Call Me through middleware
	wrapped := appmiddleware.JWTAuth(authTestSecret)(http.HandlerFunc(h.Me))
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)
	assertStatus(t, w, http.StatusOK)

	var resp struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	}
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck
	if resp.ID != signup.ID {
		t.Errorf("id: want %q, got %q", signup.ID, resp.ID)
	}
	if resp.Email != email {
		t.Errorf("email: want %q, got %q", email, resp.Email)
	}
}
