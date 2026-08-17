package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/shardleak/shardleak/internal/handlers"
	"github.com/shardleak/shardleak/internal/ratelimit"
)

// Validation tests use NewService(nil) because validation errors return before
// any Redis call is made — the nil client is never dereferenced.

func TestCheck_InvalidJSON(t *testing.T) {
	h := handlers.NewCheckHandler(ratelimit.NewService(nil))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/check", bytes.NewBufferString("not json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Check(w, req)
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestCheck_EmptyIdentifier(t *testing.T) {
	h := handlers.NewCheckHandler(ratelimit.NewService(nil))
	w := httptest.NewRecorder()
	h.Check(w, jsonReq(t, map[string]any{
		"identifier": "", "limit": 10, "window_seconds": 60, "algorithm": "token_bucket",
	}))
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestCheck_LimitZero(t *testing.T) {
	h := handlers.NewCheckHandler(ratelimit.NewService(nil))
	w := httptest.NewRecorder()
	h.Check(w, jsonReq(t, map[string]any{
		"identifier": "user:1", "limit": 0, "window_seconds": 60, "algorithm": "token_bucket",
	}))
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestCheck_LimitNegative(t *testing.T) {
	h := handlers.NewCheckHandler(ratelimit.NewService(nil))
	w := httptest.NewRecorder()
	h.Check(w, jsonReq(t, map[string]any{
		"identifier": "user:1", "limit": -5, "window_seconds": 60, "algorithm": "token_bucket",
	}))
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestCheck_WindowSecondsZero(t *testing.T) {
	h := handlers.NewCheckHandler(ratelimit.NewService(nil))
	w := httptest.NewRecorder()
	h.Check(w, jsonReq(t, map[string]any{
		"identifier": "user:1", "limit": 10, "window_seconds": 0, "algorithm": "token_bucket",
	}))
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestCheck_WindowSecondsNegative(t *testing.T) {
	h := handlers.NewCheckHandler(ratelimit.NewService(nil))
	w := httptest.NewRecorder()
	h.Check(w, jsonReq(t, map[string]any{
		"identifier": "user:1", "limit": 10, "window_seconds": -1, "algorithm": "token_bucket",
	}))
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestCheck_UnsupportedAlgorithm(t *testing.T) {
	h := handlers.NewCheckHandler(ratelimit.NewService(nil))
	w := httptest.NewRecorder()
	h.Check(w, jsonReq(t, map[string]any{
		"identifier": "user:1", "limit": 10, "window_seconds": 60, "algorithm": "sliding_window",
	}))
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

func TestCheck_EmptyAlgorithm(t *testing.T) {
	h := handlers.NewCheckHandler(ratelimit.NewService(nil))
	w := httptest.NewRecorder()
	h.Check(w, jsonReq(t, map[string]any{
		"identifier": "user:1", "limit": 10, "window_seconds": 60, "algorithm": "",
	}))
	assertStatus(t, w, http.StatusBadRequest)
	assertErrorCode(t, w, "INVALID_REQUEST")
}

// ── helpers ───────────────────────────────────────────────────────────────────

func jsonReq(t *testing.T, body any) *http.Request {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/check", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func assertStatus(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Errorf("status: want %d, got %d", want, w.Code)
	}
}

func assertErrorCode(t *testing.T, w *httptest.ResponseRecorder, want string) {
	t.Helper()
	var resp struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error.Code != want {
		t.Errorf("error code: want %q, got %q", want, resp.Error.Code)
	}
}
