/** A result callers must check; the runtime never throws into course code. */
export type Result<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: string };

export type LessonStatus = 'incomplete' | 'completed' | 'passed' | 'failed';

/** What the LMS remembers from an earlier session. */
export interface InitialState {
  readonly location: string | null;
  readonly suspendData: string | null;
  readonly status: LessonStatus | null;
}

export interface Score {
  readonly raw: number;
  readonly min: number;
  readonly max: number;
}

/** One way of talking to an LMS (SCORM 1.2 API, postMessage, ...). */
export interface RuntimeAdapter {
  readonly name: string;
  initialize(): Result<InitialState>;
  /**
   * Set by adapters that must talk to a server before the content can start
   * (xAPI reads the saved state from the LRS). When present, `start()` uses it
   * and `initialize()` is not used.
   */
  initializeAsync?(): Promise<Result<InitialState>>;
  setLocation(location: string): Result<null>;
  setSuspendData(suspendData: string): Result<null>;
  setProgress(measure: number): Result<null>;
  setScore(score: Score): Result<null>;
  setStatus(status: LessonStatus): Result<null>;
  terminate(sessionSeconds: number): Result<null>;
  /**
   * Set by adapters that have more to do once the attempt has ended (cmi5
   * waits for its last statements to be sent, then redirects the learner).
   */
  finish?(): Promise<Result<null>>;
}

/** The single API course content uses; it never calls a standard directly. */
export interface ContentRuntime {
  readonly adapterName: string;
  /** Starts synchronously. Fails for adapters that need `start()`. */
  init(): Result<InitialState>;
  /**
   * Starts the attempt and waits for the LMS when the standard needs a round
   * trip (xAPI). Works for every adapter; content should prefer it.
   */
  start(): Promise<Result<InitialState>>;
  setLocation(location: string): Result<null>;
  setSuspendData(suspendData: string): Result<null>;
  /** Progress from 0 to 1. Values outside the range are clamped. */
  setProgress(measure: number): Result<null>;
  setScore(score: Score): Result<null>;
  complete(): Result<null>;
  pass(): Result<null>;
  fail(): Result<null>;
  terminate(): Result<null>;
  /**
   * Ends the attempt on purpose (an "Exit" button): terminates if that has
   * not happened yet, then lets the adapter finish (cmi5 redirects the learner).
   */
  exit(): Promise<Result<null>>;
}

export function ok(): Result<null> {
  return { ok: true, value: null };
}

export function fail(error: string): Result<never> {
  return { ok: false, error };
}
