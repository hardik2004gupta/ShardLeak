# ShardLeak — Engineering Contract

## 1. Project Overview

ShardLeak is a lightweight distributed rate-limiting service written in Go. It determines whether an incoming request from a given identifier (`user:123`, `api-key:abc`, `ip:192.168.1.1`) should be **ALLOWED** or **REJECTED** based on a configured policy.

The core engineering challenge is that rate-limit state must be shared across multiple API instances. This requires atomic Redis operations, careful separation between fast-changing state (Redis) and persistent configuration (PostgreSQL), and correct handling of concurrent requests.

The MVP demonstrates five distributed-systems concepts in a small, self-contained service: concurrency, atomicity, distributed state, performance, and correctness. It is designed to be fully explainable in a one-minute interview answer and completely runnable with `docker compose up`.

ShardLeak exists to be a focused portfolio demonstration — not an API gateway, not a billing platform, not a microservices ecosystem.

---

## 2. Core Architecture

```
Client
  └─▶ ShardLeak Go API (stateless)
            ├─▶ Redis          ← rate-limit state, atomic Lua, counters, TTLs
            └─▶ PostgreSQL     ← users, API keys, rate-limit configurations
                    │
              Prometheus ─▶ Grafana
```

**The API must remain stateless.** Multiple instances can run simultaneously, sharing rate-limit state through Redis. No in-memory rate-limit state is kept in the Go process.

| Layer      | Role                                                          |
|------------|---------------------------------------------------------------|
| Go         | HTTP server, auth, routing, Redis/Postgres coordination       |
| Redis      | Hot-path rate-limit state; atomic Lua decision execution      |
| PostgreSQL | Persistent users, API keys, rate-limit configurations         |
| Prometheus | Metrics collection                                            |
| Grafana    | Operational visualization                                     |
| Next.js    | Frontend control/demo interface                               |

**Core principle: PostgreSQL stores what must persist. Redis stores what must be fast. Go coordinates the system.**

---

## 3. Technology Contract

### Backend
- **Go** — application language
- **Chi** — HTTP routing
- **pgx** — PostgreSQL driver
- **go-redis** — Redis client
- **Prometheus Go client** — metrics
- **bcrypt** — password hashing
- **JWT** — session tokens

### Frontend
- **Next.js** — framework
- **TypeScript** — language
- **Tailwind CSS** — styling
- **shadcn/ui** — component library where appropriate
- **Recharts** — charts where appropriate

### Infrastructure
- **PostgreSQL** — persistent database
- **Redis** — rate-limit state store
- **Prometheus** — metrics
- **Grafana** — dashboards
- **Docker Compose** — local development
- **GitHub Actions** — CI/CD

Do not introduce additional infrastructure unless there is a documented MVP requirement.

---

## 4. Architecture Principles

These are hard rules for all implementation phases:

1. Keep the MVP small.
2. Prefer simple, idiomatic implementations.
3. Avoid premature abstractions.
4. Avoid unnecessary dependencies.
5. PostgreSQL stores persistent data.
6. Redis stores fast-changing rate-limit state.
7. Go coordinates the system.
8. The rate-limit decision must be atomic.
9. Rate-limit counters must **never** be stored in PostgreSQL.
10. The frontend must never contain rate-limiting logic.
11. The normal rate-limit path should avoid unnecessary PostgreSQL queries.
12. Every feature must have a clear reason to exist.

---

## 5. Rate-Limiting Contract

### MVP Algorithms

**Token Bucket** — primary algorithm.

```
Capacity:     100 tokens
Refill rate:  10 tokens/second
Request cost: 1 token
```

Tokens refill continuously over time. Requests consume tokens. Allows controlled bursts while maintaining an average rate.

**Fixed Window** — secondary algorithm.

```
100 requests per 60-second window
```

Simple and fast. Known tradeoff: burst at window boundaries.

**Sliding Window is NOT part of the initial implementation.** Add it only if explicitly requested after the core MVP is complete.

### Atomicity Requirement

Rate-limit decisions **must** use an atomic Redis Lua operation.

**Never do this:**
```
GET → calculate → SET   (three separate Redis operations)
```

Two concurrent requests could read the same state before either writes back, allowing both to bypass the limit.

**Always do this:**
```
Request
  └─▶ Redis Lua Script
            ├── read current state
            ├── calculate new state
            ├── check limit
            ├── update state atomically
            └── return result
```

The entire read-modify-write is a single atomic operation. This is the most important correctness property in the system.

---

## 6. API Contract

### Authentication
| Method | Path                   | Auth     | Description        |
|--------|------------------------|----------|--------------------|
| POST   | `/api/v1/auth/signup`  | None     | Register user      |
| POST   | `/api/v1/auth/login`   | None     | Authenticate user  |
| GET    | `/api/v1/auth/me`      | JWT      | Current user info  |

### Rate Limiting
| Method | Path            | Auth    | Description             |
|--------|-----------------|---------|-------------------------|
| POST   | `/api/v1/check` | API Key | Execute rate-limit check|

### Rate-Limit Configuration
| Method | Path                          | Auth | Description               |
|--------|-------------------------------|------|---------------------------|
| POST   | `/api/v1/limits`              | JWT  | Create rate-limit config  |
| GET    | `/api/v1/limits/:identifier`  | JWT  | Get config for identifier |
| DELETE | `/api/v1/limits/:identifier`  | JWT  | Delete config             |

### API Key Authentication

Users create API keys from the dashboard. Format: `sk_shard_...`

```http
Authorization: Bearer sk_shard_7f83...
```

The plaintext key is shown once at creation. Only the hash is stored in PostgreSQL.

Do not invent additional API endpoints.

### Standard Response Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 94
X-RateLimit-Reset: 1787054400
Retry-After: 7          (on 429 responses only)
```

---

## 7. Data Ownership

### PostgreSQL owns:
- `users` — id, email, password_hash, created_at
- `rate_limit_configs` — id, user_id, identifier, algorithm, limit, window_seconds, created_at, updated_at
- `api_keys` — id, user_id, key_hash, name, created_at, revoked_at

### Redis owns:
- Token bucket state (tokens, last_refill)
- Fixed-window counters (counter, window_start)
- TTL-based cleanup of inactive identifiers

Key format: `shardleak:rate:<identifier>`

**Never store rate-limit counters in PostgreSQL.**

---

## 8. Security Rules

- Hash passwords with bcrypt before storage.
- Hash API keys before storage; never store plaintext.
- Show API key plaintext exactly once (at creation).
- All secrets come from environment variables.
- Never commit `.env` or secrets to Git.
- Validate all request inputs at API boundaries.
- Configure CORS explicitly.
- Apply reasonable request-size limits.
- HTTPS is required in production.

Do not build an elaborate security platform.

---

## 9. Error Handling

Standard error categories:

| Code | Constant             | Description                  |
|------|----------------------|------------------------------|
| 400  | `INVALID_REQUEST`    | Malformed input               |
| 401  | `UNAUTHORIZED`       | Missing or invalid auth       |
| 403  | `FORBIDDEN`          | Authenticated but not allowed |
| 404  | `NOT_FOUND`          | Resource does not exist       |
| 409  | `CONFLICT`           | Duplicate resource            |
| 429  | `RATE_LIMITED`       | Limit exceeded                |
| 500  | `INTERNAL_ERROR`     | Unexpected server error       |
| 503  | `SERVICE_UNAVAILABLE`| Dependency unavailable        |

Standard error JSON:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "limit must be greater than zero"
  }
}
```

Keep error handling simple. Do not build a complicated error framework.

---

## 10. Failure Behavior

### Redis Unavailable — Fail Closed

```
Redis unavailable
  └─▶ Cannot make a reliable rate-limit decision
        └─▶ Return 503 SERVICE_UNAVAILABLE
```

The MVP **fails closed**. Do not silently allow unlimited traffic when Redis is down.

### PostgreSQL Unavailable

PostgreSQL is not required on every rate-limit check request.

- Existing rate-limit operations (using Redis) may continue.
- Configuration-management operations (`/limits`, `/auth`) must return `503 SERVICE_UNAVAILABLE`.

---

## 11. Frontend Contract

### Home
Dark, technical, minimal, cinematic landing page. Sections: hero, problem statement, how it works, algorithms, performance, architecture, CTA. Use a subtle grid, infrastructure visualization, monospace metrics.

### Sign In
Simple authentication screen. No unnecessary auth features.

### Dashboard
Displays:
- Total Requests, Allowed, Rejected, P95 Latency
- Active Rate Limits
- Recent Decisions
- API Key management

### Request Playground
Primary interactive demo. User configures:
- Identifier, Algorithm, Limit, Window

On click, shows: `ALLOWED / RATE LIMITED`, remaining requests, latency, reset/retry info.

Repeatedly clicking visually demonstrates the rate limiter draining tokens or incrementing counters. This is the primary interview demonstration.

The frontend is a **control and demo interface only**. It must not implement rate-limiting logic.

---

## 12. Observability Contract

### Prometheus Metrics

| Metric                             | Description               |
|------------------------------------|---------------------------|
| `shardleak_requests_total`         | Total requests received   |
| `shardleak_allowed_total`          | Total allowed decisions   |
| `shardleak_rejected_total`         | Total rejected decisions  |
| `shardleak_request_duration_seconds` | Request latency histogram |
| `shardleak_redis_errors_total`     | Redis error count         |
| `shardleak_db_errors_total`        | PostgreSQL error count    |

### Grafana
Display: requests/sec, allowed, rejected, P95 latency, P99 latency, Redis errors. Keep the dashboard intentionally simple — no need for dozens of panels.

---

## 13. Testing Contract

### Unit Tests
- Token Bucket: token consumption, refill, capacity, rejection
- Fixed Window: counter increment, window reset, rejection at boundary
- Test boundary conditions explicitly

### Integration Tests
Test against real Redis and PostgreSQL:
- Full auth flow
- Rate-limit configuration persistence
- `/check` endpoint end-to-end
- Redis atomic Lua operations verified

### Concurrency Test
Send 1000 concurrent requests for the same identifier with limit=100.

**Expected:** approximately 100 allowed, remainder rejected.

This test is one of the project's most important technical demonstrations. It proves the Lua atomicity requirement holds under real concurrency pressure.

---

## 14. Development Contract

### Docker Compose Services
```
Go API
PostgreSQL
Redis
Prometheus
Grafana
```

Start everything with:
```bash
docker compose up
```

The frontend runs separately during development. Docker Compose handles the backend stack only.

---

## 15. Code Quality Rules

### Go
- Run `gofmt` before committing.
- Run `go vet` before committing.
- Run `go test ./...` before committing.
- Run with `-race` flag in CI.
- Keep functions small and focused.
- Prefer explicit code over excessive abstraction.
- Keep business logic separate from HTTP handlers.
- Keep Redis/database access isolated in dedicated packages.
- Validate inputs at API boundaries.
- Return clear, typed errors.
- Do not duplicate business logic.
- Do not add dependencies without justification.
- Do not create abstractions until they are genuinely needed.

### Frontend (TypeScript/Next.js)
- Keep components focused.
- Avoid unnecessary state management libraries.
- Isolate API communication in a small client layer.
- Do not duplicate backend logic in TypeScript.

---

## 16. Git / Repository Rules

- Never commit `.env` files.
- Never commit credentials, secrets, or API keys.
- Keep commits focused on a single logical change.
- Do not commit generated build artifacts.
- Keep README updated when developer-facing behavior changes.

---

## 17. Explicit Non-Goals

These are hard non-goals for the MVP. Stop and ask before implementing any of them:

- Multi-region deployment
- Kubernetes
- Kafka
- Microservices
- Redis Cluster
- Complex billing
- Team/organization management
- Advanced RBAC
- API gateway replacement
- ML-based traffic detection
- Complex event streaming
- Multiple databases
- Distributed consensus

---

## 18. Implementation Philosophy

ShardLeak should be:
- **Small enough** to understand completely
- **Deep enough** to demonstrate distributed systems
- **Easy to run** locally (`docker compose up`)
- **Easy to test** (unit, integration, concurrency)
- **Easy to explain** in an interview

The five engineering concepts are:
1. **Concurrency** — many clients hit the same identifier simultaneously
2. **Atomicity** — Lua scripts make the decision unbreakable
3. **Distributed state** — multiple API instances share Redis
4. **Performance** — rate-limit checks stay on the Redis hot path
5. **Correctness** — the limit holds even under concurrent load

Do not add complexity to appear sophisticated. Add complexity only when it serves one of these five concepts.

---

## 19. Phase-Based Development

Build in this order. Do not jump phases.

| Phase | Name                                   | Deliverable                                      |
|-------|----------------------------------------|--------------------------------------------------|
| 1     | Backend Foundation                     | Go server, DB connections, health endpoint        |
| 2     | Core Distributed Rate Limiter          | Token Bucket, Fixed Window, Lua script, `/check` |
| 3     | Authentication and Configuration       | signup, login, API keys, auth middleware, `/limits` |
| 4     | Frontend                               | landing page, sign in, dashboard, playground     |
| 5     | Observability, Testing, CI/CD, Deploy  | Prometheus, Grafana, unit/integration/concurrency tests, Docker, GitHub Actions |

Each phase must leave the project in a runnable, committable state.

---

## 20. Claude Code Behavior Rules

Before making changes:
- Read `CLAUDE.md` first.
- Read relevant existing code before modifying it.
- Preserve the established architecture.
- Do not rewrite working code without a clear reason.
- Do not introduce technologies outside the contract without asking.
- Do not over-engineer.
- Do not implement future-phase features early.
- Do not silently change API contracts, database schemas, or architectural decisions.
- If an architectural conflict is discovered, explain it before making a major change.
- Prefer the smallest implementation that satisfies the requirement.

When a phase is complete:
1. Run relevant tests (`go test ./...`, `go vet`, `gofmt`).
2. Verify the application starts cleanly.
3. Summarize what was implemented.
4. List any known limitations.
5. **Do not automatically begin the next phase.**

---

## 21. Definition of MVP Complete

The MVP is complete when the system can:

- [ ] Run the Go API
- [ ] Connect to Redis
- [ ] Connect to PostgreSQL
- [ ] Authenticate users (signup, login, JWT)
- [ ] Issue and validate API keys
- [ ] Create/read/delete rate-limit configurations
- [ ] Execute Token Bucket rate limiting atomically
- [ ] Execute Fixed Window rate limiting atomically
- [ ] Correctly handle 1000 concurrent requests without bypassing the configured limit
- [ ] Serve the Home page
- [ ] Serve the Dashboard with real metrics
- [ ] Serve the Request Playground with live rate-limit checks
- [ ] Expose Prometheus metrics on `/metrics`
- [ ] Display basic metrics in Grafana
- [ ] Pass all unit tests
- [ ] Pass all integration tests
- [ ] Pass the concurrency correctness test
- [ ] Start the complete backend stack with `docker compose up`
- [ ] Deploy to production

Everything beyond this checklist is optional.
