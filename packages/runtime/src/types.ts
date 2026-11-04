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
  setLocation(location: string): Result<null>;
  setSuspendData(suspendData: string): Result<null>;
  setProgress(measure: number): Result<null>;
  setScore(score: Score): Result<null>;
  setStatus(status: LessonStatus): Result<null>;
  terminate(sessionSeconds: number): Result<null>;
}

/** The single API course content uses; it never calls a standard directly. */
export interface ContentRuntime {
  readonly adapterName: string;
  init(): Result<InitialState>;
  setLocation(location: string): Result<null>;
  setSuspendData(suspendData: string): Result<null>;
  /** Progress from 0 to 1. Values outside the range are clamped. */
  setProgress(measure: number): Result<null>;
  setScore(score: Score): Result<null>;
  complete(): Result<null>;
  pass(): Result<null>;
  fail(): Result<null>;
  terminate(): Result<null>;
}

export function ok(): Result<null> {
  return { ok: true, value: null };
}

export function fail(error: string): Result<never> {
  return { ok: false, error };
}
