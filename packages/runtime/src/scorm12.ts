import {
  fail,
  ok,
  type InitialState,
  type LessonStatus,
  type Result,
  type RuntimeAdapter,
  type Score,
} from './types.js';

/** The API object a SCORM 1.2 LMS exposes as `window.API`. */
export interface Scorm12Api {
  LMSInitialize(parameter: string): string | boolean;
  LMSFinish(parameter: string): string | boolean;
  LMSGetValue(element: string): string;
  LMSSetValue(element: string, value: string): string | boolean;
  LMSCommit(parameter: string): string | boolean;
  LMSGetLastError(): string | number;
  LMSGetErrorString(errorCode: string): string;
}

/** The part of `window` the API search walks. */
export interface ApiWindow {
  API?: Scorm12Api;
  parent?: ApiWindow | null;
  opener?: ApiWindow | null;
}

const MAX_SEARCH_DEPTH = 500;
const SUSPEND_DATA_LIMIT = 4096;
const LOCATION_LIMIT = 255;

function searchParents(start: ApiWindow): Scorm12Api | null {
  let current: ApiWindow = start;
  for (let depth = 0; depth < MAX_SEARCH_DEPTH; depth += 1) {
    // Reading any property of a cross-origin or sandboxed window can throw.
    try {
      if (current.API !== undefined && current.API !== null) {
        return current.API;
      }
      const next: ApiWindow | null | undefined = current.parent;
      if (next === undefined || next === null || next === current) {
        return null;
      }
      current = next;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Finds `window.API` in this window, its parents, then its opener (the order
 * the SCORM 1.2 run-time specification describes). Cross-origin frames that
 * throw on access are skipped.
 */
export function findScorm12Api(start: ApiWindow): Scorm12Api | null {
  const inParents: Scorm12Api | null = searchParents(start);
  if (inParents !== null) {
    return inParents;
  }
  let opener: ApiWindow | null | undefined;
  try {
    opener = start.opener;
  } catch {
    return null;
  }
  return opener !== undefined && opener !== null ? searchParents(opener) : null;
}

/** Formats seconds as the `HH:MM:SS.SS` timespan SCORM 1.2 expects. */
export function formatScormTimespan(totalSeconds: number): string {
  const hundredths: number = Math.round(Math.max(0, totalSeconds) * 100);
  const hours: number = Math.floor(hundredths / 360000);
  const minutes: number = Math.floor((hundredths % 360000) / 6000);
  const seconds: number = (hundredths % 6000) / 100;
  const pad = (value: number, width: number): string =>
    String(value).padStart(width, '0');
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${seconds.toFixed(2).padStart(5, '0')}`;
}

function isTrue(value: string | boolean): boolean {
  return value === true || String(value) === 'true';
}

const READABLE_STATUS: readonly string[] = [
  'incomplete',
  'completed',
  'passed',
  'failed',
];

/** Adapter that speaks the SCORM 1.2 run-time API. */
export function createScorm12Adapter(api: Scorm12Api): RuntimeAdapter {
  let lastStatus: LessonStatus | null = null;

  function describeError(action: string): string {
    const code: string = String(api.LMSGetLastError());
    let message = '';
    try {
      message = api.LMSGetErrorString(code);
    } catch {
      message = 'no error text available';
    }
    return `SCORM 1.2 ${action} failed with error ${code}: ${message}`;
  }

  function setValue(element: string, value: string): Result<null> {
    return isTrue(api.LMSSetValue(element, value))
      ? ok()
      : fail(describeError(`LMSSetValue('${element}')`));
  }

  function commit(): Result<null> {
    return isTrue(api.LMSCommit('')) ? ok() : fail(describeError('LMSCommit'));
  }

  function setAndCommit(element: string, value: string): Result<null> {
    const written: Result<null> = setValue(element, value);
    return written.ok ? commit() : written;
  }

  return {
    name: 'scorm12',
    initialize(): Result<InitialState> {
      if (!isTrue(api.LMSInitialize(''))) {
        return fail(describeError('LMSInitialize'));
      }
      const rawStatus: string = api.LMSGetValue('cmi.core.lesson_status');
      const status: LessonStatus | null = READABLE_STATUS.includes(rawStatus)
        ? (rawStatus as LessonStatus)
        : null;
      lastStatus = status;
      const location: string = api.LMSGetValue('cmi.core.lesson_location');
      const suspendData: string = api.LMSGetValue('cmi.suspend_data');
      return {
        ok: true,
        value: {
          location: location === '' ? null : location,
          suspendData: suspendData === '' ? null : suspendData,
          status,
        },
      };
    },
    setLocation(location: string): Result<null> {
      if (location.length > LOCATION_LIMIT) {
        return fail(
          `SCORM 1.2 lesson_location holds at most ${LOCATION_LIMIT} characters, got ${location.length}`
        );
      }
      return setAndCommit('cmi.core.lesson_location', location);
    },
    setSuspendData(suspendData: string): Result<null> {
      if (suspendData.length > SUSPEND_DATA_LIMIT) {
        return fail(
          `SCORM 1.2 suspend_data holds at most ${SUSPEND_DATA_LIMIT} characters, got ${suspendData.length}`
        );
      }
      return setAndCommit('cmi.suspend_data', suspendData);
    },
    // SCORM 1.2 has no progress measure; status carries completion.
    setProgress: ok,
    setScore(score: Score): Result<null> {
      for (const [element, value] of [
        ['cmi.core.score.min', score.min],
        ['cmi.core.score.max', score.max],
        ['cmi.core.score.raw', score.raw],
      ] as const) {
        const written: Result<null> = setValue(element, String(value));
        if (!written.ok) {
          return written;
        }
      }
      return commit();
    },
    setStatus(status: LessonStatus): Result<null> {
      lastStatus = status;
      return setAndCommit('cmi.core.lesson_status', status);
    },
    terminate(sessionSeconds: number): Result<null> {
      const finished: boolean =
        lastStatus === 'completed' ||
        lastStatus === 'passed' ||
        lastStatus === 'failed';
      const steps: Result<null>[] = [
        setValue('cmi.core.session_time', formatScormTimespan(sessionSeconds)),
        setValue('cmi.core.exit', finished ? '' : 'suspend'),
      ];
      const failedStep: Result<null> | undefined = steps.find(
        (step: Result<null>): boolean => !step.ok
      );
      const committed: Result<null> = commit();
      const finishedCall: Result<null> = isTrue(api.LMSFinish(''))
        ? ok()
        : fail(describeError('LMSFinish'));
      return failedStep ?? (committed.ok ? finishedCall : committed);
    },
  };
}
