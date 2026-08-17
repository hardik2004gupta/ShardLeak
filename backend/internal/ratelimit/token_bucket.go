package ratelimit

import (
	"context"
	"fmt"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

// tokenBucketLua performs an atomic token bucket check-and-update.
//
// KEYS[1]: "shardleak:rate:tb:{identifier}"
// ARGV[1]: capacity        — max tokens (integer)
// ARGV[2]: rate_per_ms     — tokens refilled per millisecond (float)
// ARGV[3]: now_ms          — current unix time in milliseconds (integer)
// ARGV[4]: ttl_secs        — Redis key TTL in seconds (integer)
//
// Returns: {allowed, remaining, reset_at_unix_secs, retry_after_secs}
const tokenBucketLua = `
local key        = KEYS[1]
local capacity   = tonumber(ARGV[1])
local rate_per_ms = tonumber(ARGV[2])
local now_ms     = tonumber(ARGV[3])
local ttl_secs   = tonumber(ARGV[4])

local data    = redis.call("HMGET", key, "tokens", "last_ms")
local tokens  = tonumber(data[1])
local last_ms = tonumber(data[2])

if tokens == nil then
  tokens  = capacity
  last_ms = now_ms
end

local elapsed_ms = math.max(0, now_ms - last_ms)
tokens = math.min(capacity, tokens + elapsed_ms * rate_per_ms)

local allowed         = 0
local retry_after_sec = 0

if tokens >= 1 then
  tokens  = tokens - 1
  allowed = 1
else
  if rate_per_ms > 0 then
    retry_after_sec = math.ceil((1 - tokens) / rate_per_ms / 1000)
  else
    retry_after_sec = ttl_secs
  end
end

redis.call("HSET", key, "tokens", tostring(tokens), "last_ms", tostring(now_ms))
redis.call("EXPIRE", key, ttl_secs)

local secs_to_full = 0
if capacity > tokens and rate_per_ms > 0 then
  secs_to_full = math.ceil((capacity - tokens) / rate_per_ms / 1000)
end
local reset_at = math.floor(now_ms / 1000) + secs_to_full

return {allowed, math.floor(tokens), reset_at, retry_after_sec}
`

var tbScript = goredis.NewScript(tokenBucketLua)

func checkTokenBucket(ctx context.Context, rdb *goredis.Client, req Request) (Result, error) {
	nowMs := time.Now().UnixMilli()
	ratePerMs := float64(req.Limit) / float64(req.WindowSeconds) / 1000.0
	ttlSecs := req.WindowSeconds * 2
	key := fmt.Sprintf("shardleak:rate:tb:%s", req.Identifier)

	res, err := tbScript.Run(ctx, rdb, []string{key},
		req.Limit, ratePerMs, nowMs, ttlSecs,
	).Result()
	if err != nil {
		return Result{}, fmt.Errorf("token bucket redis: %w", err)
	}
	return parseResult(res, req.Limit)
}
