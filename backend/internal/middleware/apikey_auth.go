package middleware

import (
	"context"
	"net/http"

	"github.com/shardleak/shardleak/internal/auth"
	"github.com/shardleak/shardleak/internal/store"
)

// APIKeyAuth returns middleware that validates a Bearer API key (sk_shard_...) against
// the database and injects the key owner's user ID into the request context.
func APIKeyAuth(st *store.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := bearerToken(r)
			if token == "" {
				writeErrJSON(w, http.StatusUnauthorized, "UNAUTHORIZED", "API key required")
				return
			}
			keyHash := auth.HashAPIKey(token)
			key, err := st.GetAPIKeyByHash(r.Context(), keyHash)
			if err != nil {
				writeErrJSON(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid API key")
				return
			}
			if key.RevokedAt != nil {
				writeErrJSON(w, http.StatusUnauthorized, "UNAUTHORIZED", "API key has been revoked")
				return
			}
			ctx := context.WithValue(r.Context(), userIDKey, key.UserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
