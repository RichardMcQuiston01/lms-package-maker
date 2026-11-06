/**
 * Counts failed attempts per key (such as an email or an address) inside a
 * sliding window. In memory, so it limits one server process; run a shared
 * store in front of several instances.
 */
export interface RateLimiter {
  /** Seconds to wait before trying again, or 0 when the key may try. */
  retryAfterSeconds(key: string): number;
  recordFailure(key: string): void;
  reset(key: string): void;
}

export interface RateLimiterOptions {
  readonly maxFailures: number;
  readonly windowMs: number;
  readonly now?: () => number;
  /** Keys kept at once; the oldest are dropped past this. */
  readonly maxKeys?: number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now: () => number = options.now ?? Date.now;
  const maxKeys: number = options.maxKeys ?? 10_000;
  const failures: Map<string, number[]> = new Map<string, number[]>();

  function recent(key: string): number[] {
    const cutoff: number = now() - options.windowMs;
    const kept: number[] = (failures.get(key) ?? []).filter(
      (at: number): boolean => at > cutoff
    );
    if (kept.length === 0) {
      failures.delete(key);
    } else {
      failures.set(key, kept);
    }
    return kept;
  }

  return {
    retryAfterSeconds(key: string): number {
      const kept: number[] = recent(key);
      if (kept.length < options.maxFailures) {
        return 0;
      }
      const oldest: number = kept[0] ?? now();
      return Math.max(1, Math.ceil((oldest + options.windowMs - now()) / 1000));
    },
    recordFailure(key: string): void {
      const kept: number[] = recent(key);
      kept.push(now());
      failures.set(key, kept);
      if (failures.size > maxKeys) {
        const oldestKey: string | undefined = failures.keys().next().value;
        if (oldestKey !== undefined) {
          failures.delete(oldestKey);
        }
      }
    },
    reset(key: string): void {
      failures.delete(key);
    },
  };
}
