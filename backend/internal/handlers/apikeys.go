package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/shardleak/shardleak/internal/auth"
	appmiddleware "github.com/shardleak/shardleak/internal/middleware"
	"github.com/shardleak/shardleak/internal/store"
)

// APIKeyHandler handles creation, listing, and revocation of API keys.
type APIKeyHandler struct {
	st *store.Store
}

func NewAPIKeyHandler(st *store.Store) *APIKeyHandler {
	return &APIKeyHandler{st: st}
}

type createAPIKeyRequest struct {
	Name string `json:"name"`
}

type createAPIKeyResponse struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Key       string    `json:"key"` // plaintext shown only at creation
	CreatedAt time.Time `json:"created_at"`
}

type apiKeyMeta struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	CreatedAt time.Time  `json:"created_at"`
	RevokedAt *time.Time `json:"revoked_at"`
}

func (h *APIKeyHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := appmiddleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req createAPIKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "invalid JSON body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "name is required")
		return
	}

	plaintext, keyHash, err := auth.GenerateAPIKey()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to generate API key")
		return
	}

	key, err := h.st.CreateAPIKey(r.Context(), userID, keyHash, req.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create API key")
		return
	}

	writeJSON(w, http.StatusCreated, createAPIKeyResponse{
		ID:        key.ID,
		Name:      key.Name,
		Key:       plaintext,
		CreatedAt: key.CreatedAt,
	})
}

func (h *APIKeyHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := appmiddleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	keys, err := h.st.GetAPIKeysByUser(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to retrieve API keys")
		return
	}

	result := make([]apiKeyMeta, len(keys))
	for i, k := range keys {
		result[i] = apiKeyMeta{
			ID:        k.ID,
			Name:      k.Name,
			CreatedAt: k.CreatedAt,
			RevokedAt: k.RevokedAt,
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"api_keys": result})
}

func (h *APIKeyHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	userID, ok := appmiddleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "id is required")
		return
	}

	if err := h.st.RevokeAPIKey(r.Context(), id, userID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "API key not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to revoke API key")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
}
