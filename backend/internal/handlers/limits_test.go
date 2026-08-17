package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"time"

	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/shardleak/shardleak/internal/auth"
	"github.com/shardleak/shardleak/internal/handlers"
	appmiddleware "github.com/shardleak/shardleak/internal/middleware"
)

func uniqueLimitsEmail(t *testing.T) string {
	return fmt.Sprintf("limitstest.%d@example.com", time.Now().UnixNano())
}

func setupLimitsUser(t *testing.T) (string, string) {
	t.Helper()
	db, st := testAuthDB(t)
	email := uniqueLimitsEmail(t)
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

// ── Limits validation (no DB needed) ─────────────────────────────────────────

func TestLimits_Create_InvalidAlgorithm(t *testing.T) {
	h := handlers.NewLimitsHandler(nil)
	token, _ := auth.CreateToken("fake-user", authTestSecret)
	wrapped := appmiddleware.JWTAuth(authTestSecret)(http.HandlerFunc(h.Create))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/limits", bytes.NewBufferString(
		`{"identifier":"user:1","algorithm":"sliding_window","limit":100,"window_seconds":60}`,
	))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestLimits_Create_InvalidLimit(t *testing.T) {
	h := handlers.NewLimitsHandler(nil)
	token, _ := auth.CreateToken("fake-user", authTestSecret)
	wrapped := appmiddleware.JWTAuth(authTestSecret)(http.HandlerFunc(h.Create))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/limits", bytes.NewBufferString(
		`{"identifier":"user:1","algorithm":"token_bucket","limit":0,"window_seconds":60}`,
	))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestLimits_Create_InvalidWindow(t *testing.T) {
	h := handlers.NewLimitsHandler(nil)
	token, _ := auth.CreateToken("fake-user", authTestSecret)
	wrapped := appmiddleware.JWTAuth(authTestSecret)(http.HandlerFunc(h.Create))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/limits", bytes.NewBufferString(
		`{"identifier":"user:1","algorithm":"fixed_window","limit":10,"window_seconds":-1}`,
	))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestLimits_Create_MissingIdentifier(t *testing.T) {
	h := handlers.NewLimitsHandler(nil)
	token, _ := auth.CreateToken("fake-user", authTestSecret)
	wrapped := appmiddleware.JWTAuth(authTestSecret)(http.HandlerFunc(h.Create))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/limits", bytes.NewBufferString(
		`{"identifier":"","algorithm":"token_bucket","limit":10,"window_seconds":60}`,
	))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	wrapped.ServeHTTP(w, req)
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

// ── Limits integration (DB required) ─────────────────────────────────────────

func TestLimits_CreateGetDelete(t *testing.T) {
	_, token := setupLimitsUser(t)
	_, st := testAuthDB(t)
	h := handlers.NewLimitsHandler(st)

	rr := chi.NewRouter()
	rr.Use(appmiddleware.JWTAuth(authTestSecret))
	rr.Post("/limits", h.Create)
	rr.Get("/limits/{identifier}", h.Get)
	rr.Delete("/limits/{identifier}", h.Delete)

	// Create
	createReq := httptest.NewRequest(http.MethodPost, "/limits", bytes.NewBufferString(
		`{"identifier":"user:limits-test","algorithm":"token_bucket","limit":50,"window_seconds":120}`,
	))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+token)
	cw := httptest.NewRecorder()
	rr.ServeHTTP(cw, createReq)
	assertStatus(t, cw, http.StatusCreated)

	var created struct {
		Identifier    string `json:"identifier"`
		Algorithm     string `json:"algorithm"`
		Limit         int    `json:"limit"`
		WindowSeconds int    `json:"window_seconds"`
	}
	json.NewDecoder(cw.Body).Decode(&created) //nolint:errcheck
	if created.Limit != 50 {
		t.Errorf("limit: want 50, got %d", created.Limit)
	}

	// Get
	getReq := httptest.NewRequest(http.MethodGet, "/limits/user:limits-test", nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	gw := httptest.NewRecorder()
	rr.ServeHTTP(gw, getReq)
	assertStatus(t, gw, http.StatusOK)

	// Delete
	delReq := httptest.NewRequest(http.MethodDelete, "/limits/user:limits-test", nil)
	delReq.Header.Set("Authorization", "Bearer "+token)
	dw := httptest.NewRecorder()
	rr.ServeHTTP(dw, delReq)
	assertStatus(t, dw, http.StatusOK)

	// Get after delete → 404
	getReq2 := httptest.NewRequest(http.MethodGet, "/limits/user:limits-test", nil)
	getReq2.Header.Set("Authorization", "Bearer "+token)
	gw2 := httptest.NewRecorder()
	rr.ServeHTTP(gw2, getReq2)
	assertStatus(t, gw2, http.StatusNotFound)
}

func TestLimits_Get_NotFound(t *testing.T) {
	_, token := setupLimitsUser(t)
	_, st := testAuthDB(t)
	h := handlers.NewLimitsHandler(st)

	rr := chi.NewRouter()
	rr.Use(appmiddleware.JWTAuth(authTestSecret))
	rr.Get("/limits/{identifier}", h.Get)

	req := httptest.NewRequest(http.MethodGet, "/limits/nonexistent:identifier", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	rr.ServeHTTP(w, req)
	assertStatus(t, w, http.StatusNotFound)
	assertErrorCode(t, w, "NOT_FOUND")
}

func TestLimits_CrossUserDenied(t *testing.T) {
	db, st := testAuthDB(t)

	authH := handlers.NewAuthHandler(st, authTestSecret)
	limitsH := handlers.NewLimitsHandler(st)

	rr := chi.NewRouter()
	rr.Use(appmiddleware.JWTAuth(authTestSecret))
	rr.Post("/limits", limitsH.Create)
	rr.Get("/limits/{identifier}", limitsH.Get)

	// Create user 1 and config
	email1 := uniqueLimitsEmail(t)
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

	token1, _ := auth.CreateToken(u1.ID, authTestSecret)
	createReq := httptest.NewRequest(http.MethodPost, "/limits", bytes.NewBufferString(
		`{"identifier":"user:cross-test","algorithm":"fixed_window","limit":10,"window_seconds":60}`,
	))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+token1)
	rr.ServeHTTP(httptest.NewRecorder(), createReq)

	// Create user 2 and try to access user 1's config
	email2 := uniqueLimitsEmail(t)
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

	token2, _ := auth.CreateToken(u2.ID, authTestSecret)
	getReq := httptest.NewRequest(http.MethodGet, "/limits/user:cross-test", nil)
	getReq.Header.Set("Authorization", "Bearer "+token2)
	gw := httptest.NewRecorder()
	rr.ServeHTTP(gw, getReq)
	// User 2 gets 404 because the config is scoped to user 1
	assertStatus(t, gw, http.StatusNotFound)
}
