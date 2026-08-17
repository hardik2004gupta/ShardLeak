# ShardLeak

A lightweight distributed rate-limiting service. A client sends a request with an identifier
(`user:123`, `api-key:abc`, `ip:192.168.1.1`) and ShardLeak returns `ALLOWED` or `REJECTED`
based on a configured policy. Rate-limit state is shared across API instances through Redis,
so horizontal scaling works without coordination overhead.

## Architecture

```
Client
  └─▶ ShardLeak Go API (stateless)
            ├─▶ Redis          ← rate-limit state, atomic Lua decisions
            └─▶ PostgreSQL     ← users, API keys, configurations
                      │
              Prometheus ─▶ Grafana
```

**PostgreSQL stores what must persist. Redis stores what must be fast. Go coordinates the system.**

Five engineering concepts in one service: **concurrency**, **atomicity**, **distributed state**, **performance**, **correctness**.

## Quick Start

Requires Docker and Docker Compose.

```bash
docker compose up --build
```

| Service    | URL                           |
|------------|-------------------------------|
| API        | http://localhost:8082         |
| Grafana    | http://localhost:3000         |
| Prometheus | http://localhost:9090         |
| Frontend   | `npm run dev` → :3001         |

Grafana default credentials: `admin` / `admin`.

The **ShardLeak** dashboard auto-provisions on startup. Generate traffic from the playground
and watch requests/sec, allowed/rejected rates, and latency appear in real time.

## Services

| Service    | Host port | Description                       |
|------------|-----------|-----------------------------------|
| API        | 8082      | Go HTTP server                    |
| PostgreSQL | 5435      | Persistent data store             |
| Redis      | 6380      | Rate-limit state, Lua atomicity   |
| Prometheus | 9090      | Metrics collection                |
| Grafana    | 3000      | Dashboard (auto-provisioned)      |

## Running the Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3001
```

## Running the API Directly

```bash
cp .env.example .env
cd backend
go run ./cmd/server
```

## Health Checks

```
GET /health   →  200 if the process is alive
GET /ready    →  200 if PostgreSQL and Redis are reachable
GET /metrics  →  Prometheus metrics
```

## Rate Limiting

`POST /api/v1/check` makes an atomic rate-limit decision backed by a Redis Lua script.

### Algorithms

**Token Bucket** (`token_bucket`) — Tokens refill continuously at `limit / window_seconds`
tokens per second. Allows controlled bursts up to `limit`, then enforces the average rate.

**Fixed Window** (`fixed_window`) — Counter resets at each window boundary. Simple and fast;
known tradeoff is a burst at the boundary between two windows.

### Atomicity

Every decision is a single Redis Lua script execution. The complete read-modify-write cycle is
atomic — concurrent requests from multiple API instances cannot race and bypass the limit.

### Example

```bash
curl -X POST http://localhost:8082/api/v1/check \
  -H "Authorization: Bearer sk_shard_..." \
  -H "Content-Type: application/json" \
  -d '{"identifier":"user:123","limit":5,"window_seconds":60,"algorithm":"token_bucket"}'
```

```json
{"allowed":true,"remaining":4,"reset_at":"2026-08-18T12:01:00Z","retry_after":null}
```

Response headers on every check:

```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 4
X-RateLimit-Reset: 1787054460
Retry-After: 42          (rejected requests only)
```

## Authentication

Signup and login return a JWT. Pass it as a Bearer token on protected endpoints.

```bash
# Signup
curl -X POST http://localhost:8082/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"securepassword"}'

# Login
curl -X POST http://localhost:8082/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"securepassword"}'
# → {"token":"eyJ..."}
```

## API Keys

Create API keys from a JWT-authenticated session. The plaintext key is returned **only at creation**.

```bash
# Create
curl -X POST http://localhost:8082/api/v1/api-keys \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production"}'
# → {"id":"...","name":"Production","key":"sk_shard_...","created_at":"..."}

# List (metadata only)
curl http://localhost:8082/api/v1/api-keys -H "Authorization: Bearer <jwt>"

# Revoke
curl -X DELETE http://localhost:8082/api/v1/api-keys/<id> -H "Authorization: Bearer <jwt>"
```

## Rate-Limit Configuration

Configurations are stored in PostgreSQL and used by the Playground.

```bash
# Create
curl -X POST http://localhost:8082/api/v1/limits \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"user:123","algorithm":"token_bucket","limit":100,"window_seconds":60}'

# List all
curl http://localhost:8082/api/v1/limits -H "Authorization: Bearer <jwt>"

# Get one
curl http://localhost:8082/api/v1/limits/user:123 -H "Authorization: Bearer <jwt>"

# Delete
curl -X DELETE http://localhost:8082/api/v1/limits/user:123 -H "Authorization: Bearer <jwt>"
```

## Observability

Prometheus scrapes `GET /metrics` every 15 seconds. Grafana auto-provisions the
**ShardLeak** dashboard displaying:

| Panel              | Query                                                                 |
|--------------------|-----------------------------------------------------------------------|
| Requests / sec     | `rate(shardleak_requests_total[1m])`                                  |
| Allowed / sec      | `rate(shardleak_allowed_total[1m])`                                   |
| Rejected / sec     | `rate(shardleak_rejected_total[1m])`                                  |
| P95 Latency        | `histogram_quantile(0.95, rate(shardleak_request_duration_seconds_bucket[1m]))` |
| P99 Latency        | `histogram_quantile(0.99, rate(shardleak_request_duration_seconds_bucket[1m]))` |
| Redis Errors / min | `increase(shardleak_redis_errors_total[1m])`                         |
| DB Errors / min    | `increase(shardleak_db_errors_total[1m])`                            |

## Testing

```bash
cd backend

# All tests (unit + integration — requires running Docker services)
go test ./...

# With race detector
go test -race ./...
```

Integration tests skip automatically if PostgreSQL or Redis are unreachable.

### Load Test (requires k6)

```bash
# First create an API key from the dashboard, then:
k6 run --env API_KEY=sk_shard_... tests/load/rate_limit.js

# Concurrency correctness: 1000 VUs, limit=100 → ~100 allowed
k6 run --env API_KEY=sk_shard_... --env SCENARIO=concurrency tests/load/rate_limit.js
```

## CI

GitHub Actions runs on every push and PR:

1. `gofmt` — formatting check
2. `go vet` — static analysis
3. `go test ./...` — unit + integration tests (with real Redis + PostgreSQL services)
4. `go test -race ./...` — race detector
5. `npm ci && npm run build` — frontend build
6. `docker build` — image build verification

## Deployment

| Component  | Target                    |
|------------|---------------------------|
| Frontend   | Vercel (zero-config)      |
| Go API     | Railway (Dockerfile)      |
| PostgreSQL | Railway / Supabase / Neon |
| Redis      | Railway / Upstash         |

Production environment variables (set in your deployment platform):

```
PORT=8080
DATABASE_URL=<production-postgres-url>
REDIS_URL=<production-redis-url>
JWT_SECRET=<strong-random-secret>
CORS_ORIGIN=https://your-frontend.vercel.app
```

## Security

- Passwords hashed with **bcrypt** (cost 10)
- API keys hashed with **SHA-256** before storage; plaintext shown once
- JWT HS256, 24h expiry, secret from environment variable
- CORS configured explicitly; no wildcard origins in production
- All inputs validated at API boundaries
- Rate-limit counters stored only in Redis, never PostgreSQL
- Redis unavailable → **fail closed** (503), never silently allow traffic

## Engineering Contract

See [`CLAUDE.md`](CLAUDE.md) for the full architecture and development contract.
