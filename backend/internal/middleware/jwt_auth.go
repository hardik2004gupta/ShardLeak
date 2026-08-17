package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/shardleak/shardleak/internal/auth"
)

type contextKey string

const userIDKey contextKey = "user_id"

// JWTAuth returns middleware that validates a Bearer JWT in the Authorization header
// and injects the user ID into the request context.
func JWTAuth(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := bearerToken(r)
			if token == "" {
				writeErrJSON(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing or invalid Authorization header")
				return
			}
			claims, err := auth.ValidateToken(token, secret)
			if err != nil {
				writeErrJSON(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired token")
				return
			}
			ctx := context.WithValue(r.Context(), userIDKey, claims.Subject)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserID extracts the user ID injected by JWTAuth or APIKeyAuth from the context.
func GetUserID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(userIDKey).(string)
	return id, ok && id != ""
}

// bearerToken extracts the value from an "Authorization: Bearer <value>" header.
func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(header, "Bearer ")
}

// writeErrJSON writes a standard error response without importing the handlers package.
func writeErrJSON(w http.ResponseWriter, code int, errCode, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]any{ //nolint:errcheck
		"error": map[string]string{"code": errCode, "message": message},
	})
}
