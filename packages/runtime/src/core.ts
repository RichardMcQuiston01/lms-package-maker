import {
  fail,
  ok,
  type ContentRuntime,
  type InitialState,
  type LessonStatus,
  type Result,
  type RuntimeAdapter,
  type Score,
} from './types.js';

/** Higher rank wins: a finished lesson never goes back to incomplete. */
const STATUS_RANK: Readonly<Record<LessonStatus, number>> = {
  incomplete: 0,
  completed: 1,
  failed: 1,
  passed: 2,
};

/**
 * Wraps an adapter with the rules every standard shares: init once, never
 * regress a finished status, clamp progress and track session time.
 *
 * @param adapter - The LMS connection to use.
 * @param now - Clock in milliseconds, injectable for tests.
 */
export function createRuntime(
  adapter: RuntimeAdapter,
  now: () => number = Date.now
): ContentRuntime {
  let initialized = false;
  let terminated = false;
  let startedAt = 0;
  let currentStatus: LessonStatus | null = null;

  function requireActive(action: string): Result<null> {
    if (!initialized) {
      return fail(`cannot ${action}: init() has not succeeded yet`);
    }
    if (terminated) {
      return fail(`cannot ${action}: terminate() was already called`);
    }
    return ok();
  }

  function applyStatus(status: LessonStatus): Result<null> {
    const active: Result<null> = requireActive(`set status '${status}'`);
    if (!active.ok) {
      return active;
    }
    if (
      currentStatus !== null &&
      STATUS_RANK[status] < STATUS_RANK[currentStatus]
    ) {
      return ok();
    }
    const result: Result<null> = adapter.setStatus(status);
    if (result.ok) {
      currentStatus = status;
    }
    return result;
  }

  return {
    adapterName: adapter.name,
    init(): Result<InitialState> {
      if (initialized) {
        return fail('init() was already called');
      }
      const result: Result<InitialState> = adapter.initialize();
      if (!result.ok) {
        return result;
      }
      initialized = true;
      startedAt = now();
      currentStatus = result.value.status;
      if (currentStatus === null) {
        applyStatus('incomplete');
      }
      return result;
    },
    setLocation(location: string): Result<null> {
      const active: Result<null> = requireActive('set location');
      return active.ok ? adapter.setLocation(location) : active;
    },
    setSuspendData(suspendData: string): Result<null> {
      const active: Result<null> = requireActive('set suspend data');
      return active.ok ? adapter.setSuspendData(suspendData) : active;
    },
    setProgress(measure: number): Result<null> {
      const active: Result<null> = requireActive('set progress');
      if (!active.ok) {
        return active;
      }
      if (!Number.isFinite(measure)) {
        return fail(`progress must be a finite number, got ${measure}`);
      }
      return adapter.setProgress(Math.min(1, Math.max(0, measure)));
    },
    setScore(score: Score): Result<null> {
      const active: Result<null> = requireActive('set score');
      if (!active.ok) {
        return active;
      }
      if (
        !Number.isFinite(score.raw) ||
        !Number.isFinite(score.min) ||
        !Number.isFinite(score.max) ||
        score.min > score.max ||
        score.raw < score.min ||
        score.raw > score.max
      ) {
        return fail(
          `score must satisfy min <= raw <= max, got raw=${score.raw} min=${score.min} max=${score.max}`
        );
      }
      return adapter.setScore(score);
    },
    complete: (): Result<null> => applyStatus('completed'),
    pass: (): Result<null> => applyStatus('passed'),
    fail: (): Result<null> => applyStatus('failed'),
    terminate(): Result<null> {
      const active: Result<null> = requireActive('terminate');
      if (!active.ok) {
        return active;
      }
      terminated = true;
      return adapter.terminate(Math.max(0, (now() - startedAt) / 1000));
    },
  };
}

/** An adapter that accepts everything, so content also runs outside an LMS. */
export function createStandaloneAdapter(): RuntimeAdapter {
  return {
    name: 'standalone',
    initialize: (): Result<InitialState> => ({
      ok: true,
      value: { location: null, suspendData: null, status: null },
    }),
    setLocation: ok,
    setSuspendData: ok,
    setProgress: ok,
    setScore: ok,
    setStatus: ok,
    terminate: ok,
  };
}
