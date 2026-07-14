import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InMemoryRateLimiter } from "./in-memory";

describe("InMemoryRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows attempts up to the limit", async () => {
    const limiter = new InMemoryRateLimiter(3, 60_000);

    expect((await limiter.consume("k")).allowed).toBe(true);
    expect((await limiter.consume("k")).allowed).toBe(true);
    expect((await limiter.consume("k")).allowed).toBe(true);
  });

  it("denies the attempt that exceeds the limit", async () => {
    const limiter = new InMemoryRateLimiter(3, 60_000);

    await limiter.consume("k");
    await limiter.consume("k");
    await limiter.consume("k");

    const fourth = await limiter.consume("k");
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks distinct keys independently", async () => {
    const limiter = new InMemoryRateLimiter(1, 60_000);

    expect((await limiter.consume("a")).allowed).toBe(true);
    expect((await limiter.consume("a")).allowed).toBe(false);
    // "b" has never been attempted — its own budget is untouched.
    expect((await limiter.consume("b")).allowed).toBe(true);
  });

  it("allows attempts again once the window has fully rolled over", async () => {
    const limiter = new InMemoryRateLimiter(1, 60_000);

    expect((await limiter.consume("k")).allowed).toBe(true);
    expect((await limiter.consume("k")).allowed).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect((await limiter.consume("k")).allowed).toBe(true);
  });

  it("does not allow a burst of 2x limit across a window boundary", async () => {
    // The classic fixed-window bug: limit=2 attempts right before the
    // window rolls over, then 2 more right after, should NOT both succeed
    // — a sliding window only allows 2 in ANY 60s span.
    const limiter = new InMemoryRateLimiter(2, 60_000);

    expect((await limiter.consume("k")).allowed).toBe(true);
    vi.advanceTimersByTime(59_000);
    expect((await limiter.consume("k")).allowed).toBe(true);

    // 2ms later — still well within 60s of the first attempt.
    vi.advanceTimersByTime(2);
    expect((await limiter.consume("k")).allowed).toBe(false);
  });

  it("reset clears the counter for a key", async () => {
    const limiter = new InMemoryRateLimiter(1, 60_000);

    await limiter.consume("k");
    expect((await limiter.consume("k")).allowed).toBe(false);

    await limiter.reset("k");
    expect((await limiter.consume("k")).allowed).toBe(true);
  });

  it("reset does not affect other keys", async () => {
    const limiter = new InMemoryRateLimiter(1, 60_000);

    await limiter.consume("a");
    await limiter.consume("b");

    await limiter.reset("a");

    expect((await limiter.consume("a")).allowed).toBe(true);
    expect((await limiter.consume("b")).allowed).toBe(false);
  });

  it("sweep drops keys with no timestamps left in the window", async () => {
    const limiter = new InMemoryRateLimiter(5, 60_000);

    await limiter.consume("stale");
    expect(limiter.size).toBe(1);

    vi.advanceTimersByTime(60_001);
    limiter.sweep();

    expect(limiter.size).toBe(0);
  });

  it("sweep keeps keys that still have timestamps in the window", async () => {
    const limiter = new InMemoryRateLimiter(5, 60_000);

    await limiter.consume("k");
    vi.advanceTimersByTime(30_000);
    await limiter.consume("k");
    vi.advanceTimersByTime(30_001); // first timestamp now stale, second isn't

    limiter.sweep();

    expect(limiter.size).toBe(1);
  });
});
