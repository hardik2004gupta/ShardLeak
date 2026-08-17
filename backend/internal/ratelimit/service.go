package ratelimit

import (
	"context"
	"fmt"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

type Service struct {
	rdb *goredis.Client
}

func NewService(rdb *goredis.Client) *Service {
	return &Service{rdb: rdb}
}

func (s *Service) Check(ctx context.Context, req Request) (Result, error) {
	switch req.Algorithm {
	case TokenBucket:
		return checkTokenBucket(ctx, s.rdb, req)
	case FixedWindow:
		return checkFixedWindow(ctx, s.rdb, req)
	default:
		return Result{}, fmt.Errorf("unsupported algorithm: %s", req.Algorithm)
	}
}

// parseResult converts the raw []any returned by a Lua script into a Result.
// Lua return order: {allowed, remaining, reset_at_unix, retry_after_secs}
func parseResult(raw any, limit int) (Result, error) {
	vals, ok := raw.([]any)
	if !ok || len(vals) < 4 {
		return Result{}, fmt.Errorf("unexpected lua return: %T %v", raw, raw)
	}
	allowed, _ := vals[0].(int64)
	remaining, _ := vals[1].(int64)
	resetAtUnix, _ := vals[2].(int64)
	retryAfter, _ := vals[3].(int64)

	return Result{
		Allowed:    allowed == 1,
		Remaining:  int(remaining),
		Limit:      limit,
		ResetAt:    time.Unix(resetAtUnix, 0).UTC(),
		RetryAfter: int(retryAfter),
	}, nil
}
