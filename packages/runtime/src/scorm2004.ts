import { findApi, type ApiWindow } from './apiSearch.js';
import {
  fail,
  ok,
  type InitialState,
  type LessonStatus,
  type Result,
  type RuntimeAdapter,
  type Score,
} from './types.js';

/** The API object a SCORM 2004 LMS exposes as `window.API_1484_11`. */
export interface Scorm2004Api {
  Initialize(parameter: string): string | boolean;
  Terminate(parameter: string): string | boolean;
  GetValue(element: string): string;
  SetValue(element: string, value: string): string | boolean;
  Commit(parameter: string): string | boolean;
  GetLastError(): string | number;
  GetErrorString(errorCode: string): string;
  GetDiagnostic(errorCode: string): string;
}

/** Smallest permitted maximums in the SCORM 2004 4th Edition data model. */
const SUSPEND_DATA_LIMIT = 64000;
const LOCATION_LIMIT = 1000;

/**
 * Finds `window.API_1484_11` in this window, its parents, then its opener (the
 * order the SCORM 2004 run-time specification describes). Cross-origin frames
 * that throw on access are skipped.
 */
export function findScorm2004Api(start: ApiWindow): Scorm2004Api | null {
  return findApi(start, (host: ApiWindow) => host.API_1484_11);
}

/**
 * Formats seconds as the ISO 8601 duration SCORM 2004 expects for
 * `cmi.session_time`, for example `PT1H2M3.45S`.
 */
export function formatIsoDuration(totalSeconds: number): string {
  const hundredths: number = Math.round(Math.max(0, totalSeconds) * 100);
  const hours: number = Math.floor(hundredths / 360000);
  const minutes: number = Math.floor((hundredths % 360000) / 6000);
  const seconds: number = (hundredths % 6000) / 100;
  return `PT${hours}H${minutes}M${seconds.toFixed(2)}S`;
}

/** A decimal with at most seven fractional digits, as the data model allows. */
function formatReal(value: number): string {
  return String(Number(value.toFixed(7)));
}

function isTrue(value: string | boolean): boolean {
  return value === true || String(value) === 'true';
}

/**
 * Reads the two SCORM 2004 status elements as one lesson status. A recorded
 * pass or fail wins over completion, as in SCORM 1.2.
 */
function readStatus(
  completionStatus: string,
  successStatus: string
): LessonStatus | null {
  if (successStatus === 'passed') {
    return 'passed';
  }
  if (successStatus === 'failed') {
    return 'failed';
  }
  if (completionStatus === 'completed') {
    return 'completed';
  }
  if (completionStatus === 'incomplete') {
    return 'incomplete';
  }
  return null;
}

/** Adapter that speaks the SCORM 2004 run-time API. */
export function createScorm2004Adapter(api: Scorm2004Api): RuntimeAdapter {
  let lastStatus: LessonStatus | null = null;

  function describeError(action: string): string {
    const code: string = String(api.GetLastError());
    let message = '';
    try {
      message = api.GetErrorString(code);
      const diagnostic: string = api.GetDiagnostic(code);
      if (diagnostic !== '') {
        message = `${message} (${diagnostic})`;
      }
    } catch {
      message = message === '' ? 'no error text available' : message;
    }
    return `SCORM 2004 ${action} failed with error ${code}: ${message}`;
  }

  function setValue(element: string, value: string): Result<null> {
    return isTrue(api.SetValue(element, value))
      ? ok()
      : fail(describeError(`SetValue('${element}')`));
  }

  function commit(): Result<null> {
    return isTrue(api.Commit('')) ? ok() : fail(describeError('Commit'));
  }

  function setAndCommit(element: string, value: string): Result<null> {
    const written: Result<null> = setValue(element, value);
    return written.ok ? commit() : written;
  }

  function setStatusPair(
    completionStatus: string,
    successStatus: string | null
  ): Result<null> {
    const completion: Result<null> = setValue(
      'cmi.completion_status',
      completionStatus
    );
    if (!completion.ok) {
      return completion;
    }
    if (successStatus !== null) {
      const success: Result<null> = setValue(
        'cmi.success_status',
        successStatus
      );
      if (!success.ok) {
        return success;
      }
    }
    return commit();
  }

  return {
    name: 'scorm2004',
    initialize(): Result<InitialState> {
      if (!isTrue(api.Initialize(''))) {
        return fail(describeError('Initialize'));
      }
      const status: LessonStatus | null = readStatus(
        api.GetValue('cmi.completion_status'),
        api.GetValue('cmi.success_status')
      );
      lastStatus = status;
      const location: string = api.GetValue('cmi.location');
      const suspendData: string = api.GetValue('cmi.suspend_data');
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
          `SCORM 2004 cmi.location holds at most ${LOCATION_LIMIT} characters, got ${location.length}`
        );
      }
      return setAndCommit('cmi.location', location);
    },
    setSuspendData(suspendData: string): Result<null> {
      if (suspendData.length > SUSPEND_DATA_LIMIT) {
        return fail(
          `SCORM 2004 suspend_data holds at most ${SUSPEND_DATA_LIMIT} characters, got ${suspendData.length}`
        );
      }
      return setAndCommit('cmi.suspend_data', suspendData);
    },
    setProgress(measure: number): Result<null> {
      return setAndCommit('cmi.progress_measure', formatReal(measure));
    },
    setScore(score: Score): Result<null> {
      const range: number = score.max - score.min;
      const entries: [string, string][] = [
        ['cmi.score.min', formatReal(score.min)],
        ['cmi.score.max', formatReal(score.max)],
        ['cmi.score.raw', formatReal(score.raw)],
      ];
      if (range > 0) {
        // The scaled score runs from -1 to 1 and is what most LMSs read.
        const scaled: number = (score.raw - score.min) / range;
        entries.push([
          'cmi.score.scaled',
          formatReal(Math.min(1, Math.max(-1, scaled))),
        ]);
      }
      for (const [element, value] of entries) {
        const written: Result<null> = setValue(element, value);
        if (!written.ok) {
          return written;
        }
      }
      return commit();
    },
    setStatus(status: LessonStatus): Result<null> {
      lastStatus = status;
      switch (status) {
        case 'passed':
          return setStatusPair('completed', 'passed');
        case 'failed':
          // A failed attempt is not a completed one: the learner may retry.
          return setStatusPair('incomplete', 'failed');
        case 'completed':
          return setStatusPair('completed', null);
        case 'incomplete':
          return setStatusPair('incomplete', null);
      }
    },
    terminate(sessionSeconds: number): Result<null> {
      const finished: boolean =
        lastStatus === 'completed' ||
        lastStatus === 'passed' ||
        lastStatus === 'failed';
      // As in SCORM 1.2: suspend an unfinished attempt so the learner resumes;
      // leave the exit value empty once finished.
      const steps: Result<null>[] = [
        setValue('cmi.session_time', formatIsoDuration(sessionSeconds)),
        setValue('cmi.exit', finished ? '' : 'suspend'),
      ];
      const failedStep: Result<null> | undefined = steps.find(
        (step: Result<null>): boolean => !step.ok
      );
      const committed: Result<null> = commit();
      const terminated: Result<null> = isTrue(api.Terminate(''))
        ? ok()
        : fail(describeError('Terminate'));
      return failedStep ?? (committed.ok ? terminated : committed);
    },
  };
}
