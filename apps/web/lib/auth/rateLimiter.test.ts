import { describe, expect, test } from 'bun:test';
import { createRateLimiter } from './rateLimiter';

describe('rate limiter', () => {
  test('allows attempts until the limit, then says how long to wait', () => {
    let now = 0;
    const limiter = createRateLimiter({
      maxFailures: 3,
      windowMs: 60_000,
      now: () => now,
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(limiter.retryAfterSeconds('a')).toBe(0);
      limiter.recordFailure('a');
    }
    expect(limiter.retryAfterSeconds('a')).toBe(60);
    now = 30_000;
    expect(limiter.retryAfterSeconds('a')).toBe(30);
  });

  test('forgets failures after the window and keeps keys apart', () => {
    let now = 0;
    const limiter = createRateLimiter({
      maxFailures: 1,
      windowMs: 1000,
      now: () => now,
    });
    limiter.recordFailure('a');
    expect(limiter.retryAfterSeconds('a')).toBe(1);
    expect(limiter.retryAfterSeconds('b')).toBe(0);
    now = 1001;
    expect(limiter.retryAfterSeconds('a')).toBe(0);
  });

  test('reset clears a key, and the number of keys is capped', () => {
    const limiter = createRateLimiter({
      maxFailures: 1,
      windowMs: 60_000,
      maxKeys: 2,
    });
    limiter.recordFailure('a');
    limiter.reset('a');
    expect(limiter.retryAfterSeconds('a')).toBe(0);
    limiter.recordFailure('x');
    limiter.recordFailure('y');
    limiter.recordFailure('z');
    expect(limiter.retryAfterSeconds('x')).toBe(0);
    expect(limiter.retryAfterSeconds('z')).toBeGreaterThan(0);
  });
});
