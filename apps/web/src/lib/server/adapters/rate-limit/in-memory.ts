import type { RateLimiter, RateLimitResult } from "../../ports/rate-limiter";

export class InMemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter(
      (t) => t > windowStart,
    );

    if (timestamps.length >= this.limit) {
      this.hits.set(key, timestamps);
      return {
        allowed: false,
        retryAfterMs: timestamps[0] + this.windowMs - now,
      };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return { allowed: true, retryAfterMs: 0 };
  }

  async reset(key: string): Promise<void> {
    this.hits.delete(key);
  }

  sweep(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.hits) {
      const fresh = timestamps.filter((t) => now - t < this.windowMs);
      if (fresh.length === 0) {
        this.hits.delete(key);
      } else if (fresh.length !== timestamps.length) {
        this.hits.set(key, fresh);
      }
    }
  }

  get size(): number {
    return this.hits.size;
  }
}
