package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	appmiddleware "github.com/shardleak/shardleak/internal/middleware"
	"github.com/shardleak/shardleak/internal/store"
)

// LimitsHandler handles creation, retrieval, and deletion of rate-limit configurations.
type LimitsHandler struct {
	st *store.Store
}

func NewLimitsHandler(st *store.Store) *LimitsHandler {
	return &LimitsHandler{st: st}
}

type createLimitRequest struct {
	Identifier    string `json:"identifier"`
	Algorithm     string `json:"algorithm"`
	Limit         int    `json:"limit"`
	WindowSeconds int    `json:"window_seconds"`
}

type limitConfigResponse struct {
	Identifier    string    `json:"identifier"`
	Algorithm     string    `json:"algorithm"`
	Limit         int       `json:"limit"`
	WindowSeconds int       `json:"window_seconds"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func (h *LimitsHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := appmiddleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req createLimitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid JSON body")
		return
	}

	if req.Identifier == "" {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "identifier is required")
		return
	}
	if req.Algorithm != "token_bucket" && req.Algorithm != "fixed_window" {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST",
			fmt.Sprintf("unsupported algorithm %q; use token_bucket or fixed_window", req.Algorithm))
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

	cfg, err := h.st.CreateLimitConfig(r.Context(), userID, req.Identifier, req.Algorithm, req.Limit, req.WindowSeconds)
	if err != nil {
		if errors.Is(err, store.ErrConflict) {
			writeError(w, http.StatusConflict, "CONFLICT", "configuration already exists for this identifier")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create configuration")
		return
	}

	writeJSON(w, http.StatusCreated, limitConfigResponse{
		Identifier:    cfg.Identifier,
		Algorithm:     cfg.Algorithm,
		Limit:         cfg.Limit,
		WindowSeconds: cfg.WindowSeconds,
		CreatedAt:     cfg.CreatedAt,
		UpdatedAt:     cfg.UpdatedAt,
	})
}

func (h *LimitsHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := appmiddleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	identifier := chi.URLParam(r, "identifier")
	if identifier == "" {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "identifier is required")
		return
	}

	cfg, err := h.st.GetLimitConfig(r.Context(), userID, identifier)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "configuration not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to retrieve configuration")
		return
	}

	writeJSON(w, http.StatusOK, limitConfigResponse{
		Identifier:    cfg.Identifier,
		Algorithm:     cfg.Algorithm,
		Limit:         cfg.Limit,
		WindowSeconds: cfg.WindowSeconds,
		CreatedAt:     cfg.CreatedAt,
		UpdatedAt:     cfg.UpdatedAt,
	})
}

func (h *LimitsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := appmiddleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	identifier := chi.URLParam(r, "identifier")
	if identifier == "" {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "identifier is required")
		return
	}

	if err := h.st.DeleteLimitConfig(r.Context(), userID, identifier); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "configuration not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to delete configuration")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
