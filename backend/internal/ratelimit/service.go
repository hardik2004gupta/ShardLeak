package ratelimit

import (
	"context"
	"fmt"
	"time"

	goredis "github.com/redis/go-redis/v9"

	"github.com/shardleak/shardleak/internal/metrics"
)

type Service struct {
	rdb *goredis.Client
}

func NewService(rdb *goredis.Client) *Service {
	return &Service{rdb: rdb}
}

func (s *Service) Check(ctx context.Context, req Request) (Result, error) {
	var result Result
	var err error
	switch req.Algorithm {
	case TokenBucket:
		result, err = checkTokenBucket(ctx, s.rdb, req)
	case FixedWindow:
		result, err = checkFixedWindow(ctx, s.rdb, req)
	default:
		return Result{}, fmt.Errorf("unsupported algorithm: %s", req.Algorithm)
	}
	if err != nil {
		metrics.RedisErrorsTotal.Inc()
	}
	return result, err
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
