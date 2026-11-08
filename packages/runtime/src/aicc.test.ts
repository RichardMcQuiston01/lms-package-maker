import { describe, expect, test } from 'bun:test';
import {
  createAiccAdapter,
  formatAiccTime,
  parseAiccLaunch,
  parseGetParamResponse,
  readLessonStatus,
  type AiccLaunch,
} from './aicc.js';
import { createRuntime } from './core.js';
import { selectAdapter } from './select.js';
import type { XapiEnvironment } from './xapiTransport.js';

const LAUNCH: AiccLaunch = {
  url: 'https://lms.example.com/aicc/hacp',
  sessionId: 'sess-123',
};

function getParamAnswer(
  core: Record<string, string>,
  extra: string = ''
): string {
  return [
    'error=0',
    'error_text=Successful',
    'version=3.5',
    'aicc_data=[Core]',
    ...Object.entries(core).map(([key, value]) => `${key}=${value}`),
    extra,
  ].join('\r\n');
}

interface Request {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly form: URLSearchParams;
}

function fake(
  answer: string = getParamAnswer({
    Student_ID: 'learner-1',
    Lesson_Status: 'Not Attempted',
  })
) {
  const requests: Request[] = [];
  let clock = 0;
  const environment: XapiEnvironment = {
    fetch: async (url, init) => {
      requests.push({
        url,
        headers: init.headers,
        form: new URLSearchParams(init.body ?? ''),
      });
      const command = new URLSearchParams(init.body ?? '').get('command');
      const text =
        command === 'GetParam'
          ? answer
          : 'error=0\r\nerror_text=Successful\r\n';
      return { status: 200, ok: true, text: async () => text };
    },
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock)),
    newId: () => 'unused',
  };
  const commands = (): string[] =>
    requests.map((r) => r.form.get('command') ?? '');
  const puts = (): string[] =>
    requests
      .filter((r) => r.form.get('command') === 'PutParam')
      .map((r) => r.form.get('aicc_data') ?? '');
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 12; i += 1) {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  return {
    requests,
    environment,
    commands,
    puts,
    flush,
    tick: (s: number) => (clock += s),
  };
}

describe('parseAiccLaunch', () => {
  test('reads AICC_SID and AICC_URL in any letter case', () => {
    const query = `?AICC_SID=abc&aicc_url=${encodeURIComponent('https://lms.example.com/hacp?x=1')}`;
    expect(parseAiccLaunch(query)).toEqual({
      ok: true,
      value: { sessionId: 'abc', url: 'https://lms.example.com/hacp?x=1' },
    });
  });

  test('no AICC parameters means this is not an AICC launch', () => {
    expect(parseAiccLaunch('')).toEqual({ ok: true, value: null });
    expect(parseAiccLaunch('?page=2')).toEqual({ ok: true, value: null });
  });

  test('names what is missing or wrong', () => {
    const message = (search: string): string => {
      const result = parseAiccLaunch(search);
      return result.ok ? 'ok' : result.error;
    };
    expect(message('?AICC_SID=abc')).toContain('AICC_URL is missing');
    expect(message('?AICC_URL=https://x.test/')).toContain(
      'AICC_SID is missing'
    );
    expect(message('?AICC_SID=a&AICC_URL=nope')).toContain(
      'not a valid address'
    );
    expect(message('?AICC_SID=a&AICC_URL=ftp://x.test/')).toContain(
      'must start with http'
    );
  });
});

describe('readLessonStatus', () => {
  test('understands words and first letters, with or without an exit flag', () => {
    expect(readLessonStatus('Passed')).toBe('passed');
    expect(readLessonStatus('p')).toBe('passed');
    expect(readLessonStatus('Completed,Logout')).toBe('completed');
    expect(readLessonStatus('F')).toBe('failed');
    expect(readLessonStatus('incomplete, Resume')).toBe('incomplete');
    expect(readLessonStatus('Browsed')).toBe('incomplete');
    expect(readLessonStatus('Not Attempted')).toBeNull();
    expect(readLessonStatus('')).toBeNull();
  });
});

describe('parseGetParamResponse', () => {
  test('reads location, status, suspend data and mastery score', () => {
    const text = [
      'error=0',
      'error_text=Successful',
      'version=3.5',
      'aicc_data=[Core]',
      'Student_ID=abc',
      'Student_Name=Lovelace, Ada',
      'Lesson_Location=p2',
      'Credit=C',
      'Lesson_Status=Incomplete,Resume',
      'Score=',
      'Time=00:01:00',
      '[Core_Lesson]',
      'v2;110;-;',
      '[Student_Data]',
      'Mastery_Score=75',
    ].join('\r\n');
    expect(parseGetParamResponse(text)).toEqual({
      ok: true,
      value: {
        location: 'p2',
        status: 'incomplete',
        suspendData: 'v2;110;-;',
        masteryScore: 75,
      },
    });
  });

  test('a new learner has nothing saved', () => {
    expect(
      parseGetParamResponse(
        getParamAnswer({ Lesson_Status: 'Not Attempted', Lesson_Location: '' })
      )
    ).toEqual({
      ok: true,
      value: {
        location: null,
        status: null,
        suspendData: null,
        masteryScore: null,
      },
    });
  });

  test('a refusal carries the LMS error code and text', () => {
    const result = parseGetParamResponse(
      'error=3\r\nerror_text=Invalid Session ID\r\naicc_data='
    );
    expect(!result.ok && result.error).toContain('error 3');
    expect(!result.ok && result.error).toContain('Invalid Session ID');
  });
});

describe('formatAiccTime', () => {
  test('formats seconds as HH:MM:SS', () => {
    expect(formatAiccTime(0)).toBe('00:00:00');
    expect(formatAiccTime(3725.4)).toBe('01:02:05');
    expect(formatAiccTime(-3)).toBe('00:00:00');
  });
});

describe('aicc adapter through the runtime', () => {
  test('GetParam first, as a form POST with command, version and session id', async () => {
    const lms = fake();
    const runtime = createRuntime(createAiccAdapter(LAUNCH, lms.environment));
    const started = await runtime.start();
    expect(started).toEqual({
      ok: true,
      value: { location: null, suspendData: null, status: null },
    });
    const [first] = lms.requests;
    expect(first?.url).toBe(LAUNCH.url);
    expect(first?.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
    expect(first?.form.get('command')).toBe('GetParam');
    expect(first?.form.get('session_id')).toBe('sess-123');
    expect(first?.form.get('version')).toBe('3.5');
    expect(first?.form.has('aicc_data')).toBe(false);
  });

  test('resumes from the location, suspend data and status the LMS has', async () => {
    const lms = fake(
      getParamAnswer(
        { Lesson_Location: 'p2', Lesson_Status: 'Incomplete,Resume' },
        '[Core_Lesson]\r\nv2;110;-;'
      )
    );
    const started = await createRuntime(
      createAiccAdapter(LAUNCH, lms.environment)
    ).start();
    expect(started).toEqual({
      ok: true,
      value: { location: 'p2', suspendData: 'v2;110;-;', status: 'incomplete' },
    });
  });

  test('PutParam carries location, status, score and suspend data in the AICC layout', async () => {
    const lms = fake();
    const runtime = createRuntime(createAiccAdapter(LAUNCH, lms.environment));
    await runtime.start();
    lms.tick(75);
    runtime.setLocation('p3');
    runtime.setSuspendData('v2;111;-;');
    runtime.setScore({ raw: 80, min: 0, max: 100 });
    runtime.pass();
    await lms.flush();
    const last = lms.puts().at(-1) ?? '';
    expect(last).toBe(
      [
        '[Core]',
        'Lesson_Location=p3',
        'Lesson_Status=Passed',
        'Score=80,100,0',
        'Time=00:01:15',
        '[Core_Lesson]',
        'v2;111;-;',
        '',
      ].join('\r\n')
    );
  });

  test('a new attempt starts as incomplete and a later fail replaces an earlier pass', async () => {
    const lms = fake();
    const runtime = createRuntime(createAiccAdapter(LAUNCH, lms.environment));
    await runtime.start();
    runtime.pass();
    runtime.fail();
    await lms.flush();
    const statuses = lms
      .puts()
      .map((data) => data.match(/Lesson_Status=(\w+)/)?.[1]);
    expect(statuses).toContain('Incomplete');
    expect(statuses.at(-1)).toBe('Failed');
  });

  test('terminate sends a last PutParam, then ExitAU; unfinished attempts say Suspend', async () => {
    const lms = fake();
    const runtime = createRuntime(createAiccAdapter(LAUNCH, lms.environment));
    await runtime.start();
    runtime.terminate();
    runtime.terminate();
    await lms.flush();
    expect(lms.commands().slice(-2)).toEqual(['PutParam', 'ExitAU']);
    expect(lms.commands().filter((c) => c === 'ExitAU')).toHaveLength(1);
    expect(lms.puts().at(-1)).toContain('Lesson_Status=Incomplete,Suspend');
    const exit = lms.requests.at(-1);
    expect(exit?.form.has('aicc_data')).toBe(false);
  });

  test('a finished attempt leaves without a Suspend flag', async () => {
    const lms = fake();
    const runtime = createRuntime(createAiccAdapter(LAUNCH, lms.environment));
    await runtime.start();
    runtime.complete();
    runtime.terminate();
    await lms.flush();
    expect(lms.puts().at(-1)).toContain('Lesson_Status=Completed\r\n');
  });

  test('refuses values AICC cannot hold', async () => {
    const lms = fake();
    const runtime = createRuntime(createAiccAdapter(LAUNCH, lms.environment));
    await runtime.start();
    expect(runtime.setLocation('p'.repeat(256)).ok).toBe(false);
    expect(runtime.setSuspendData('x'.repeat(4097)).ok).toBe(false);
    const section = runtime.setSuspendData('fine\n[Core]\nnot fine');
    expect(!section.ok && section.error).toContain('"["');
    expect(runtime.setSuspendData('v2;1;-;').ok).toBe(true);
  });

  test('explains why it could not start', async () => {
    const refused = fake(
      'error=3\r\nerror_text=Invalid Session ID\r\naicc_data='
    );
    const first = await createRuntime(
      createAiccAdapter(LAUNCH, refused.environment)
    ).start();
    expect(!first.ok && first.error).toContain('Invalid Session ID');
    const unreachable: XapiEnvironment = {
      ...fake().environment,
      fetch: async () => {
        throw new Error('network down');
      },
    };
    const second = await createRuntime(
      createAiccAdapter(LAUNCH, unreachable)
    ).start();
    expect(!second.ok && second.error).toContain(LAUNCH.url);
    expect(!second.ok && second.error).toContain('network down');
  });

  test('an LMS error on a later request is logged and does not stop the next one', async () => {
    const lms = fake();
    let puts = 0;
    const environment: XapiEnvironment = {
      ...lms.environment,
      fetch: async (url, init) => {
        const command = new URLSearchParams(init.body ?? '').get('command');
        if (command === 'PutParam' && (puts += 1) === 1) {
          return {
            status: 200,
            ok: true,
            text: async () => 'error=3\r\nerror_text=Invalid Session ID',
          };
        }
        return lms.environment.fetch(url, init);
      },
    };
    const logged: string[] = [];
    const original = console.error;
    console.error = (message: string): void => {
      logged.push(message);
    };
    try {
      const runtime = createRuntime(createAiccAdapter(LAUNCH, environment));
      await runtime.start();
      runtime.setLocation('p2');
      runtime.setLocation('p3');
      await lms.flush();
    } finally {
      console.error = original;
    }
    expect(logged.join('\n')).toContain('AICC PutParam failed');
    expect(logged.join('\n')).toContain('Invalid Session ID');
    expect(lms.puts().at(-1)).toContain('Lesson_Location=p3');
  });
});

describe('aicc adapter: ending the session', () => {
  test('finish() waits for PutParam and ExitAU and reports a clean exit', async () => {
    const lms = fake();
    const runtime = createRuntime(createAiccAdapter(LAUNCH, lms.environment));
    await runtime.start();
    const exited = await runtime.exit();
    expect(exited.ok).toBe(true);
    expect(lms.commands().slice(-2)).toEqual(['PutParam', 'ExitAU']);
  });

  test('finish() reports it when the LMS refuses ExitAU, every time it is asked', async () => {
    const lms = fake();
    const environment: XapiEnvironment = {
      ...lms.environment,
      fetch: async (url, init) => {
        if (new URLSearchParams(init.body ?? '').get('command') === 'ExitAU') {
          return {
            status: 200,
            ok: true,
            text: async () => 'error=3\r\nerror_text=Invalid Session ID',
          };
        }
        return lms.environment.fetch(url, init);
      },
    };
    const original = console.error;
    console.error = (): void => undefined;
    try {
      const runtime = createRuntime(createAiccAdapter(LAUNCH, environment));
      await runtime.start();
      const first = await runtime.exit();
      expect(!first.ok && first.error).toContain('ExitAU');
      expect(!first.ok && first.error).toContain('Invalid Session ID');
      expect((await runtime.exit()).ok).toBe(false);
    } finally {
      console.error = original;
    }
  });

  test('a refused PutParam earlier in the session is not blamed on the exit', async () => {
    const lms = fake();
    let puts = 0;
    const environment: XapiEnvironment = {
      ...lms.environment,
      fetch: async (url, init) => {
        if (
          new URLSearchParams(init.body ?? '').get('command') === 'PutParam' &&
          (puts += 1) === 1
        ) {
          return {
            status: 200,
            ok: true,
            text: async () => 'error=3\r\nerror_text=Invalid Session ID',
          };
        }
        return lms.environment.fetch(url, init);
      },
    };
    const original = console.error;
    console.error = (): void => undefined;
    try {
      const runtime = createRuntime(createAiccAdapter(LAUNCH, environment));
      await runtime.start();
      runtime.setLocation('p2'); // refused
      await lms.flush();
      expect((await runtime.exit()).ok).toBe(true);
    } finally {
      console.error = original;
    }
  });
});

describe('selectAdapter for an AICC package', () => {
  test('uses AICC when launched by an LMS, runs standalone otherwise', () => {
    const lms = fake();
    expect(
      selectAdapter({}, 'aicc', undefined, undefined, {
        search: `?AICC_SID=abc&AICC_URL=${encodeURIComponent(LAUNCH.url)}`,
        environment: lms.environment,
      }).name
    ).toBe('aicc');
    expect(
      selectAdapter({}, 'aicc', undefined, undefined, { search: '' }).name
    ).toBe('standalone');
  });

  test('explains a half launch when starting', async () => {
    const result = await createRuntime(
      selectAdapter({}, 'aicc', undefined, undefined, {
        search: '?AICC_SID=abc',
      })
    ).start();
    expect(!result.ok && result.error).toContain('AICC_URL is missing');
  });
});
