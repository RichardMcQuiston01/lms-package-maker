import { formatIsoDuration } from './scorm2004.js';
import {
  fail,
  ok,
  type InitialState,
  type LessonStatus,
  type Result,
  type RuntimeAdapter,
  type Score,
} from './types.js';

const XAPI_VERSION = '1.0.3';
const STATE_ID = 'lms-package-maker.state';
const VERB_BASE = 'http://adlnet.gov/expapi/verbs/';
const COURSE_TYPE = 'http://adlnet.gov/expapi/activities/course';
const PLATFORM = 'lms-package-maker';

/** What the LRS passes to the launch URL (the TinCan launch convention). */
export interface XapiLaunch {
  /** LRS base address without a trailing slash. */
  readonly endpoint: string;
  /** Full `Authorization` header value, or null when the LRS needs none. */
  readonly auth: string | null;
  /** The learner, as an xAPI Agent. */
  readonly actor: Readonly<Record<string, unknown>>;
  readonly registration: string | null;
}

/** The course as an xAPI Activity. */
export interface XapiContent {
  readonly activityId: string;
  readonly name: string;
  readonly language: string;
}

/** Browser services the adapter needs; tests replace them. */
export interface XapiEnvironment {
  readonly fetch: (
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      keepalive: boolean;
    }
  ) => Promise<{
    readonly status: number;
    readonly ok: boolean;
    text(): Promise<string>;
  }>;
  readonly now: () => Date;
  readonly newId: () => string;
}

/**
 * Reads the xAPI launch parameters from a query string. Returns null when the
 * page was not launched with an `endpoint` (so it is not an xAPI launch), and
 * an error when the parameters are there but unusable.
 */
export function parseXapiLaunch(search: string): Result<XapiLaunch | null> {
  const params: URLSearchParams = new URLSearchParams(search);
  const endpoint: string | null = params.get('endpoint');
  if (endpoint === null || endpoint === '') {
    return { ok: true, value: null };
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return fail(`xAPI launch 'endpoint' is not a valid address: '${endpoint}'`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return fail(
      `xAPI launch 'endpoint' must start with http:// or https://, got '${parsed.protocol}'`
    );
  }
  const actorText: string | null = params.get('actor');
  if (actorText === null || actorText === '') {
    return fail("xAPI launch has an 'endpoint' but no 'actor' parameter");
  }
  let actor: unknown;
  try {
    actor = JSON.parse(actorText);
  } catch {
    return fail("xAPI launch 'actor' is not valid JSON");
  }
  if (typeof actor !== 'object' || actor === null || Array.isArray(actor)) {
    return fail("xAPI launch 'actor' must be a JSON object (an xAPI Agent)");
  }
  const auth: string | null = params.get('auth');
  const registration: string | null = params.get('registration');
  return {
    ok: true,
    value: {
      endpoint: endpoint.replace(/\/+$/, ''),
      auth: auth === null || auth === '' ? null : auth,
      actor: actor as Record<string, unknown>,
      registration:
        registration === null || registration === '' ? null : registration,
    },
  };
}

/** What the saved state in the LRS holds. */
interface SavedState {
  location: string | null;
  suspendData: string | null;
  status: LessonStatus | null;
  progress: number | null;
}

const STATUSES: readonly string[] = [
  'incomplete',
  'completed',
  'passed',
  'failed',
];

function readSavedState(text: string): SavedState {
  const empty: SavedState = {
    location: null,
    suspendData: null,
    status: null,
    progress: null,
  };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return empty;
  }
  if (typeof data !== 'object' || data === null) {
    return empty;
  }
  const record = data as Record<string, unknown>;
  return {
    location:
      typeof record['location'] === 'string' ? record['location'] : null,
    suspendData:
      typeof record['suspendData'] === 'string' ? record['suspendData'] : null,
    status:
      typeof record['status'] === 'string' &&
      STATUSES.includes(record['status'])
        ? (record['status'] as LessonStatus)
        : null,
    progress:
      typeof record['progress'] === 'number' ? record['progress'] : null,
  };
}

/** A version 4 UUID, using the browser's generator when it has one. */
export function newUuid(): string {
  const generator: Crypto | undefined = globalThis.crypto;
  if (generator !== undefined && typeof generator.randomUUID === 'function') {
    return generator.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
    /[xy]/g,
    (symbol: string): string => {
      const random: number = Math.floor(Math.random() * 16);
      return (symbol === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    }
  );
}

/** The adapter for a launch that cannot work; it explains why on start. */
export function createUnavailableAdapter(
  name: string,
  reason: string
): RuntimeAdapter {
  return {
    name,
    initialize: () => fail(reason),
    setLocation: ok,
    setSuspendData: ok,
    setProgress: ok,
    setScore: ok,
    setStatus: ok,
    terminate: ok,
  };
}

/**
 * Adapter that speaks xAPI to a Learning Record Store. Statements go out in
 * order and without blocking the content: each call returns as soon as the
 * request is queued, and a failure is written to the console
 * (`[lms-package]`). Saved progress (location, suspend data, status) lives in
 * the LRS State API, so a learner resumes where they left off.
 */
export function createXapiAdapter(
  launch: XapiLaunch,
  content: XapiContent,
  environment: XapiEnvironment
): RuntimeAdapter {
  const saved: SavedState = {
    location: null,
    suspendData: null,
    status: null,
    progress: null,
  };
  let lastScore: Score | null = null;
  let queue: Promise<void> = Promise.resolve();
  let stateDirty = false;
  let stateQueued = false;

  const headers = (
    extra: Record<string, string> = {}
  ): Record<string, string> => ({
    'X-Experience-API-Version': XAPI_VERSION,
    ...(launch.auth === null ? {} : { Authorization: launch.auth }),
    ...extra,
  });

  function stateUrl(): string {
    const query: URLSearchParams = new URLSearchParams({
      stateId: STATE_ID,
      activityId: content.activityId,
      agent: JSON.stringify(launch.actor),
    });
    if (launch.registration !== null) {
      query.set('registration', launch.registration);
    }
    return `${launch.endpoint}/activities/state?${query.toString()}`;
  }

  function enqueue(label: string, send: () => Promise<void>): void {
    queue = queue.then(send).catch((cause: unknown): void => {
      const reason: string =
        cause instanceof Error ? cause.message : String(cause);
      console.error(`[lms-package] xAPI ${label} failed: ${reason}`);
    });
  }

  async function request(
    method: string,
    url: string,
    body: string | undefined
  ): Promise<{ status: number; ok: boolean; text(): Promise<string> }> {
    return environment.fetch(url, {
      method,
      headers: headers(
        body === undefined ? {} : { 'Content-Type': 'application/json' }
      ),
      ...(body === undefined ? {} : { body }),
      keepalive: true,
    });
  }

  function sendStatement(
    verb: string,
    result: Record<string, unknown> | null
  ): void {
    const statement: Record<string, unknown> = {
      id: environment.newId(),
      actor: launch.actor,
      verb: { id: `${VERB_BASE}${verb}` },
      object: {
        objectType: 'Activity',
        id: content.activityId,
        definition: {
          type: COURSE_TYPE,
          name: { [content.language]: content.name },
        },
      },
      ...(result === null ? {} : { result }),
      context: {
        platform: PLATFORM,
        ...(launch.registration === null
          ? {}
          : { registration: launch.registration }),
      },
      timestamp: environment.now().toISOString(),
    };
    enqueue(`'${verb}' statement`, async (): Promise<void> => {
      const response = await request(
        'POST',
        `${launch.endpoint}/statements`,
        JSON.stringify(statement)
      );
      if (!response.ok) {
        throw new Error(
          `the LRS answered ${response.status}: ${await response.text()}`
        );
      }
    });
  }

  function scoreResult(score: Score): Record<string, number> {
    const range: number = score.max - score.min;
    return {
      raw: score.raw,
      min: score.min,
      max: score.max,
      ...(range > 0
        ? {
            scaled: Math.min(
              1,
              Math.max(-1, Number(((score.raw - score.min) / range).toFixed(7)))
            ),
          }
        : {}),
    };
  }

  /** Writes the state document; changes made while a write runs are sent next. */
  function saveState(): Result<null> {
    stateDirty = true;
    if (stateQueued) {
      return ok();
    }
    stateQueued = true;
    enqueue('state save', async (): Promise<void> => {
      while (stateDirty) {
        stateDirty = false;
        const response = await request(
          'PUT',
          stateUrl(),
          JSON.stringify(saved)
        );
        if (!response.ok) {
          stateQueued = false;
          throw new Error(
            `the LRS answered ${response.status}: ${await response.text()}`
          );
        }
      }
      stateQueued = false;
    });
    return ok();
  }

  return {
    name: 'xapi',
    initialize: () =>
      fail('the xAPI adapter starts asynchronously; use start()'),
    async initializeAsync(): Promise<Result<InitialState>> {
      try {
        const response = await request('GET', stateUrl(), undefined);
        if (response.ok) {
          Object.assign(saved, readSavedState(await response.text()));
        } else if (response.status !== 404) {
          return fail(
            `xAPI could not read saved progress: the LRS answered ${response.status}: ${await response.text()}`
          );
        }
      } catch (cause: unknown) {
        const reason: string =
          cause instanceof Error ? cause.message : String(cause);
        return fail(
          `xAPI could not reach the LRS at ${launch.endpoint}: ${reason}`
        );
      }
      sendStatement('initialized', null);
      return {
        ok: true,
        value: {
          location: saved.location,
          suspendData: saved.suspendData,
          status: saved.status,
        },
      };
    },
    setLocation(location: string): Result<null> {
      saved.location = location;
      return saveState();
    },
    setSuspendData(suspendData: string): Result<null> {
      saved.suspendData = suspendData;
      return saveState();
    },
    setProgress(measure: number): Result<null> {
      saved.progress = measure;
      return saveState();
    },
    setScore(score: Score): Result<null> {
      lastScore = score;
      sendStatement('scored', { score: scoreResult(score) });
      return ok();
    },
    setStatus(status: LessonStatus): Result<null> {
      saved.status = status;
      const score: Record<string, unknown> =
        lastScore === null ? {} : { score: scoreResult(lastScore) };
      switch (status) {
        case 'incomplete':
          break;
        case 'completed':
          sendStatement('completed', { completion: true, ...score });
          break;
        case 'passed':
          sendStatement('passed', {
            completion: true,
            success: true,
            ...score,
          });
          break;
        case 'failed':
          sendStatement('failed', { success: false, ...score });
          break;
      }
      return saveState();
    },
    terminate(sessionSeconds: number): Result<null> {
      sendStatement('terminated', {
        duration: formatIsoDuration(sessionSeconds),
      });
      return ok();
    },
  };
}
