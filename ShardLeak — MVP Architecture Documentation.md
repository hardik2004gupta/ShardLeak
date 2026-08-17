# ShardLeak
## Distributed Rate Limiting Service — MVP Architecture

**Project Type:** Backend / Distributed Systems / Infrastructure  
**Primary Goal:** Build a simple, production-style distributed rate-limiting service that demonstrates concurrency, atomic operations, caching, API design, testing, and observability.

---

# 1. Product Overview

ShardLeak is a lightweight distributed rate-limiting service that protects APIs from excessive requests.

A client sends a request containing an identifier such as:

```text
user:123
api-key:abc123
ip:192.168.1.1
```

ShardLeak determines whether the request should be:

```text
ALLOWED
```

or

```text
REJECTED
```

The rate-limit decision happens through Redis so multiple ShardLeak server instances can share the same rate-limit state.

PostgreSQL stores persistent configuration.

---

# 2. MVP Goals

The MVP should demonstrate:

- Distributed rate limiting
- Atomic concurrent request handling
- Redis-based shared state
- PostgreSQL configuration storage
- REST API design
- Authentication
- Basic observability
- Automated testing
- Docker-based local development
- Simple production deployment

The MVP should NOT attempt to become a full API-management platform.

---

# 3. Non-Goals

Do not implement these in the MVP:

- Multi-region deployment
- Kubernetes
- Kafka
- Microservices
- Redis Cluster
- Complex billing
- Team/organization management
- Advanced RBAC
- API gateway replacement
- Machine-learning-based traffic detection
- Complex event streaming
- Multiple databases
- Custom distributed consensus

The project should remain easy to explain in an interview.

---

# 4. High-Level Architecture

```text
                         ┌─────────────────┐
                         │     Client      │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   ShardLeak API │
                         │      Go         │
                         └────────┬────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
             ┌──────────────┐            ┌──────────────┐
             │    Redis     │            │ PostgreSQL   │
             │              │            │              │
             │ Rate State   │            │ Config       │
             │ Atomic Lua   │            │ Users        │
             │ Counters     │            │ API Keys     │
             └──────────────┘            └──────────────┘
                    │
                    │
                    ▼
             ┌──────────────┐
             │  Prometheus  │
             │   Metrics    │
             └──────┬───────┘
                    │
                    ▼
             ┌──────────────┐
             │   Grafana    │
             └──────────────┘
```

---

# 5. Technology Stack

## Backend

**Go**

Responsibilities:

- HTTP server
- REST API
- authentication
- rate-limit logic
- Redis communication
- PostgreSQL communication
- metrics
- error handling

Recommended libraries:

- Chi or Gin for HTTP routing
- pgx for PostgreSQL
- go-redis for Redis
- Prometheus Go client
- bcrypt/Argon2 for password hashing
- JWT or secure session tokens

Keep dependencies minimal.

---

# 6. Frontend

Use:

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui or a small custom component system
- Recharts for simple charts

The frontend is primarily a demonstration/control interface for the backend.

It should NOT contain rate-limiting logic.

---

# 7. Database Architecture

PostgreSQL is the persistent database.

It stores configuration and user information.

## Users

```text
users
-------------------------
id
email
password_hash
created_at
```

## Rate Limit Configurations

```text
rate_limit_configs
-------------------------
id
user_id
identifier
algorithm
limit
window_seconds
created_at
updated_at
```

## API Keys

```text
api_keys
-------------------------
id
user_id
key_hash
name
created_at
revoked_at
```

No rate-limit counters are stored in PostgreSQL.

Redis handles those.

---

# 8. Redis Architecture

Redis is the hot-path state store.

Example key:

```text
shardleak:rate:user:123
```

Redis contains temporary rate-limit state such as:

```text
tokens
last_refill
window_start
request_count
```

depending on the algorithm.

Keys should have TTLs so inactive identifiers automatically disappear.

---

# 9. Rate-Limiting Algorithms

The MVP implements three algorithms.

## 9.1 Fixed Window

Example:

```text
100 requests
per 60 seconds
```

Redis maintains:

```text
counter = 73
window = current minute
```

Simple and fast.

Tradeoff:

Requests can burst around window boundaries.

---

## 9.2 Sliding Window

Tracks requests within a moving time window.

Example:

```text
100 requests
during the previous 60 seconds
```

More accurate than Fixed Window but requires more Redis state.

Use Redis sorted sets if needed.

---

## 9.3 Token Bucket

Token Bucket should be the primary algorithm.

Example:

```text
Capacity:     100 tokens
Refill rate:  10 tokens/second
Request cost: 1 token
```

Requests consume tokens.

Tokens continuously refill over time.

This allows controlled bursts while maintaining an average rate.

---

# 10. Atomic Rate-Limit Decision

The most important engineering feature is atomicity.

Do NOT perform:

```text
GET
↓
calculate
↓
SET
```

as separate Redis operations.

Two concurrent requests could both observe the same state.

Instead:

```text
Request
   ↓
Redis Lua Script
   ↓
Read current state
   ↓
Calculate new state
   ↓
Check limit
   ↓
Update state
   ↓
Return result
```

The entire operation is atomic from the application's perspective.

This prevents race conditions across multiple ShardLeak instances.

---

# 11. Core API

## Check Rate Limit

```http
POST /api/v1/check
```

Request:

```json
{
  "identifier": "user:123",
  "limit": 100,
  "window_seconds": 60,
  "algorithm": "token_bucket"
}
```

Response:

```json
{
  "allowed": true,
  "remaining": 94,
  "reset_at": "2026-08-18T12:00:00Z",
  "retry_after": null
}
```

Rejected request:

```json
{
  "allowed": false,
  "remaining": 0,
  "reset_at": "2026-08-18T12:00:00Z",
  "retry_after": 7
}
```

---

# 12. Configuration API

## Create Limit

```http
POST /api/v1/limits
```

Example:

```json
{
  "identifier": "user:123",
  "algorithm": "token_bucket",
  "limit": 100,
  "window_seconds": 60
}
```

## Get Limit

```http
GET /api/v1/limits/:identifier
```

## Delete Limit

```http
DELETE /api/v1/limits/:identifier
```

---

# 13. Authentication API

Minimal authentication only.

## Sign Up

```http
POST /api/v1/auth/signup
```

## Sign In

```http
POST /api/v1/auth/login
```

## Current User

```http
GET /api/v1/auth/me
```

Authentication is required for dashboard/configuration APIs.

The public rate-limit check endpoint uses an API key.

---

# 14. API Key Model

A user creates an API key from the dashboard.

Example:

```text
sk_shard_7f83...
```

The plaintext key is shown only once.

Store only a hash in PostgreSQL.

Requests then use:

```http
Authorization: Bearer sk_shard_...
```

---

# 15. Request Flow

```text
Client
  │
  │ POST /api/v1/check
  ▼
ShardLeak API
  │
  ├── Authenticate API key
  │
  ├── Load rate-limit configuration
  │
  └── Execute Redis atomic operation
             │
             ▼
       ALLOWED / REJECTED
             │
             ▼
        HTTP Response
```

The normal request path should avoid PostgreSQL.

Configuration can be cached in memory or Redis if necessary.

For the MVP, keeping configuration reads simple is acceptable.

---

# 16. Response Headers

The API should return standard rate-limit information.

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 94
X-RateLimit-Reset: 1787054400
```

When rejected:

```http
Retry-After: 7
```

This makes ShardLeak feel like a real infrastructure component.

---

# 17. Error Handling

Use consistent errors.

Example:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "limit must be greater than zero"
  }
}
```

Basic error categories:

```text
400 INVALID_REQUEST
401 UNAUTHORIZED
403 FORBIDDEN
404 NOT_FOUND
409 CONFLICT
429 RATE_LIMITED
500 INTERNAL_ERROR
503 SERVICE_UNAVAILABLE
```

Do not create a complicated error framework.

---

# 18. Redis Failure Behavior

The MVP should have a clearly defined failure policy.

Default:

```text
Redis unavailable
       ↓
Cannot make reliable rate-limit decision
       ↓
Return 503
```

This is preferable to silently allowing unlimited traffic.

The behavior can be configurable later as:

```text
FAIL_OPEN
FAIL_CLOSED
```

But only one mode is required for the MVP.

---

# 19. PostgreSQL Failure Behavior

PostgreSQL is not required for every rate-limit request.

Therefore:

```text
Existing rate-limit configuration
        ↓
Redis continues operating
```

The service can continue serving existing configurations if configuration data has already been loaded.

Configuration-management operations should return:

```text
503 SERVICE_UNAVAILABLE
```

when PostgreSQL is unavailable.

---

# 20. Observability

Use Prometheus.

Core metrics:

```text
shardleak_requests_total
shardleak_allowed_total
shardleak_rejected_total
shardleak_request_duration_seconds
shardleak_redis_errors_total
shardleak_db_errors_total
```

Track:

- total requests
- allowed requests
- rejected requests
- latency
- Redis failures
- PostgreSQL failures

---

# 21. Grafana Dashboard

Keep the dashboard simple.

Display:

```text
Requests / sec
Allowed requests
Rejected requests
P95 latency
P99 latency
Redis errors
```

No need for dozens of charts.

---

# 22. Frontend Pages

## Home

Purpose:

Explain ShardLeak.

Sections:

1. Hero
2. Problem
3. How ShardLeak works
4. Algorithms
5. Performance
6. Architecture
7. CTA

Visual style:

- dark
- technical
- minimal
- cinematic
- subtle grid
- glowing infrastructure visualization
- monospace metrics

---

# 23. Sign In

Simple authentication screen.

Elements:

```text
ShardLeak logo

Welcome back

Email
Password

[ Sign In ]

Don't have an account?
Create account
```

No unnecessary authentication features in MVP.

---

# 24. Dashboard

Main overview.

Show:

```text
Total Requests
Allowed
Rejected
P95 Latency
```

Also show:

```text
Active Rate Limits
Recent Decisions
API Key
```

---

# 25. Request Playground

This is the most important frontend feature.

User selects:

```text
Identifier
Algorithm
Limit
Window
```

Then clicks:

```text
CHECK REQUEST
```

Show:

```text
ALLOWED
Remaining: 97
Latency: 2.1ms
Reset: 54s
```

Repeatedly clicking the button demonstrates the rate limiter visually.

When the limit is reached:

```text
RATE LIMITED
Retry after: 6s
```

This provides a strong live demonstration during interviews.

---

# 26. Project Structure

```text
shardleak/
│
├── backend/
│   ├── cmd/
│   │   └── server/
│   │       └── main.go
│   │
│   ├── internal/
│   │   ├── auth/
│   │   ├── ratelimit/
│   │   │   ├── fixed_window.go
│   │   │   ├── sliding_window.go
│   │   │   └── token_bucket.go
│   │   ├── redis/
│   │   ├── postgres/
│   │   ├── handlers/
│   │   └── middleware/
│   │
│   ├── migrations/
│   ├── tests/
│   ├── Dockerfile
│   └── go.mod
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── login/
│   │   └── dashboard/
│   │
│   ├── components/
│   ├── lib/
│   └── package.json
│
├── monitoring/
│   └── prometheus.yml
│
├── docker-compose.yml
├── README.md
└── .env.example
```

---

# 27. Local Development

Docker Compose runs:

```text
ShardLeak API
PostgreSQL
Redis
Prometheus
Grafana
```

One command:

```bash
docker compose up
```

The frontend can run separately during development.

---

# 28. Testing Strategy

## Unit Tests

Test:

- Fixed Window
- Sliding Window
- Token Bucket
- boundary conditions
- token refill
- rejection behavior

## Integration Tests

Test against real:

```text
Redis
PostgreSQL
```

Verify:

- API requests
- authentication
- configuration persistence
- Redis atomic operations

## Concurrency Test

Send many concurrent requests:

```text
1000 concurrent requests
limit = 100
```

Expected result:

```text
Approximately 100 allowed
Remaining rejected
```

The purpose is to demonstrate that concurrent requests do not bypass the limit.

---

# 29. Load Testing

Use a simple load-testing tool such as k6.

Measure:

```text
Requests/sec
p50
p95
p99
Error rate
```

Do not hard-code performance claims.

Only publish benchmark numbers obtained from your actual deployment.

---

# 30. Security Basics

Implement only essential security.

- Password hashing
- API key hashing
- Authentication middleware
- Input validation
- Request size limits
- Environment variables for secrets
- CORS configuration
- No secrets committed to Git
- HTTPS in production

Do not build an elaborate security platform.

---

# 31. Deployment

Simple production architecture:

```text
                 Internet
                    │
                    ▼
             ┌─────────────┐
             │  Frontend   │
             │   Vercel    │
             └──────┬──────┘
                    │
                    ▼
             ┌─────────────┐
             │ ShardLeak   │
             │   Go API    │
             └──────┬──────┘
                    │
             ┌──────┴──────┐
             ▼             ▼
          Redis        PostgreSQL
```

The backend can run on Railway or another container platform.

---

# 32. CI/CD

GitHub Actions should perform:

```text
Push
 │
 ├── go test
 ├── go vet
 ├── race detector
 ├── frontend build
 └── Docker build
```

Deployment can happen automatically after successful checks.

Keep CI/CD simple.

---

# 33. MVP Milestones

## Phase 1 — Backend Foundation

- Go server
- PostgreSQL connection
- Redis connection
- health endpoint
- configuration model

## Phase 2 — Rate Limiter

- Fixed Window
- Token Bucket
- Redis Lua script
- `/check` endpoint

## Phase 3 — Authentication

- signup
- login
- API keys
- authentication middleware

## Phase 4 — Frontend

- landing page
- sign in
- dashboard
- request playground

## Phase 5 — Observability

- Prometheus metrics
- Grafana dashboard
- request latency metrics

## Phase 6 — Testing & Deployment

- unit tests
- integration tests
- concurrency test
- load test
- Docker deployment

Sliding Window can be added after the core MVP is working.

---

# 34. What Makes ShardLeak Technically Interesting

The project should focus on five engineering concepts:

### 1. Concurrency

Many clients can request the same identifier simultaneously.

### 2. Atomicity

Redis Lua scripts ensure the rate-limit decision and state update happen atomically.

### 3. Distributed State

Multiple Go API instances share Redis state.

### 4. Performance

Rate-limit checks stay on the Redis hot path instead of querying PostgreSQL.

### 5. Correctness

The system must enforce the configured limit even under concurrent traffic.

These five concepts are enough for the MVP.

---

# 35. Interview Architecture Explanation

The entire project should be explainable in approximately one minute:

> ShardLeak is a distributed rate-limiting service written in Go. The API is stateless so multiple instances can run behind a load balancer. PostgreSQL stores users, API keys, and rate-limit configurations, while Redis stores the rapidly changing rate-limit state. The actual rate-limit decision is performed using an atomic Redis Lua script, which prevents race conditions when multiple instances process requests for the same identifier concurrently. Prometheus collects latency and request metrics, while Grafana provides a small operational dashboard.

That should be the core architecture story.

---

# 36. MVP Definition of Done

ShardLeak is considered complete when:

- Go API is running
- Redis is handling rate-limit state
- PostgreSQL stores configurations
- Token Bucket works correctly
- Fixed Window works correctly
- Redis operation is atomic
- Concurrent requests cannot bypass limits
- API keys authenticate requests
- Dashboard can create/view configurations
- Playground can execute real rate-limit checks
- Prometheus exposes metrics
- Grafana displays metrics
- Unit tests pass
- Integration tests pass
- Docker Compose starts the complete backend stack
- Production deployment works

Everything beyond this is optional.

---

# 37. Final Architecture Principle

The MVP follows one simple rule:

> **PostgreSQL stores what must persist. Redis stores what must be fast. Go coordinates the system.**

Avoid adding technology unless it directly helps demonstrate one of the project's core engineering problems.

**ShardLeak should be small enough to understand completely, but deep enough to discuss distributed systems, concurrency, atomicity, caching, performance, testing, and reliability in an SWE interview.**