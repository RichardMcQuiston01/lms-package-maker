import { describe, expect, test } from 'bun:test';
import { createRuntime } from './core.js';
import { selectAdapter } from './select.js';
import {
  createXapiAdapter,
  parseXapiLaunch,
  type XapiContent,
  type XapiEnvironment,
  type XapiLaunch,
} from './xapi.js';

const ACTOR = {
  objectType: 'Agent',
  mbox: 'mailto:ada@example.com',
  name: 'Ada',
};
const LAUNCH: XapiLaunch = {
  endpoint: 'https://lrs.example.com/xapi',
  auth: 'Basic dGVzdDp0ZXN0',
  actor: ACTOR,
  registration: '11111111-1111-4111-8111-111111111111',
};
const CONTENT: XapiContent = {
  activityId: 'urn:lms-package-maker:course:demo',
  name: 'Demo',
  language: 'en',
};

interface Call {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly keepalive: boolean;
}

/** A fake LRS: records requests and serves a state document. */
function fakeLrs(options: { state?: unknown; stateStatus?: number } = {}) {
  const calls: Call[] = [];
  let counter = 0;
  const environment: XapiEnvironment = {
    fetch: async (url, init) => {
      calls.push({
        method: init.method,
        url,
        headers: init.headers,
        body: init.body === undefined ? undefined : JSON.parse(init.body),
        keepalive: init.keepalive,
      });
      if (init.method === 'GET') {
        const status: number =
          options.stateStatus ?? (options.state ? 200 : 404);
        return {
          status,
          ok: status >= 200 && status < 300,
          text: async () => JSON.stringify(options.state ?? ''),
        };
      }
      return { status: 204, ok: true, text: async () => '' };
    },
    now: () => new Date('2026-01-02T03:04:05.000Z'),
    newId: () =>
      `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  };
  const statements = (): Call[] =>
    calls.filter((c) => c.url.endsWith('/statements'));
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  return { calls, environment, statements, flush };
}

describe('parseXapiLaunch', () => {
  const query = (params: Record<string, string>): string =>
    `?${new URLSearchParams(params).toString()}`;

  test('reads the TinCan launch parameters', () => {
    const result = parseXapiLaunch(
      query({
        endpoint: 'https://lrs.example.com/xapi/',
        auth: 'Basic abc',
        actor: JSON.stringify(ACTOR),
        registration: 'r1',
      })
    );
    expect(result).toEqual({
      ok: true,
      value: {
        endpoint: 'https://lrs.example.com/xapi',
        auth: 'Basic abc',
        actor: ACTOR,
        registration: 'r1',
      },
    });
  });

  test('no endpoint means this is not an xAPI launch', () => {
    expect(parseXapiLaunch('')).toEqual({ ok: true, value: null });
    expect(parseXapiLaunch('?page=2')).toEqual({ ok: true, value: null });
  });

  test('auth and registration are optional', () => {
    const result = parseXapiLaunch(
      query({ endpoint: 'http://lrs.test/x', actor: JSON.stringify(ACTOR) })
    );
    expect(result.ok && result.value?.auth).toBeNull();
    expect(result.ok && result.value?.registration).toBeNull();
  });

  test('explains what is wrong with unusable parameters', () => {
    const messages: string[] = [
      query({ endpoint: 'not a url', actor: '{}' }),
      query({ endpoint: 'ftp://lrs.test/x', actor: '{}' }),
      query({ endpoint: 'https://lrs.test/x' }),
      query({ endpoint: 'https://lrs.test/x', actor: '{oops' }),
      query({ endpoint: 'https://lrs.test/x', actor: '[1]' }),
    ].map((search) => {
      const result = parseXapiLaunch(search);
      return result.ok ? 'ok' : result.error;
    });
    expect(messages[0]).toContain("'endpoint' is not a valid address");
    expect(messages[1]).toContain('must start with http');
    expect(messages[2]).toContain("no 'actor'");
    expect(messages[3]).toContain('not valid JSON');
    expect(messages[4]).toContain('must be a JSON object');
  });
});

describe('xapi adapter through the runtime', () => {
  test('starting reads saved state, then sends an initialized statement', async () => {
    const lrs = fakeLrs({
      state: { location: 'p2', suspendData: 'v2;110;-;', status: 'incomplete' },
    });
    const runtime = createRuntime(
      createXapiAdapter(LAUNCH, CONTENT, lrs.environment)
    );
    const started = await runtime.start();
    expect(started).toEqual({
      ok: true,
      value: { location: 'p2', suspendData: 'v2;110;-;', status: 'incomplete' },
    });
    await lrs.flush();
    const get = lrs.calls[0];
    expect(get?.method).toBe('GET');
    const url = new URL(get?.url ?? '');
    expect(url.pathname).toBe('/xapi/activities/state');
    expect(url.searchParams.get('stateId')).toBe('lms-package-maker.state');
    expect(url.searchParams.get('activityId')).toBe(CONTENT.activityId);
    expect(JSON.parse(url.searchParams.get('agent') ?? '')).toEqual(ACTOR);
    expect(url.searchParams.get('registration')).toBe(LAUNCH.registration);
    expect(get?.headers['Authorization']).toBe('Basic dGVzdDp0ZXN0');
    expect(get?.headers['X-Experience-API-Version']).toBe('1.0.3');

    const [initialized] = lrs.statements();
    expect(initialized?.body).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      actor: ACTOR,
      verb: { id: 'http://adlnet.gov/expapi/verbs/initialized' },
      object: {
        objectType: 'Activity',
        id: CONTENT.activityId,
        definition: {
          type: 'http://adlnet.gov/expapi/activities/course',
          name: { en: 'Demo' },
        },
      },
      context: {
        registration: LAUNCH.registration,
        platform: 'lms-package-maker',
      },
      timestamp: '2026-01-02T03:04:05.000Z',
    });
    expect(initialized?.headers['Content-Type']).toBe('application/json');
    expect(initialized?.keepalive).toBe(true);
  });

  test('a new learner starts empty and is marked incomplete', async () => {
    const lrs = fakeLrs();
    const runtime = createRuntime(
      createXapiAdapter(LAUNCH, CONTENT, lrs.environment)
    );
    expect(await runtime.start()).toEqual({
      ok: true,
      value: { location: null, suspendData: null, status: null },
    });
    await lrs.flush();
    const saves = lrs.calls.filter((c) => c.method === 'PUT');
    expect(saves.at(-1)?.body).toMatchObject({ status: 'incomplete' });
  });

  test('init() is refused: xAPI has to start asynchronously', () => {
    const runtime = createRuntime(
      createXapiAdapter(LAUNCH, CONTENT, fakeLrs().environment)
    );
    const result = runtime.init();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('start()');
    }
  });

  test('reports a pass with its score, then a fail, as each attempt happens', async () => {
    const lrs = fakeLrs();
    const runtime = createRuntime(
      createXapiAdapter(LAUNCH, CONTENT, lrs.environment)
    );
    await runtime.start();
    runtime.setScore({ raw: 80, min: 0, max: 100 });
    runtime.pass();
    runtime.setScore({ raw: 20, min: 0, max: 100 });
    runtime.fail();
    await lrs.flush();
    const verbs = lrs
      .statements()
      .map((s) =>
        (s.body as { verb: { id: string } }).verb.id.split('/').at(-1)
      );
    expect(verbs).toEqual([
      'initialized',
      'scored',
      'passed',
      'scored',
      'failed',
    ]);
    const [, scored, passed, , failed] = lrs.statements();
    expect((scored?.body as any).result).toEqual({
      score: { raw: 80, min: 0, max: 100, scaled: 0.8 },
    });
    expect((passed?.body as any).result).toEqual({
      completion: true,
      success: true,
      score: { raw: 80, min: 0, max: 100, scaled: 0.8 },
    });
    expect((failed?.body as any).result).toEqual({
      success: false,
      score: { raw: 20, min: 0, max: 100, scaled: 0.2 },
    });
  });

  test('completing sends a completed statement; terminating sends the duration', async () => {
    const lrs = fakeLrs();
    let clock = 0;
    const runtime = createRuntime(
      createXapiAdapter(LAUNCH, CONTENT, lrs.environment),
      () => clock
    );
    await runtime.start();
    runtime.complete();
    clock = 90_000;
    runtime.terminate();
    await lrs.flush();
    const bodies = lrs.statements().map((s) => s.body as any);
    expect(bodies[1].verb.id).toBe('http://adlnet.gov/expapi/verbs/completed');
    expect(bodies[1].result).toEqual({ completion: true });
    expect(bodies[2].verb.id).toBe('http://adlnet.gov/expapi/verbs/terminated');
    expect(bodies[2].result).toEqual({ duration: 'PT0H1M30.00S' });
  });

  test('keeps location, suspend data and progress in the LRS state, newest last', async () => {
    const lrs = fakeLrs();
    const runtime = createRuntime(
      createXapiAdapter(LAUNCH, CONTENT, lrs.environment)
    );
    await runtime.start();
    runtime.setLocation('p3');
    runtime.setSuspendData('v2;111;-;');
    runtime.setProgress(0.5);
    await lrs.flush();
    const saves = lrs.calls.filter((c) => c.method === 'PUT');
    expect(saves.length).toBeGreaterThan(0);
    expect(saves.at(-1)?.body).toEqual({
      location: 'p3',
      suspendData: 'v2;111;-;',
      status: 'incomplete',
      progress: 0.5,
    });
    const url = new URL(saves.at(-1)?.url ?? '');
    expect(url.searchParams.get('stateId')).toBe('lms-package-maker.state');
  });

  test('fails to start when the LRS cannot be reached or refuses the state read', async () => {
    const unreachable: XapiEnvironment = {
      ...fakeLrs().environment,
      fetch: async () => {
        throw new Error('network down');
      },
    };
    const first = await createRuntime(
      createXapiAdapter(LAUNCH, CONTENT, unreachable)
    ).start();
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.error).toContain('https://lrs.example.com/xapi');
      expect(first.error).toContain('network down');
    }
    const refused = await createRuntime(
      createXapiAdapter(
        LAUNCH,
        CONTENT,
        fakeLrs({ stateStatus: 401 }).environment
      )
    ).start();
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error).toContain('401');
    }
  });

  test('a rejected statement is logged and does not stop later ones', async () => {
    const lrs = fakeLrs();
    let post = 0;
    const environment: XapiEnvironment = {
      ...lrs.environment,
      fetch: async (url, init) => {
        if (init.method === 'POST' && (post += 1) === 1) {
          return { status: 400, ok: false, text: async () => 'bad statement' };
        }
        return lrs.environment.fetch(url, init);
      },
    };
    const logged: string[] = [];
    const original = console.error;
    console.error = (message: string): void => {
      logged.push(message);
    };
    try {
      const runtime = createRuntime(
        createXapiAdapter(LAUNCH, CONTENT, environment)
      );
      await runtime.start();
      runtime.complete();
      await lrs.flush();
    } finally {
      console.error = original;
    }
    expect(logged.join('\n')).toContain("xAPI 'initialized' statement failed");
    expect(logged.join('\n')).toContain('400');
    expect(lrs.statements().map((s) => (s.body as any).verb.id)).toContain(
      'http://adlnet.gov/expapi/verbs/completed'
    );
  });
});

describe('xapi adapter: ending the session', () => {
  test('finish() waits for the last requests and reports a clean exit', async () => {
    const lrs = fakeLrs();
    const runtime = createRuntime(
      createXapiAdapter(LAUNCH, CONTENT, lrs.environment)
    );
    await runtime.start();
    runtime.complete();
    const exited = await runtime.exit();
    expect(exited.ok).toBe(true);
    expect(lrs.statements().at(-1)?.body).toMatchObject({
      verb: { id: 'http://adlnet.gov/expapi/verbs/terminated' },
    });
  });

  test('finish() reports it when the LRS refuses the last requests, every time it is asked', async () => {
    const lrs = fakeLrs();
    const environment: XapiEnvironment = {
      ...lrs.environment,
      fetch: async (url, init) => {
        if (
          init.method === 'POST' &&
          JSON.parse(init.body ?? '{}').verb?.id?.endsWith('/terminated')
        ) {
          return { status: 503, ok: false, text: async () => 'try later' };
        }
        return lrs.environment.fetch(url, init);
      },
    };
    const original = console.error;
    console.error = (): void => undefined;
    try {
      const runtime = createRuntime(
        createXapiAdapter(LAUNCH, CONTENT, environment)
      );
      await runtime.start();
      const first = await runtime.exit();
      expect(!first.ok && first.error).toContain('503');
      expect(!first.ok && first.error).toContain('terminated');
      const again = await runtime.exit();
      expect(again.ok).toBe(false);
    } finally {
      console.error = original;
    }
  });

  test('a failure earlier in the session is not blamed on the exit', async () => {
    const lrs = fakeLrs();
    let first = true;
    const environment: XapiEnvironment = {
      ...lrs.environment,
      fetch: async (url, init) => {
        if (init.method === 'POST' && first) {
          first = false;
          return { status: 400, ok: false, text: async () => 'bad' };
        }
        return lrs.environment.fetch(url, init);
      },
    };
    const original = console.error;
    console.error = (): void => undefined;
    try {
      const runtime = createRuntime(
        createXapiAdapter(LAUNCH, CONTENT, environment)
      );
      await runtime.start(); // the 'initialized' statement is refused
      expect((await runtime.exit()).ok).toBe(true);
    } finally {
      console.error = original;
    }
  });
});

describe('selectAdapter for an xAPI package', () => {
  const search = (params: Record<string, string>): string =>
    `?${new URLSearchParams(params).toString()}`;

  test('uses xAPI when launched from an LRS', () => {
    const adapter = selectAdapter({}, 'xapi', {
      content: CONTENT,
      search: search({
        endpoint: LAUNCH.endpoint,
        actor: JSON.stringify(ACTOR),
      }),
      environment: fakeLrs().environment,
    });
    expect(adapter.name).toBe('xapi');
  });

  test('runs standalone when there is no launch endpoint', () => {
    expect(
      selectAdapter({}, 'xapi', { content: CONTENT, search: '' }).name
    ).toBe('standalone');
  });

  test('explains a broken launch when starting', async () => {
    const adapter = selectAdapter({}, 'xapi', {
      content: CONTENT,
      search: search({ endpoint: 'https://lrs.test/x' }),
    });
    const started = await createRuntime(adapter).start();
    expect(started.ok).toBe(false);
    if (!started.ok) {
      expect(started.error).toContain("no 'actor'");
    }
  });
});
