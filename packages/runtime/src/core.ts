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

/** True once the lesson has reached a final-looking state. */
function isFinished(status: LessonStatus): boolean {
  return status !== 'incomplete';
}

/**
 * Decides whether a status change is sent on. Merely starting or visiting
 * must never undo a finished lesson, and a plain "completed" must not erase a
 * pass or fail. A pass or fail, though, is always sent, including a fail after
 * an earlier pass: the system that records the result decides which attempt
 * counts, so the content reports what happened.
 */
function shouldSend(current: LessonStatus | null, next: LessonStatus): boolean {
  if (current === null) {
    return true;
  }
  if (next === 'incomplete') {
    return !isFinished(current);
  }
  if (next === 'completed') {
    return current === 'incomplete' || current === 'completed';
  }
  return true;
}

/**
 * Wraps an adapter with the rules every standard shares: init once, never
 * un-finish a finished lesson, clamp progress and track session time.
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
    if (!shouldSend(currentStatus, status)) {
      return ok();
    }
    const result: Result<null> = adapter.setStatus(status);
    if (result.ok) {
      currentStatus = status;
    }
    return result;
  }

  function terminateNow(): Result<null> {
    const active: Result<null> = requireActive('terminate');
    if (!active.ok) {
      return active;
    }
    terminated = true;
    return adapter.terminate(Math.max(0, (now() - startedAt) / 1000));
  }

  function begin(result: Result<InitialState>): Result<InitialState> {
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
  }

  return {
    adapterName: adapter.name,
    init(): Result<InitialState> {
      if (initialized) {
        return fail('init() was already called');
      }
      if (adapter.initializeAsync !== undefined) {
        return fail(
          `the ${adapter.name} adapter starts asynchronously; use start() instead of init()`
        );
      }
      return begin(adapter.initialize());
    },
    async start(): Promise<Result<InitialState>> {
      if (initialized) {
        return fail('start() was already called');
      }
      if (adapter.initializeAsync === undefined) {
        return begin(adapter.initialize());
      }
      return begin(await adapter.initializeAsync());
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
    async exit(): Promise<Result<null>> {
      if (!terminated) {
        const ended: Result<null> = terminateNow();
        if (!ended.ok) {
          return ended;
        }
      }
      return adapter.finish === undefined ? ok() : adapter.finish();
    },
    terminate: terminateNow,
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
