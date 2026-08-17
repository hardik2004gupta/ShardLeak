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

This starts:
- ShardLeak Go API on port `8080`
- PostgreSQL on port `5432`
- Redis on port `6379`

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

## Engineering Contract

See [`CLAUDE.md`](CLAUDE.md) for the full architecture and development contract.
