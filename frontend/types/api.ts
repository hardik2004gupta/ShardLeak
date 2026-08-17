export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface APIKeyMeta {
  id: string;
  name: string;
  created_at: string;
  revoked_at: string | null;
}

export interface APIKeyCreated extends APIKeyMeta {
  key: string;
}

export interface LimitConfig {
  identifier: string;
  algorithm: 'token_bucket' | 'fixed_window';
  limit: number;
  window_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface CheckRequest {
  identifier: string;
  algorithm: 'token_bucket' | 'fixed_window';
  limit: number;
  window_seconds: number;
}

export interface CheckResult {
  allowed: boolean;
  remaining: number;
  reset_at: string;
  retry_after: number | null;
}
