package ratelimit

import (
	"context"
	"fmt"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

// fixedWindowLua performs an atomic fixed-window counter check-and-increment.
//
// KEYS[1]: "shardleak:rate:fw:{identifier}"
// ARGV[1]: limit          — max requests per window (integer)
// ARGV[2]: window_seconds — window size in seconds (integer)
// ARGV[3]: now_secs       — current unix time in seconds (integer)
//
// Returns: {allowed, remaining, reset_at_unix_secs, retry_after_secs}
const fixedWindowLua = `
local key            = KEYS[1]
local limit          = tonumber(ARGV[1])
local window_seconds = tonumber(ARGV[2])
local now            = tonumber(ARGV[3])

local window_start = math.floor(now / window_seconds) * window_seconds
local reset_at     = window_start + window_seconds
local window_key   = key .. ":" .. tostring(window_start)

local count = tonumber(redis.call("GET", window_key)) or 0

local allowed         = 0
local retry_after_sec = 0

if count < limit then
  local new_count = tonumber(redis.call("INCR", window_key))
  if new_count == 1 then
    redis.call("EXPIREAT", window_key, reset_at)
  end
  count   = new_count
  allowed = 1
else
  retry_after_sec = math.ceil(reset_at - now)
end

local remaining = math.max(0, limit - count)
return {allowed, remaining, reset_at, retry_after_sec}
`

var fwScript = goredis.NewScript(fixedWindowLua)

func checkFixedWindow(ctx context.Context, rdb *goredis.Client, req Request) (Result, error) {
	nowSecs := time.Now().Unix()
	key := fmt.Sprintf("shardleak:rate:fw:%s", req.Identifier)

	res, err := fwScript.Run(ctx, rdb, []string{key},
		req.Limit, req.WindowSeconds, nowSecs,
	).Result()
	if err != nil {
		return Result{}, fmt.Errorf("fixed window redis: %w", err)
	}
	return parseResult(res, req.Limit)
}
