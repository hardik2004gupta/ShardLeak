# ShardLeak

A lightweight distributed rate-limiting service. A client sends a request with an identifier
(`user:123`, `api-key:abc`, `ip:192.168.1.1`) and ShardLeak returns `ALLOWED` or `REJECTED`
based on a configured policy. Rate-limit state is shared across API instances through Redis,
so horizontal scaling works without coordination overhead.

## Architecture

```
Client
  └─▶ ShardLeak Go API (stateless)
            ├─▶ Redis       ← rate-limit state, atomic Lua decisions
            └─▶ PostgreSQL  ← users, API keys, configurations
```

**PostgreSQL stores what must persist. Redis stores what must be fast. Go coordinates the system.**

## Local Development

Requires Docker and Docker Compose.

```bash
docker compose up --build
```

This starts the Go API, PostgreSQL, and Redis. The API is available on port `8082`
(host ports are offset because other Docker projects occupy the standard ports).

## Health Checks

```
GET /health   →  200 if the process is alive
GET /ready    →  200 if PostgreSQL and Redis are reachable
                 503 if either dependency is unavailable
```

## Running the API Directly

Copy `.env.example` to `.env` and adjust values for your local setup:

```bash
cp .env.example .env
cd backend
go run ./cmd/server
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
# Allowed
curl -X POST http://localhost:8082/api/v1/check \
  -H "Content-Type: application/json" \
  -d '{"identifier":"user:123","limit":5,"window_seconds":60,"algorithm":"token_bucket"}'
```

```json
{"allowed":true,"remaining":4,"reset_at":"2026-08-18T12:01:00Z","retry_after":null}
```

```bash
# After 5 requests — rejected
```

```json
{"allowed":false,"remaining":0,"reset_at":"2026-08-18T12:01:00Z","retry_after":42}
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

# Current user
curl http://localhost:8082/api/v1/auth/me \
  -H "Authorization: Bearer eyJ..."
```

## API Keys

Create API keys from a JWT-authenticated session. The plaintext key is returned **only at creation** — it is never retrievable again.

```bash
# Create
curl -X POST http://localhost:8082/api/v1/api-keys \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production"}'
# → {"id":"...","name":"Production","key":"sk_shard_...","created_at":"..."}

# List (metadata only — no key or hash)
curl http://localhost:8082/api/v1/api-keys \
  -H "Authorization: Bearer <jwt>"

# Revoke
curl -X DELETE http://localhost:8082/api/v1/api-keys/<id> \
  -H "Authorization: Bearer <jwt>"
```

## Rate-Limit Configuration

Store named configurations in PostgreSQL. JWT required.

```bash
# Create a configuration
curl -X POST http://localhost:8082/api/v1/limits \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"user:123","algorithm":"token_bucket","limit":100,"window_seconds":60}'

# Get a configuration
curl http://localhost:8082/api/v1/limits/user:123 \
  -H "Authorization: Bearer <jwt>"

# Delete a configuration
curl -X DELETE http://localhost:8082/api/v1/limits/user:123 \
  -H "Authorization: Bearer <jwt>"
```

## Rate Limiting (authenticated)

`POST /api/v1/check` now requires an API key. The check body is unchanged.

```bash
curl -X POST http://localhost:8082/api/v1/check \
  -H "Authorization: Bearer sk_shard_..." \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user:123",
    "limit": 5,
    "window_seconds": 60,
    "algorithm": "token_bucket"
  }'
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

## Engineering Contract

See [`CLAUDE.md`](CLAUDE.md) for the full architecture and development contract.
