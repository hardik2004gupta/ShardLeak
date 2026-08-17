/**
 * ShardLeak k6 load test — POST /api/v1/check
 *
 * Usage:
 *   k6 run --env API_KEY=sk_shard_... tests/load/rate_limit.js
 *
 * Concurrency correctness scenario:
 *   k6 run --env API_KEY=sk_shard_... --env SCENARIO=concurrency tests/load/rate_limit.js
 *   Expected: exactly 100 requests allowed, remainder rejected.
 */

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const API_URL = __ENV.API_URL || 'http://localhost:8082';
const API_KEY = __ENV.API_KEY || '';
const SCENARIO = __ENV.SCENARIO || 'load';

const allowedCount = new Counter('allowed_requests');
const rejectedCount = new Counter('rejected_requests');

// Load test: 100 VUs over 30 seconds across 10 identifiers
const loadOptions = {
  vus: 100,
  duration: '30s',
};

// Concurrency correctness: 1000 VUs, single shared identifier, limit=100
const concurrencyOptions = {
  vus: 1000,
  iterations: 1000,
};

export const options = SCENARIO === 'concurrency' ? concurrencyOptions : loadOptions;

function identifier() {
  if (SCENARIO === 'concurrency') {
    return 'concurrency-test:shared';
  }
  return `load-test:user-${__VU % 10}`;
}

export default function () {
  const payload = JSON.stringify({
    identifier: identifier(),
    limit: 100,
    window_seconds: 60,
    algorithm: 'token_bucket',
  });

  const res = http.post(`${API_URL}/api/v1/check`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
  });

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'has allowed field': (r) => {
      try {
        return JSON.parse(r.body).allowed !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (ok) {
    const body = JSON.parse(res.body);
    if (body.allowed) {
      allowedCount.add(1);
    } else {
      rejectedCount.add(1);
    }
  }
}

export function handleSummary(data) {
  const allowed = data.metrics['allowed_requests']
    ? data.metrics['allowed_requests'].values.count
    : 0;
  const rejected = data.metrics['rejected_requests']
    ? data.metrics['rejected_requests'].values.count
    : 0;

  if (SCENARIO === 'concurrency') {
    console.log(`\nConcurrency correctness check:`);
    console.log(`  Allowed:  ${allowed}  (expected ~100)`);
    console.log(`  Rejected: ${rejected}  (expected ~900)`);
    if (allowed > 110 || allowed < 90) {
      console.log('  FAIL: allowed count is outside acceptable range');
    } else {
      console.log('  PASS: atomicity holds under concurrent load');
    }
  }

  return {};
}
