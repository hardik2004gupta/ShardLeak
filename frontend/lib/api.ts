import type {
  User,
  APIKeyMeta,
  APIKeyCreated,
  LimitConfig,
  CheckRequest,
  CheckResult,
} from '@/types/api';
import { getToken } from './auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8082';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  overrideToken?: string
): Promise<T> {
  const token = overrideToken ?? getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(res.status, 'PARSE_ERROR', 'Server returned an unexpected response');
  }

  if (!res.ok) {
    const e = (body as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(
      res.status,
      e?.code ?? 'UNKNOWN',
      e?.message ?? `Request failed with status ${res.status}`
    );
  }

  return body as T;
}

export const api = {
  auth: {
    signup(email: string, password: string) {
      return request<User>('/api/v1/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    },
    login(email: string, password: string) {
      return request<{ token: string }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    },
    me() {
      return request<User>('/api/v1/auth/me');
    },
  },

  apiKeys: {
    list() {
      return request<{ api_keys: APIKeyMeta[] }>('/api/v1/api-keys');
    },
    create(name: string) {
      return request<APIKeyCreated>('/api/v1/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    },
    revoke(id: string) {
      return request<{ status: string }>(`/api/v1/api-keys/${id}`, {
        method: 'DELETE',
      });
    },
  },

  limits: {
    list() {
      return request<{ configs: LimitConfig[] }>('/api/v1/limits');
    },
    create(data: CheckRequest) {
      return request<LimitConfig>('/api/v1/limits', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    delete(identifier: string) {
      return request<{ status: string }>(
        `/api/v1/limits/${encodeURIComponent(identifier)}`,
        { method: 'DELETE' }
      );
    },
  },

  check: {
    execute(apiKey: string, data: CheckRequest) {
      return request<CheckResult>(
        '/api/v1/check',
        { method: 'POST', body: JSON.stringify(data) },
        apiKey
      );
    },
  },
};
