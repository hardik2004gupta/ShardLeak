package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/shardleak/shardleak/internal/auth"
	"github.com/shardleak/shardleak/internal/handlers"
	appmiddleware "github.com/shardleak/shardleak/internal/middleware"
)

func uniqueAPIKeyEmail(t *testing.T) string {
	return fmt.Sprintf("apikeytest.%d@example.com", time.Now().UnixNano())
}

// setupUserAndToken creates a test user and returns the user ID and a valid JWT.
func setupUserAndToken(t *testing.T) (string, string) {
	t.Helper()
	db, st := testAuthDB(t)
	email := uniqueAPIKeyEmail(t)
	h := handlers.NewAuthHandler(st, authTestSecret)

	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(
		fmt.Sprintf(`{"email":%q,"password":"testpassword123"}`, email),
	))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Signup(w, req)

	var resp struct {
		ID string `json:"id"`
	}
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck
	if resp.ID == "" {
		t.Skip("could not create test user (DB unavailable)")
	}
	t.Cleanup(func() {
		db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", resp.ID)
	})

	token, _ := auth.CreateToken(resp.ID, authTestSecret)
	return resp.ID, token
}

// ── API key validation (no DB needed) ────────────────────────────────────────

func TestCreateAPIKey_MissingName(t *testing.T) {
	h := handlers.NewAPIKeyHandler(nil)
	// Inject a fake user ID into context to skip the auth check
	wrapped := appmiddleware.JWTAuth(authTestSecret)(http.HandlerFunc(h.Create))

	token, _ := auth.CreateToken("fake-user-id", authTestSecret)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/api-keys", bytes.NewBufferString(`{"name":""}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)
	// "fake-user-id" is set in context, so we reach name validation
	// But we have nil store - if name is empty, the handler returns before calling the store
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

// ── API key integration (DB required) ────────────────────────────────────────

func TestAPIKey_Create_PlaintextReturnedOnce(t *testing.T) {
	_, token := setupUserAndToken(t)
	_, st := testAuthDB(t)
	h := handlers.NewAPIKeyHandler(st)
	wrapped := appmiddleware.JWTAuth(authTestSecret)(http.HandlerFunc(h.Create))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/api-keys",
		bytes.NewBufferString(`{"name":"Test Key"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)
	assertStatus(t, w, http.StatusCreated)

	var resp struct {
		ID  string `json:"id"`
		Key string `json:"key"`
	}
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck

	if !strings.HasPrefix(resp.Key, "sk_shard_") {
		t.Errorf("key should start with sk_shard_, got %q", resp.Key)
	}
	if resp.ID == "" {
		t.Error("ID should not be empty")
	}
}

func TestAPIKey_HashStoredNotPlaintext(t *testing.T) {
	_, token := setupUserAndToken(t)
	_, st := testAuthDB(t)
	h := handlers.NewAPIKeyHandler(st)
	wrapped := appmiddleware.JWTAuth(authTestSecret)(http.HandlerFunc(h.Create))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/api-keys",
		bytes.NewBufferString(`{"name":"Hash Test"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)

	var resp struct {
		ID  string `json:"id"`
		Key string `json:"key"`
	}
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck

	// Retrieve and verify the hash stored is SHA-256 of the plaintext, not the plaintext itself
	ctx := context.Background()
	keyHash := auth.HashAPIKey(resp.Key)
	stored, err := st.GetAPIKeyByHash(ctx, keyHash)
	if err != nil {
		t.Fatalf("get key by hash: %v", err)
	}
	if stored.KeyHash == resp.Key {
		t.Error("plaintext key must not be stored in database")
	}
}

func TestAPIKey_List_NoPlanetextOrHash(t *testing.T) {
	_, token := setupUserAndToken(t)
	_, st := testAuthDB(t)
	h := handlers.NewAPIKeyHandler(st)

	// Create a key
	createWrapped := appmiddleware.JWTAuth(authTestSecret)(http.HandlerFunc(h.Create))
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/api-keys",
		bytes.NewBufferString(`{"name":"List Test"}`))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+token)
	createWrapped.ServeHTTP(httptest.NewRecorder(), createReq)

	// List keys
	listWrapped := appmiddleware.JWTAuth(authTestSecret)(http.HandlerFunc(h.List))
	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/api-keys", nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	listWrapped.ServeHTTP(w, listReq)
	assertStatus(t, w, http.StatusOK)

	var resp struct {
		APIKeys []struct {
			ID        string      `json:"id"`
			Name      string      `json:"name"`
			Key       interface{} `json:"key"`
			KeyHash   interface{} `json:"key_hash"`
			RevokedAt interface{} `json:"revoked_at"`
		} `json:"api_keys"`
	}
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck

	if len(resp.APIKeys) == 0 {
		t.Fatal("expected at least one key")
	}
	for _, k := range resp.APIKeys {
		if k.Key != nil {
			t.Error("listing must not return plaintext key")
		}
		if k.KeyHash != nil {
			t.Error("listing must not return key hash")
		}
	}
}

func TestAPIKey_Revoke(t *testing.T) {
	_, token := setupUserAndToken(t)
	_, st := testAuthDB(t)
	h := handlers.NewAPIKeyHandler(st)

	// Create key
	createWrapped := appmiddleware.JWTAuth(authTestSecret)(http.HandlerFunc(h.Create))
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/api-keys",
		bytes.NewBufferString(`{"name":"Revoke Me"}`))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+token)
	cw := httptest.NewRecorder()
	createWrapped.ServeHTTP(cw, createReq)

	var created struct {
		ID string `json:"id"`
	}
	json.NewDecoder(cw.Body).Decode(&created) //nolint:errcheck

	// Revoke key via chi router (needs URL param)
	revokeWrapped := appmiddleware.JWTAuth(authTestSecret)(http.HandlerFunc(h.Revoke))
	rr := chi.NewRouter()
	rr.Use(appmiddleware.JWTAuth(authTestSecret))
	rr.Delete("/api-keys/{id}", h.Revoke)

	revokeReq := httptest.NewRequest(http.MethodDelete, "/api-keys/"+created.ID, nil)
	revokeReq.Header.Set("Authorization", "Bearer "+token)
	rw := httptest.NewRecorder()
	rr.ServeHTTP(rw, revokeReq)
	assertStatus(t, rw, http.StatusOK)
	_ = revokeWrapped // used above via chi router
}

func TestAPIKey_Revoke_OtherUser(t *testing.T) {
	db, st := testAuthDB(t)

	// User 1
	email1 := uniqueAPIKeyEmail(t)
	authH := handlers.NewAuthHandler(st, authTestSecret)
	req1 := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(
		fmt.Sprintf(`{"email":%q,"password":"password123"}`, email1),
	))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	authH.Signup(w1, req1)
	var u1 struct {
		ID string `json:"id"`
	}
	json.NewDecoder(w1.Body).Decode(&u1) //nolint:errcheck
	t.Cleanup(func() { db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u1.ID) })

	// User 2
	email2 := uniqueAPIKeyEmail(t)
	req2 := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(
		fmt.Sprintf(`{"email":%q,"password":"password123"}`, email2),
	))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	authH.Signup(w2, req2)
	var u2 struct {
		ID string `json:"id"`
	}
	json.NewDecoder(w2.Body).Decode(&u2) //nolint:errcheck
	t.Cleanup(func() { db.Pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", u2.ID) })

	// User 1 creates a key
	token1, _ := auth.CreateToken(u1.ID, authTestSecret)
	h := handlers.NewAPIKeyHandler(st)
	createWrapped := appmiddleware.JWTAuth(authTestSecret)(http.HandlerFunc(h.Create))
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/api-keys",
		bytes.NewBufferString(`{"name":"User1 Key"}`))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+token1)
	cw := httptest.NewRecorder()
	createWrapped.ServeHTTP(cw, createReq)
	var created struct {
		ID string `json:"id"`
	}
	json.NewDecoder(cw.Body).Decode(&created) //nolint:errcheck

	// User 2 tries to revoke User 1's key
	token2, _ := auth.CreateToken(u2.ID, authTestSecret)
	rr := chi.NewRouter()
	rr.Use(appmiddleware.JWTAuth(authTestSecret))
	rr.Delete("/api-keys/{id}", h.Revoke)

	revokeReq := httptest.NewRequest(http.MethodDelete, "/api-keys/"+created.ID, nil)
	revokeReq.Header.Set("Authorization", "Bearer "+token2)
	rw := httptest.NewRecorder()
	rr.ServeHTTP(rw, revokeReq)
	assertStatus(t, rw, http.StatusNotFound)
}
