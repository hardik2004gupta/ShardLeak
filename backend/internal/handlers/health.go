package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/shardleak/shardleak/internal/postgres"
	"github.com/shardleak/shardleak/internal/redis"
)

type HealthHandler struct {
	db    *postgres.DB
	cache *redis.Client
}

func NewHealthHandler(db *postgres.DB, cache *redis.Client) *HealthHandler {
	return &HealthHandler{db: db, cache: cache}
}

// Health reports that the process is alive.
func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Ready checks that both PostgreSQL and Redis are reachable.
func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	services := map[string]string{}
	healthy := true

	if err := h.db.Ping(ctx); err != nil {
		services["postgres"] = "unavailable"
		healthy = false
	} else {
		services["postgres"] = "ok"
	}

	if err := h.cache.Ping(ctx); err != nil {
		services["redis"] = "unavailable"
		healthy = false
	} else {
		services["redis"] = "ok"
	}

	status := "ok"
	code := http.StatusOK
	if !healthy {
		status = "degraded"
		code = http.StatusServiceUnavailable
	}

	writeJSON(w, code, map[string]any{
		"status":   status,
		"services": services,
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}
