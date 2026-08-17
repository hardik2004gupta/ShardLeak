package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	jwt "github.com/golang-jwt/jwt/v5"

	"github.com/shardleak/shardleak/internal/auth"
	appmiddleware "github.com/shardleak/shardleak/internal/middleware"
)

const testSecret = "test-jwt-secret-for-middleware"

func okHandler(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
}

func jwtWrapped(handler http.HandlerFunc) http.Handler {
	return appmiddleware.JWTAuth(testSecret)(handler)
}

func TestJWTAuth_MissingHeader(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	jwtWrapped(okHandler).ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status: want 401, got %d", w.Code)
	}
}

func TestJWTAuth_WrongScheme(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Basic dXNlcjpwYXNz")
	jwtWrapped(okHandler).ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status: want 401, got %d", w.Code)
	}
}

func TestJWTAuth_MalformedToken(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer not.a.valid.jwt.token")
	jwtWrapped(okHandler).ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status: want 401, got %d", w.Code)
	}
}

func TestJWTAuth_InvalidSignature(t *testing.T) {
	token, _ := auth.CreateToken("user-id", "different-secret")
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	jwtWrapped(okHandler).ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status: want 401, got %d", w.Code)
	}
}

func TestJWTAuth_ExpiredToken(t *testing.T) {
	claims := auth.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "user-id",
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, _ := tok.SignedString([]byte(testSecret))

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	jwtWrapped(okHandler).ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status: want 401, got %d", w.Code)
	}
}

func TestJWTAuth_ValidToken_PassesThrough(t *testing.T) {
	token, err := auth.CreateToken("user-abc", testSecret)
	if err != nil {
		t.Fatal(err)
	}

	var gotUserID string
	handler := appmiddleware.JWTAuth(testSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUserID, _ = appmiddleware.GetUserID(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status: want 200, got %d", w.Code)
	}
	if gotUserID != "user-abc" {
		t.Errorf("user ID in context: want %q, got %q", "user-abc", gotUserID)
	}
}
