package handlers

import (
	"encoding/json"
	"net/http"
)

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func writeError(w http.ResponseWriter, code int, errCode, message string) {
	writeJSON(w, code, map[string]any{
		"error": map[string]string{
			"code":    errCode,
			"message": message,
		},
	})
}
