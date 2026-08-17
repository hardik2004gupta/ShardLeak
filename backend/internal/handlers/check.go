package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/shardleak/shardleak/internal/metrics"
	"github.com/shardleak/shardleak/internal/ratelimit"
)

type checkRequest struct {
	Identifier    string `json:"identifier"`
	Limit         int    `json:"limit"`
	WindowSeconds int    `json:"window_seconds"`
	Algorithm     string `json:"algorithm"`
}

type checkResponse struct {
	Allowed    bool      `json:"allowed"`
	Remaining  int       `json:"remaining"`
	ResetAt    time.Time `json:"reset_at"`
	RetryAfter *int      `json:"retry_after"`
}

// CheckHandler handles POST /api/v1/check.
type CheckHandler struct {
	rl *ratelimit.Service
}

func NewCheckHandler(rl *ratelimit.Service) *CheckHandler {
	return &CheckHandler{rl: rl}
}

func (h *CheckHandler) Check(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4096)

	var req checkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid JSON body")
		return
	}

	if req.Identifier == "" {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "identifier is required")
		return
	}
	if req.Limit <= 0 {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "limit must be greater than zero")
		return
	}
	if req.WindowSeconds <= 0 {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "window_seconds must be greater than zero")
		return
	}

	algo := ratelimit.Algorithm(req.Algorithm)
	if algo != ratelimit.TokenBucket && algo != ratelimit.FixedWindow {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST",
			fmt.Sprintf("unsupported algorithm %q; use token_bucket or fixed_window", req.Algorithm))
		return
	}

	algoLabel := string(algo)
	start := time.Now()
	metrics.RequestsTotal.WithLabelValues(algoLabel).Inc()

	result, err := h.rl.Check(r.Context(), ratelimit.Request{
		Identifier:    req.Identifier,
		Limit:         req.Limit,
		WindowSeconds: req.WindowSeconds,
		Algorithm:     algo,
	})
	metrics.RequestDuration.WithLabelValues(algoLabel).Observe(time.Since(start).Seconds())

	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "rate limit service unavailable")
		return
	}

	if result.Allowed {
		metrics.AllowedTotal.WithLabelValues(algoLabel).Inc()
	} else {
		metrics.RejectedTotal.WithLabelValues(algoLabel).Inc()
	}

	w.Header().Set("X-RateLimit-Limit", strconv.Itoa(req.Limit))
	w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(result.Remaining))
	w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(result.ResetAt.Unix(), 10))
	if !result.Allowed && result.RetryAfter > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(result.RetryAfter))
	}

	resp := checkResponse{
		Allowed:   result.Allowed,
		Remaining: result.Remaining,
		ResetAt:   result.ResetAt,
	}
	if !result.Allowed && result.RetryAfter > 0 {
		v := result.RetryAfter
		resp.RetryAfter = &v
	}

	writeJSON(w, http.StatusOK, resp)
}
