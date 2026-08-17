package middleware

import (
	"net/http"
	"os"
)

// CORS adds permissive CORS headers for the frontend origin configured in
// CORS_ORIGIN (default: http://localhost:3001).
func CORS(next http.Handler) http.Handler {
	origin := os.Getenv("CORS_ORIGIN")
	if origin == "" {
		origin = "http://localhost:3001"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
