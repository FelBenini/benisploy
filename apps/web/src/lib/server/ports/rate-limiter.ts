export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface RateLimiter {
  consume(key: string): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}
