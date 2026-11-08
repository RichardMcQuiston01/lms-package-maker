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
import { scoreResult } from './xapi.js';
import {
  XapiTransport,
  type XapiConnection,
  type XapiEnvironment,
  type XapiResponse,
} from './xapiTransport.js';

const STATE_ID = 'lms-package-maker.state';
const LAUNCH_DATA_STATE_ID = 'LMS.LaunchData';
const PREFERENCES_PROFILE_ID = 'cmi5LearnerPreferences';
const VERB_BASE = 'http://adlnet.gov/expapi/verbs/';
const CMI5_CATEGORY = 'https://w3id.org/xapi/cmi5/context/categories/cmi5';
const MOVEON_CATEGORY = 'https://w3id.org/xapi/cmi5/context/categories/moveon';
const MASTERY_EXTENSION =
  'https://w3id.org/xapi/cmi5/context/extensions/masteryscore';

/** What the LMS passes to the AU's launch URL (cmi5 section 8.1). */
export interface Cmi5Launch {
  readonly endpoint: string;
  /** Address the AU POSTs to once, to get its authorization token. */
  readonly fetchUrl: string;
  readonly actor: Readonly<Record<string, unknown>>;
  readonly registration: string;
  /** The Activity id of this AU; every cmi5 defined statement is about it. */
  readonly activityId: string;
}

/** The course as the package knows it. */
export interface Cmi5Content {
  readonly name: string;
  readonly language: string;
}

type LaunchMode = 'Normal' | 'Browse' | 'Review';

/** The parts of the `LMS.LaunchData` state document the AU uses. */
interface LaunchData {
  readonly contextTemplate: Record<string, any>;
  readonly launchMode: LaunchMode;
  readonly masteryScore: number | null;
  readonly returnUrl: string | null;
}

function absoluteUrl(value: string, name: string): Result<string> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return fail(`cmi5 launch '${name}' is not a valid address: '${value}'`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return fail(
      `cmi5 launch '${name}' must start with http:// or https://, got '${parsed.protocol}'`
    );
  }
  return { ok: true, value };
}

/**
 * Reads the cmi5 launch parameters from a query string. Returns null when the
 * page was not launched with a `fetch` address (so it is not a cmi5 launch),
 * and an error naming the problem when the parameters are there but unusable.
 */
export function parseCmi5Launch(search: string): Result<Cmi5Launch | null> {
  const params: URLSearchParams = new URLSearchParams(search);
  const fetchUrl: string | null = params.get('fetch');
  if (fetchUrl === null || fetchUrl === '') {
    return { ok: true, value: null };
  }
  const missing: string[] = [
    'endpoint',
    'actor',
    'registration',
    'activityId',
  ].filter((name: string): boolean => (params.get(name) ?? '') === '');
  if (missing.length > 0) {
    return fail(
      `cmi5 launch has a 'fetch' address but no ${missing.map((name: string): string => `'${name}'`).join(', ')} parameter`
    );
  }
  const endpoint: Result<string> = absoluteUrl(
    params.get('endpoint') ?? '',
    'endpoint'
  );
  if (!endpoint.ok) {
    return endpoint;
  }
  const fetchAddress: Result<string> = absoluteUrl(fetchUrl, 'fetch');
  if (!fetchAddress.ok) {
    return fetchAddress;
  }
  let actor: unknown;
  try {
    actor = JSON.parse(params.get('actor') ?? '');
  } catch {
    return fail("cmi5 launch 'actor' is not valid JSON");
  }
  if (typeof actor !== 'object' || actor === null || Array.isArray(actor)) {
    return fail("cmi5 launch 'actor' must be a JSON object (an xAPI Agent)");
  }
  const activityId: string = params.get('activityId') ?? '';
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\S+$/.test(activityId)) {
    return fail(
      `cmi5 launch 'activityId' must be an IRI such as https://example.com/au/1, got '${activityId}'`
    );
  }
  return {
    ok: true,
    value: {
      endpoint: endpoint.value.replace(/\/+$/, ''),
      fetchUrl: fetchAddress.value,
      actor: actor as Record<string, unknown>,
      registration: params.get('registration') ?? '',
      activityId,
    },
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks the `LMS.LaunchData` document (cmi5 section 10). */
export function parseLaunchData(text: string): Result<LaunchData> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('cmi5 LMS.LaunchData is not valid JSON');
  }
  if (!isRecord(data) || !isRecord(data['contextTemplate'])) {
    return fail(
      'cmi5 LMS.LaunchData has no contextTemplate object, which every statement is built from'
    );
  }
  const mode: unknown = data['launchMode'] ?? 'Normal';
  if (mode !== 'Normal' && mode !== 'Browse' && mode !== 'Review') {
    return fail(
      `cmi5 LMS.LaunchData launchMode must be Normal, Browse or Review, got '${String(mode)}'`
    );
  }
  const mastery: unknown = data['masteryScore'];
  if (
    mastery !== undefined &&
    (typeof mastery !== 'number' || mastery < 0 || mastery > 1)
  ) {
    return fail(
      `cmi5 LMS.LaunchData masteryScore must be a number from 0 to 1, got '${String(mastery)}'`
    );
  }
  return {
    ok: true,
    value: {
      contextTemplate: data['contextTemplate'],
      launchMode: mode,
      masteryScore: typeof mastery === 'number' ? mastery : null,
      returnUrl:
        typeof data['returnURL'] === 'string' && data['returnURL'] !== ''
          ? data['returnURL']
          : null,
    },
  };
}

/** What this package keeps in the LRS between sessions of one registration. */
interface SavedState {
  location: string | null;
  suspendData: string | null;
  status: LessonStatus | null;
  progress: number | null;
  /** cmi5 allows one `completed` and one `passed` per registration. */
  completedSent: boolean;
  passedSent: boolean;
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
    completedSent: false,
    passedSent: false,
  };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return empty;
  }
  if (!isRecord(data)) {
    return empty;
  }
  return {
    location: typeof data['location'] === 'string' ? data['location'] : null,
    suspendData:
      typeof data['suspendData'] === 'string' ? data['suspendData'] : null,
    status: STATUSES.includes(String(data['status']))
      ? (data['status'] as LessonStatus)
      : null,
    progress: typeof data['progress'] === 'number' ? data['progress'] : null,
    completedSent: data['completedSent'] === true,
    passedSent: data['passedSent'] === true,
  };
}

/** How the AU leaves the page; tests replace it. */
export type Cmi5Redirect = (url: string) => void;

/**
 * Adapter for a cmi5 AU. It follows the cmi5 launch and statement rules:
 *
 * - It gets its authorization token from the `fetch` address, reads
 *   `LMS.LaunchData` and the learner preferences, then sends `initialized`.
 * - Every statement carries the LMS context template, the cmi5 category and
 *   (for `completed`, `passed`, `failed`) the moveOn category, with durations.
 * - `terminated` is the last statement of the session.
 * - In `Browse` and `Review` launch modes only `initialized` and `terminated`
 *   are sent.
 *
 * cmi5 allows one `completed` and one `passed` per registration, no `failed`
 * after a `passed`, and only one of `passed` or `failed` per session. So every
 * quiz attempt is still reported as it happens, as a `scored` statement, but
 * the cmi5 defined result is: `passed` the first time the learner passes, and
 * otherwise `failed` for the most recent attempt when the session ends.
 */
export function createCmi5Adapter(
  launch: Cmi5Launch,
  content: Cmi5Content,
  environment: XapiEnvironment,
  redirect: Cmi5Redirect
): RuntimeAdapter {
  const connection: XapiConnection = {
    endpoint: launch.endpoint,
    auth: null,
    actor: launch.actor,
    registration: launch.registration,
  };
  let transport: XapiTransport = new XapiTransport(connection, environment);
  let data: LaunchData | null = null;
  let initializedAt: Date | null = null;
  const saved: SavedState = readSavedState('');
  let lastScore: Score | null = null;
  let sessionPassed = false;
  let pendingFail: { at: Date; score: Score | null } | null = null;
  let terminated = false;
  let stateDirty = false;
  let stateQueued = false;

  const recording = (): boolean => data?.launchMode === 'Normal';

  function durationSince(at: Date): string {
    const started: Date = initializedAt ?? at;
    return formatIsoDuration(
      Math.max(0, (at.getTime() - started.getTime()) / 1000)
    );
  }

  /** The LMS context template plus what this kind of statement must add. */
  function buildContext(
    kind: 'defined' | 'moveOn' | 'allowed',
    withMastery: boolean
  ): Record<string, any> {
    const template: Record<string, any> = JSON.parse(
      JSON.stringify(data?.contextTemplate ?? {})
    );
    const activities: Record<string, any> = isRecord(
      template['contextActivities']
    )
      ? template['contextActivities']
      : {};
    const categories: Record<string, unknown>[] = Array.isArray(
      activities['category']
    )
      ? activities['category']
      : [];
    if (kind !== 'allowed') {
      categories.push({ id: CMI5_CATEGORY, objectType: 'Activity' });
    }
    if (kind === 'moveOn') {
      categories.push({ id: MOVEON_CATEGORY, objectType: 'Activity' });
    }
    template['contextActivities'] = { ...activities, category: categories };
    template['registration'] ??= launch.registration;
    if (withMastery && data?.masteryScore != null) {
      template['extensions'] = {
        ...(isRecord(template['extensions']) ? template['extensions'] : {}),
        [MASTERY_EXTENSION]: data.masteryScore,
      };
    }
    return template;
  }

  function send(
    verb: string,
    kind: 'defined' | 'moveOn' | 'allowed',
    result: Record<string, unknown> | null,
    at: Date,
    withMastery: boolean = false
  ): void {
    transport.postStatement(`'${verb}' statement`, {
      id: environment.newId(),
      actor: launch.actor,
      verb: { id: `${VERB_BASE}${verb}`, display: { 'en-US': verb } },
      object: { objectType: 'Activity', id: launch.activityId },
      ...(result === null ? {} : { result }),
      context: buildContext(kind, withMastery),
      timestamp: at.toISOString(),
    });
  }

  function saveState(): Result<null> {
    stateDirty = true;
    if (stateQueued) {
      return ok();
    }
    stateQueued = true;
    transport.enqueue('state save', async (): Promise<void> => {
      while (stateDirty) {
        stateDirty = false;
        const response: XapiResponse = await transport.request(
          'PUT',
          transport.stateUrl(STATE_ID, launch.activityId),
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

  async function startUp(): Promise<Result<InitialState>> {
    // 1. the one-time authorization token
    let token: string;
    try {
      const response: XapiResponse = await environment.fetch(launch.fetchUrl, {
        method: 'POST',
        headers: {},
        keepalive: false,
      });
      const body: unknown = JSON.parse(await response.text());
      if (isRecord(body) && typeof body['error-code'] !== 'undefined') {
        return fail(
          `cmi5 fetch address refused the launch: error ${String(body['error-code'])}: ${String(body['error-text'] ?? 'no text given')}`
        );
      }
      if (!isRecord(body) || typeof body['auth-token'] !== 'string') {
        return fail(
          `cmi5 fetch address answered ${response.status} without an 'auth-token'`
        );
      }
      token = body['auth-token'];
    } catch (cause: unknown) {
      const reason: string =
        cause instanceof Error ? cause.message : String(cause);
      return fail(
        `cmi5 could not get an authorization token from ${launch.fetchUrl}: ${reason}`
      );
    }
    transport = transport.withAuth(`Basic ${token}`);

    // 2. the launch data the LMS prepared
    try {
      const response: XapiResponse = await transport.request(
        'GET',
        transport.stateUrl(LAUNCH_DATA_STATE_ID, launch.activityId),
        undefined
      );
      if (response.status === 404) {
        return fail(
          'cmi5 LMS.LaunchData was not found: the LMS has to write it before it launches the AU'
        );
      }
      if (!response.ok) {
        return fail(
          `cmi5 could not read LMS.LaunchData: the LRS answered ${response.status}: ${await response.text()}`
        );
      }
      const parsed: Result<LaunchData> = parseLaunchData(await response.text());
      if (!parsed.ok) {
        return parsed;
      }
      data = parsed.value;
    } catch (cause: unknown) {
      const reason: string =
        cause instanceof Error ? cause.message : String(cause);
      return fail(
        `cmi5 could not reach the LRS at ${launch.endpoint}: ${reason}`
      );
    }

    // 3. the learner preferences (read as the spec requires; not used yet)
    try {
      await transport.request(
        'GET',
        transport.profileUrl(PREFERENCES_PROFILE_ID),
        undefined
      );
    } catch {
      // Preferences are optional; a failure here must not stop the course.
    }

    // 4. where this learner left off
    try {
      const response: XapiResponse = await transport.request(
        'GET',
        transport.stateUrl(STATE_ID, launch.activityId),
        undefined
      );
      if (response.ok) {
        Object.assign(saved, readSavedState(await response.text()));
      }
    } catch {
      // Starting from the beginning is better than not starting.
    }

    initializedAt = environment.now();
    send('initialized', 'defined', null, initializedAt);
    return {
      ok: true,
      value: {
        location: saved.location,
        suspendData: saved.suspendData,
        status: saved.status,
      },
    };
  }

  /** The verb a score earns when the LMS gave a mastery score. */
  function judged(status: 'passed' | 'failed'): 'passed' | 'failed' {
    const mastery: number | null = data?.masteryScore ?? null;
    if (mastery === null || lastScore === null) {
      return status;
    }
    const range: number = lastScore.max - lastScore.min;
    if (range <= 0) {
      return status;
    }
    const scaled: number = (lastScore.raw - lastScore.min) / range;
    return scaled >= mastery ? 'passed' : 'failed';
  }

  function resultFor(
    success: boolean | null,
    at: Date,
    completion: boolean
  ): Record<string, unknown> {
    return {
      ...(completion ? { completion: true } : {}),
      ...(success === null ? {} : { success }),
      ...(success !== null && lastScore !== null
        ? { score: scoreResult(lastScore) }
        : {}),
      duration: durationSince(at),
    };
  }

  function sendFailed(at: Date, score: Score | null): void {
    const previous: Score | null = lastScore;
    lastScore = score;
    send('failed', 'moveOn', resultFor(false, at, false), at, true);
    lastScore = previous;
  }

  return {
    name: 'cmi5',
    initialize: () =>
      fail('the cmi5 adapter starts asynchronously; use start()'),
    initializeAsync: startUp,
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
      if (recording()) {
        // An attempt is always on record, whatever cmi5 lets us call it.
        send(
          'scored',
          'allowed',
          { score: scoreResult(score) },
          environment.now()
        );
      }
      return ok();
    },
    setStatus(status: LessonStatus): Result<null> {
      saved.status = status;
      if (recording()) {
        const now: Date = environment.now();
        if (status === 'completed' && !saved.completedSent) {
          send('completed', 'moveOn', resultFor(null, now, true), now);
          saved.completedSent = true;
        } else if (status === 'passed' || status === 'failed') {
          if (judged(status) === 'passed') {
            if (!saved.passedSent && !sessionPassed) {
              send('passed', 'moveOn', resultFor(true, now, false), now, true);
              saved.passedSent = true;
              sessionPassed = true;
              pendingFail = null;
            }
          } else if (!saved.passedSent && !sessionPassed) {
            // Only one of passed/failed per session, and never failed after
            // passed: hold the latest failure until the session ends.
            pendingFail = { at: now, score: lastScore };
          }
        }
      }
      return saveState();
    },
    terminate(): Result<null> {
      if (terminated) {
        return ok();
      }
      terminated = true;
      transport.beginExit();
      const now: Date = environment.now();
      if (
        recording() &&
        pendingFail !== null &&
        !sessionPassed &&
        !saved.passedSent
      ) {
        sendFailed(pendingFail.at, pendingFail.score);
      }
      send('terminated', 'defined', { duration: durationSince(now) }, now);
      return ok();
    },
    async finish(): Promise<Result<null>> {
      await transport.drain();
      const failures: string[] = transport.exitFailures();
      if (failures.length > 0) {
        // Stay on the page so the learner can retry; leaving would hide it.
        return fail(
          `the LMS did not accept the last requests: ${failures.join('; ')}`
        );
      }
      if (data?.returnUrl != null) {
        redirect(data.returnUrl);
      }
      return ok();
    },
  };
}
