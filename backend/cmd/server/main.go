package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/shardleak/shardleak/internal/config"
	"github.com/shardleak/shardleak/internal/handlers"
	appmiddleware "github.com/shardleak/shardleak/internal/middleware"
	"github.com/shardleak/shardleak/internal/postgres"
	"github.com/shardleak/shardleak/internal/ratelimit"
	"github.com/shardleak/shardleak/internal/redis"
	"github.com/shardleak/shardleak/internal/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	ctx := context.Background()

	db, err := postgres.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect postgres: %w", err)
	}
	defer db.Close()

	if err := db.Ping(ctx); err != nil {
		return fmt.Errorf("ping postgres: %w", err)
	}
	slog.Info("connected to postgres")

	cache, err := redis.New(cfg.RedisURL)
	if err != nil {
		return fmt.Errorf("connect redis: %w", err)
	}
	defer cache.Close() //nolint:errcheck

	if err := cache.Ping(ctx); err != nil {
		return fmt.Errorf("ping redis: %w", err)
	}
	slog.Info("connected to redis")

	st := store.New(db)
	health := handlers.NewHealthHandler(db, cache)
	rl := ratelimit.NewService(cache.Native())
	check := handlers.NewCheckHandler(rl)
	authH := handlers.NewAuthHandler(st, cfg.JWTSecret)
	apiKeyH := handlers.NewAPIKeyHandler(st)
	limitsH := handlers.NewLimitsHandler(st)

	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))
	r.Use(appmiddleware.RequestLogger)

	r.Get("/health", health.Health)
	r.Get("/ready", health.Ready)

	r.Route("/api/v1", func(r chi.Router) {
		// Public auth endpoints
		r.Post("/auth/signup", authH.Signup)
		r.Post("/auth/login", authH.Login)

		// JWT-protected endpoints
		r.Group(func(r chi.Router) {
			r.Use(appmiddleware.JWTAuth(cfg.JWTSecret))
			r.Get("/auth/me", authH.Me)
			r.Post("/api-keys", apiKeyH.Create)
			r.Get("/api-keys", apiKeyH.List)
			r.Delete("/api-keys/{id}", apiKeyH.Revoke)
			r.Post("/limits", limitsH.Create)
			r.Get("/limits/{identifier}", limitsH.Get)
			r.Delete("/limits/{identifier}", limitsH.Delete)
		})

		// API-key-protected endpoints
		r.Group(func(r chi.Router) {
			r.Use(appmiddleware.APIKeyAuth(st))
			r.Post("/check", check.Check)
		})
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		slog.Info("server starting", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "error", err)
		}
	}()

	<-quit
	slog.Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	return srv.Shutdown(shutdownCtx)
}
