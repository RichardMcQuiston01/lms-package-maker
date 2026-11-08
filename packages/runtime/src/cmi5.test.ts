import { describe, expect, test } from 'bun:test';
import {
  createCmi5Adapter,
  parseCmi5Launch,
  parseLaunchData,
  type Cmi5Content,
  type Cmi5Launch,
} from './cmi5.js';
import { createRuntime } from './core.js';
import { selectAdapter } from './select.js';
import type { XapiEnvironment } from './xapiTransport.js';

const ACTOR = {
  objectType: 'Agent',
  account: { homePage: 'https://lms.example.com', name: 'learner-1' },
};
const REGISTRATION = '760e3480-ba55-4991-94b0-01820dbd23a2';
const ACTIVITY = 'https://lms.example.com/aus/1';
const LAUNCH: Cmi5Launch = {
  endpoint: 'https://lrs.example.com/xapi',
  fetchUrl: 'https://lms.example.com/fetch?k=1',
  actor: ACTOR,
  registration: REGISTRATION,
  activityId: ACTIVITY,
};
const CONTENT: Cmi5Content = { name: 'Demo', language: 'en' };
const SESSION = 'https://w3id.org/xapi/cmi5/context/extensions/sessionid';
const CMI5 = 'https://w3id.org/xapi/cmi5/context/categories/cmi5';
const MOVEON = 'https://w3id.org/xapi/cmi5/context/categories/moveon';
const MASTERY = 'https://w3id.org/xapi/cmi5/context/extensions/masteryscore';

interface Call {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: any;
}

interface Options {
  launchData?: Record<string, unknown> | null;
  launchStatus?: number;
  fetchAnswer?: unknown;
  state?: unknown;
}

/** A fake LMS and LRS in one: serves the fetch address, state and statements. */
function fake(options: Options = {}) {
  const calls: Call[] = [];
  let counter = 0;
  let minutes = 0;
  const launchData =
    options.launchData === undefined
      ? {
          contextTemplate: {
            contextActivities: {
              grouping: [{ id: 'urn:publisher:au-1' }],
            },
            extensions: { [SESSION]: 'session-1' },
          },
          launchMode: 'Normal',
          masteryScore: 0.75,
          moveOn: 'Passed',
        }
      : options.launchData;
  const environment: XapiEnvironment = {
    fetch: async (url, init) => {
      calls.push({
        method: init.method,
        url,
        headers: init.headers,
        body: init.body === undefined ? undefined : JSON.parse(init.body),
      });
      const reply = (status: number, body: unknown) => ({
        status,
        ok: status >= 200 && status < 300,
        text: async () =>
          typeof body === 'string' ? body : JSON.stringify(body),
      });
      if (url.startsWith('https://lms.example.com/fetch')) {
        return reply(200, options.fetchAnswer ?? { 'auth-token': 'dG9rZW4=' });
      }
      if (init.method === 'GET' && url.includes('stateId=LMS.LaunchData')) {
        return launchData === null
          ? reply(options.launchStatus ?? 404, '')
          : reply(200, launchData);
      }
      if (init.method === 'GET' && url.includes('stateId=lms-package-maker')) {
        return options.state === undefined
          ? reply(404, '')
          : reply(200, options.state);
      }
      if (init.method === 'GET') {
        return reply(404, '');
      }
      return reply(204, '');
    },
    now: () => new Date(Date.UTC(2026, 0, 2, 3, minutes++, 0)),
    newId: () =>
      `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  };
  const statements = (): any[] =>
    calls.filter((c) => c.url.endsWith('/statements')).map((c) => c.body);
  const verbs = (): string[] =>
    statements().map((s) => String(s.verb.id).split('/').at(-1) ?? '');
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 12; i += 1) {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  return { calls, environment, statements, verbs, flush };
}

async function started(
  options: Options = {},
  redirect: (url: string) => void = () => {}
) {
  const lms = fake(options);
  const runtime = createRuntime(
    createCmi5Adapter(LAUNCH, CONTENT, lms.environment, redirect)
  );
  const result = await runtime.start();
  await lms.flush();
  return { lms, runtime, result };
}

describe('parseCmi5Launch', () => {
  const query = (params: Record<string, string>): string =>
    `?${new URLSearchParams(params).toString()}`;
  const full = {
    endpoint: 'https://lrs.example.com/xapi/',
    fetch: 'https://lms.example.com/fetch?k=1',
    actor: JSON.stringify(ACTOR),
    registration: REGISTRATION,
    activityId: ACTIVITY,
  };

  test('reads the five launch parameters', () => {
    expect(parseCmi5Launch(query(full))).toEqual({
      ok: true,
      value: { ...LAUNCH, endpoint: 'https://lrs.example.com/xapi' },
    });
  });

  test('without a fetch address this is not a cmi5 launch', () => {
    expect(parseCmi5Launch('')).toEqual({ ok: true, value: null });
    expect(parseCmi5Launch(query({ endpoint: full.endpoint }))).toEqual({
      ok: true,
      value: null,
    });
  });

  test('names what is missing or wrong', () => {
    const messages: string[] = [
      query({ fetch: full.fetch }),
      query({ ...full, endpoint: 'not a url' }),
      query({ ...full, fetch: 'ftp://x.test/f' }),
      query({ ...full, actor: '{oops' }),
      query({ ...full, actor: '[1]' }),
      query({ ...full, activityId: 'no scheme' }),
    ].map((search) => {
      const result = parseCmi5Launch(search);
      return result.ok ? 'ok' : result.error;
    });
    expect(messages[0]).toContain(
      "'endpoint', 'actor', 'registration', 'activityId'"
    );
    expect(messages[1]).toContain("'endpoint' is not a valid address");
    expect(messages[2]).toContain('must start with http');
    expect(messages[3]).toContain('not valid JSON');
    expect(messages[4]).toContain('must be a JSON object');
    expect(messages[5]).toContain('must be an IRI');
  });
});

describe('parseLaunchData', () => {
  test('needs a context template and a sane mastery score', () => {
    expect(parseLaunchData('nope').ok).toBe(false);
    expect(parseLaunchData('{}').ok).toBe(false);
    const bad = parseLaunchData(
      JSON.stringify({ contextTemplate: {}, masteryScore: 2 })
    );
    expect(!bad.ok && bad.error).toContain('masteryScore');
    const mode = parseLaunchData(
      JSON.stringify({ contextTemplate: {}, launchMode: 'Odd' })
    );
    expect(!mode.ok && mode.error).toContain('launchMode');
  });

  test('defaults to Normal mode and reads the return address', () => {
    const parsed = parseLaunchData(
      JSON.stringify({
        contextTemplate: { a: 1 },
        returnURL: 'https://lms.example.com/back',
      })
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        contextTemplate: { a: 1 },
        launchMode: 'Normal',
        masteryScore: null,
        returnUrl: 'https://lms.example.com/back',
      },
    });
  });
});

describe('cmi5 start-up', () => {
  test('gets a token, reads launch data, preferences and state, then initializes', async () => {
    const { lms, result } = await started();
    expect(result.ok).toBe(true);
    const [token, launchData, preferences, state, initialized] = lms.calls;
    expect(token?.method).toBe('POST');
    expect(token?.url).toBe('https://lms.example.com/fetch?k=1');
    expect(token?.headers).toEqual({});
    // every LRS call after the fetch carries the token as Basic authorization
    for (const call of [launchData, preferences, state, initialized]) {
      expect(call?.headers['Authorization']).toBe('Basic dG9rZW4=');
      expect(call?.headers['X-Experience-API-Version']).toBe('1.0.3');
    }
    const launchUrl = new URL(launchData?.url ?? '');
    expect(launchUrl.searchParams.get('stateId')).toBe('LMS.LaunchData');
    expect(launchUrl.searchParams.get('activityId')).toBe(ACTIVITY);
    expect(launchUrl.searchParams.get('registration')).toBe(REGISTRATION);
    expect(JSON.parse(launchUrl.searchParams.get('agent') ?? '')).toEqual(
      ACTOR
    );
    const prefs = new URL(preferences?.url ?? '');
    expect(prefs.pathname).toBe('/xapi/agents/profile');
    expect(prefs.searchParams.get('profileId')).toBe('cmi5LearnerPreferences');
    expect(initialized?.url).toBe('https://lrs.example.com/xapi/statements');
  });

  test('the initialized statement is about the AU and carries the LMS context', async () => {
    const { lms } = await started();
    const [initialized] = lms.statements();
    expect(initialized).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      actor: ACTOR,
      verb: { id: 'http://adlnet.gov/expapi/verbs/initialized' },
      object: { objectType: 'Activity', id: ACTIVITY },
      context: {
        registration: REGISTRATION,
        extensions: { [SESSION]: 'session-1' },
        contextActivities: {
          grouping: [{ id: 'urn:publisher:au-1' }],
          category: [{ id: CMI5 }],
        },
      },
    });
    expect(initialized.timestamp).toMatch(/^2026-01-02T03:\d\d:00\.000Z$/);
  });

  test('resumes from the saved state', async () => {
    const { result } = await started({
      state: { location: 'p2', suspendData: 'v2;110;-;', status: 'incomplete' },
    });
    expect(result).toEqual({
      ok: true,
      value: { location: 'p2', suspendData: 'v2;110;-;', status: 'incomplete' },
    });
  });

  test('explains why it could not start', async () => {
    const refused = await started({
      fetchAnswer: {
        'error-code': '1',
        'error-text': 'The authorization token has already been returned.',
      },
    });
    expect(!refused.result.ok && refused.result.error).toContain(
      'already been returned'
    );
    expect(!refused.result.ok && refused.result.error).toContain('error 1');
    const noToken = await started({ fetchAnswer: { hello: 'world' } });
    expect(!noToken.result.ok && noToken.result.error).toContain(
      "'auth-token'"
    );
    const noData = await started({ launchData: null });
    expect(!noData.result.ok && noData.result.error).toContain(
      'LMS.LaunchData was not found'
    );
    const badData = await started({ launchData: { launchMode: 'Normal' } });
    expect(!badData.result.ok && badData.result.error).toContain(
      'contextTemplate'
    );
    // nothing is sent when it could not start
    expect(noData.lms.verbs()).toEqual([]);
  });
});

describe('cmi5 statements', () => {
  test('completed carries the moveOn category, completion and a duration, and no score', async () => {
    const { lms, runtime } = await started();
    runtime.setScore({ raw: 90, min: 0, max: 100 });
    runtime.complete();
    runtime.terminate();
    await lms.flush();
    const completed = lms
      .statements()
      .find((s) => s.verb.id.endsWith('/completed'));
    expect(completed.result).toEqual({
      completion: true,
      duration: expect.stringMatching(/^PT0H\d+M0\.00S$/),
    });
    expect(completed.context.contextActivities.category).toEqual(
      [
        { id: CMI5, objectType: 'Activity' },
        { id: MOVEON, objectType: 'Activity' },
      ].map((c) => expect.objectContaining(c))
    );
  });

  test('passed has success, a scaled score at or above the mastery score and the mastery extension', async () => {
    const { lms, runtime } = await started();
    runtime.setScore({ raw: 80, min: 0, max: 100 });
    runtime.pass();
    await lms.flush();
    const passed = lms.statements().find((s) => s.verb.id.endsWith('/passed'));
    expect(passed.result.success).toBe(true);
    expect(passed.result.completion).toBeUndefined();
    expect(passed.result.score).toEqual({
      raw: 80,
      min: 0,
      max: 100,
      scaled: 0.8,
    });
    expect(passed.result.duration).toMatch(/^PT/);
    expect(passed.context.extensions[MASTERY]).toBe(0.75);
    expect(passed.context.extensions[SESSION]).toBe('session-1');
    expect(passed.context.contextActivities.grouping).toEqual([
      { id: 'urn:publisher:au-1' },
    ]);
  });

  test('every attempt is on record as a scored statement without the cmi5 category', async () => {
    const { lms, runtime } = await started();
    runtime.setScore({ raw: 20, min: 0, max: 100 });
    runtime.fail();
    runtime.setScore({ raw: 90, min: 0, max: 100 });
    runtime.pass();
    runtime.setScore({ raw: 10, min: 0, max: 100 });
    runtime.fail();
    runtime.terminate();
    await lms.flush();
    const scored = lms
      .statements()
      .filter((s) => s.verb.id.endsWith('/scored'));
    expect(scored.map((s) => s.result.score.raw)).toEqual([20, 90, 10]);
    for (const statement of scored) {
      const categories = statement.context.contextActivities.category ?? [];
      expect(categories.map((c: any) => c.id)).not.toContain(CMI5);
      expect(statement.context.extensions[SESSION]).toBe('session-1');
    }
  });

  test('one passed or failed per session and never failed after passed', async () => {
    const { lms, runtime } = await started();
    runtime.setScore({ raw: 20, min: 0, max: 100 });
    runtime.fail();
    runtime.setScore({ raw: 90, min: 0, max: 100 });
    runtime.pass();
    runtime.setScore({ raw: 10, min: 0, max: 100 });
    runtime.fail();
    runtime.terminate();
    await lms.flush();
    expect(lms.verbs().filter((v) => v === 'passed' || v === 'failed')).toEqual(
      ['passed']
    );
    expect(lms.verbs().at(-1)).toBe('terminated');
    expect(lms.verbs().filter((v) => v === 'initialized')).toEqual([
      'initialized',
    ]);
  });

  test('a failure is sent when the session ends, with the time it happened, before terminated', async () => {
    const { lms, runtime } = await started();
    runtime.setScore({ raw: 20, min: 0, max: 100 });
    runtime.fail();
    runtime.setScore({ raw: 30, min: 0, max: 100 });
    runtime.fail();
    await lms.flush();
    expect(lms.verbs()).toEqual(['initialized', 'scored', 'scored']);
    runtime.terminate();
    await lms.flush();
    expect(lms.verbs()).toEqual([
      'initialized',
      'scored',
      'scored',
      'failed',
      'terminated',
    ]);
    const failed = lms.statements().find((s) => s.verb.id.endsWith('/failed'));
    const terminated = lms.statements().at(-1);
    expect(failed.result.success).toBe(false);
    expect(failed.result.score.raw).toBe(30);
    expect(failed.context.extensions[MASTERY]).toBe(0.75);
    expect(failed.timestamp <= terminated.timestamp).toBe(true);
    expect(terminated.result.duration).toMatch(/^PT/);
    expect(
      terminated.context.contextActivities.category.map((c: any) => c.id)
    ).toEqual([CMI5]);
  });

  test('a registration that already passed or completed does not repeat it', async () => {
    const { lms, runtime } = await started({
      state: { status: 'passed', passedSent: true, completedSent: true },
    });
    runtime.setScore({ raw: 90, min: 0, max: 100 });
    runtime.pass();
    runtime.complete();
    runtime.setScore({ raw: 10, min: 0, max: 100 });
    runtime.fail();
    runtime.terminate();
    await lms.flush();
    expect(lms.verbs()).toEqual([
      'initialized',
      'scored',
      'scored',
      'terminated',
    ]);
  });

  test('the sent flags are saved so a later session knows', async () => {
    const { lms, runtime } = await started();
    runtime.setScore({ raw: 90, min: 0, max: 100 });
    runtime.pass();
    await lms.flush();
    const saves = lms.calls.filter((c) => c.method === 'PUT');
    expect(saves.at(-1)?.body).toMatchObject({
      status: 'passed',
      passedSent: true,
    });
  });

  test('a score below the LMS mastery score is not called a pass', async () => {
    const { lms, runtime } = await started();
    runtime.setScore({ raw: 60, min: 0, max: 100 });
    runtime.pass(); // the content thought 60 was enough; the LMS says 75
    runtime.terminate();
    await lms.flush();
    expect(lms.verbs()).toEqual([
      'initialized',
      'scored',
      'failed',
      'terminated',
    ]);
  });

  test('Browse and Review modes send only initialized and terminated', async () => {
    for (const mode of ['Browse', 'Review']) {
      const { lms, runtime } = await started({
        launchData: { contextTemplate: {}, launchMode: mode, moveOn: 'Passed' },
      });
      runtime.setScore({ raw: 90, min: 0, max: 100 });
      runtime.pass();
      runtime.complete();
      runtime.terminate();
      await lms.flush();
      expect(lms.verbs()).toEqual(['initialized', 'terminated']);
      const saves = lms.calls.filter((c) => c.method === 'PUT');
      expect(saves.at(-1)?.body.passedSent).toBe(false);
    }
  });

  test('terminate sends one terminated statement however often it is called', async () => {
    const { lms, runtime } = await started();
    runtime.terminate();
    await runtime.exit();
    await lms.flush();
    expect(lms.verbs().filter((v) => v === 'terminated')).toHaveLength(1);
  });
});

describe('cmi5 exit', () => {
  test('waits for the statements, then goes to the return address', async () => {
    const visited: string[] = [];
    const { lms, runtime } = await started(
      {
        launchData: {
          contextTemplate: {},
          launchMode: 'Normal',
          returnURL: 'https://lms.example.com/back',
        },
      },
      (url) => visited.push(url)
    );
    const exited = await runtime.exit();
    expect(exited.ok).toBe(true);
    expect(lms.verbs().at(-1)).toBe('terminated');
    expect(visited).toEqual(['https://lms.example.com/back']);
  });

  test('without a return address it stays where it is', async () => {
    const visited: string[] = [];
    const { runtime } = await started({}, (url) => visited.push(url));
    await runtime.exit();
    expect(visited).toEqual([]);
  });
});

describe('cmi5 refused exit', () => {
  const RETURN: Record<string, unknown> = {
    contextTemplate: {},
    launchMode: 'Normal',
    returnURL: 'https://lms.example.com/back',
  };

  async function startedRefusing(refuseTerminated: boolean, visited: string[]) {
    const lms = fake({ launchData: RETURN });
    const environment: XapiEnvironment = {
      ...lms.environment,
      fetch: async (url, init) => {
        if (
          refuseTerminated &&
          init.method === 'POST' &&
          JSON.parse(init.body ?? '{}').verb?.id?.endsWith('/terminated')
        ) {
          return { status: 503, ok: false, text: async () => 'try later' };
        }
        return lms.environment.fetch(url, init);
      },
    };
    const runtime = createRuntime(
      createCmi5Adapter(LAUNCH, CONTENT, environment, (url: string): void => {
        visited.push(url);
      })
    );
    await runtime.start();
    return runtime;
  }

  test('reports a refused final statement every time and stays on the page', async () => {
    const visited: string[] = [];
    const original = console.error;
    console.error = (): void => undefined;
    try {
      const runtime = await startedRefusing(true, visited);
      const first = await runtime.exit();
      expect(!first.ok && first.error).toContain('503');
      expect(!first.ok && first.error).toContain('terminated');
      expect((await runtime.exit()).ok).toBe(false);
      expect(visited).toEqual([]);
    } finally {
      console.error = original;
    }
  });

  test('a failure earlier in the session is not blamed on the exit', async () => {
    const visited: string[] = [];
    const runtime = await startedRefusing(false, visited);
    expect((await runtime.exit()).ok).toBe(true);
    expect(visited).toEqual(['https://lms.example.com/back']);
  });
});

describe('selectAdapter for a cmi5 package', () => {
  const search = (params: Record<string, string>): string =>
    `?${new URLSearchParams(params).toString()}`;

  test('uses cmi5 when launched by an LMS, runs standalone otherwise', () => {
    const lms = fake();
    expect(
      selectAdapter({}, 'cmi5', undefined, {
        content: CONTENT,
        search: search({
          endpoint: LAUNCH.endpoint,
          fetch: LAUNCH.fetchUrl,
          actor: JSON.stringify(ACTOR),
          registration: REGISTRATION,
          activityId: ACTIVITY,
        }),
        environment: lms.environment,
      }).name
    ).toBe('cmi5');
    expect(
      selectAdapter({}, 'cmi5', undefined, { content: CONTENT, search: '' })
        .name
    ).toBe('standalone');
  });

  test('explains a broken launch when starting', async () => {
    const adapter = selectAdapter({}, 'cmi5', undefined, {
      content: CONTENT,
      search: search({ fetch: 'https://lms.example.com/f' }),
    });
    const result = await createRuntime(adapter).start();
    expect(!result.ok && result.error).toContain("no 'endpoint'");
  });
});
