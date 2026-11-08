import { describe, expect, test } from 'bun:test';
import { createRuntime, createStandaloneAdapter } from './core.js';
import { createHtml5Adapter } from './html5.js';
import { selectAdapter } from './select.js';
import { FakeScorm12Api } from './fakeScormApi.js';

describe('createRuntime', () => {
  test('refuses calls before init with a descriptive error', () => {
    const result = createRuntime(createStandaloneAdapter()).complete();
    expect(result).toEqual({
      ok: false,
      error: "cannot set status 'completed': init() has not succeeded yet",
    });
  });

  test('refuses calls after terminate', () => {
    const runtime = createRuntime(createStandaloneAdapter());
    runtime.init();
    runtime.terminate();
    expect(runtime.setLocation('x').ok).toBe(false);
  });

  test('clamps progress and rejects non-finite values', () => {
    const sent: number[] = [];
    const runtime = createRuntime({
      ...createStandaloneAdapter(),
      setProgress: (measure: number) => {
        sent.push(measure);
        return { ok: true, value: null };
      },
    });
    runtime.init();
    runtime.setProgress(7);
    runtime.setProgress(-1);
    expect(runtime.setProgress(Number.NaN).ok).toBe(false);
    expect(sent).toEqual([1, 0]);
  });
});

describe('html5 adapter', () => {
  test('posts the reactive-lms envelope', () => {
    const messages: unknown[] = [];
    const runtime = createRuntime(
      createHtml5Adapter({
        postMessage: (message: unknown) => messages.push(message),
      })
    );
    runtime.init();
    runtime.setProgress(0.5);
    runtime.pass();
    expect(messages).toContainEqual({
      source: 'reactive-lms',
      type: 'progress',
      payload: { progressMeasure: 0.5 },
    });
    expect(messages.at(-1)).toEqual({
      source: 'reactive-lms',
      type: 'complete',
      payload: { successStatus: 'passed' },
    });
  });

  test('reports a failing postMessage instead of throwing', () => {
    const runtime = createRuntime(
      createHtml5Adapter({
        postMessage: () => {
          throw new Error('detached frame');
        },
      })
    );
    runtime.init();
    const result = runtime.setLocation('p');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('detached frame');
    }
  });
});

describe('selectAdapter', () => {
  test('prefers SCORM 1.2, then a parent frame, then standalone', () => {
    const api: FakeScorm12Api = new FakeScorm12Api();
    expect(
      selectAdapter({ parent: { API: api, postMessage: () => undefined } }).name
    ).toBe('scorm12');
    const framed = { parent: { postMessage: () => undefined } };
    expect(selectAdapter(framed).name).toBe('html5');
    expect(selectAdapter({}).name).toBe('standalone');
  });
});

describe('status changes', () => {
  function recordingRuntime() {
    const sent: string[] = [];
    const runtime = createRuntime({
      ...createStandaloneAdapter(),
      setStatus: (status) => {
        sent.push(status);
        return { ok: true, value: null };
      },
    });
    runtime.init();
    sent.length = 0;
    return { runtime, sent };
  }

  test('reports a fail after an earlier pass, and a pass after a fail', () => {
    const { runtime, sent } = recordingRuntime();
    runtime.pass();
    runtime.fail();
    runtime.pass();
    runtime.fail();
    // The system that records the result decides which attempt counts.
    expect(sent).toEqual(['passed', 'failed', 'passed', 'failed']);
  });

  test('never un-finishes a finished lesson by starting or viewing', () => {
    const { runtime, sent } = recordingRuntime();
    runtime.fail();
    expect(runtime.complete().ok).toBe(true);
    expect(sent).toEqual(['failed']);
    const second = recordingRuntime();
    second.runtime.complete();
    second.runtime.pass();
    expect(second.sent).toEqual(['completed', 'passed']);
  });

  test('a plain completed does not erase a pass or a fail', () => {
    const { runtime, sent } = recordingRuntime();
    runtime.pass();
    runtime.complete();
    expect(sent).toEqual(['passed']);
  });
});

describe('ending a session', () => {
  test('a failed terminate can be tried again; a successful one is final and safe to repeat', () => {
    let attempts = 0;
    const runtime = createRuntime({
      ...createStandaloneAdapter(),
      terminate: () => {
        attempts += 1;
        return attempts === 1
          ? { ok: false, error: 'LMSFinish refused' }
          : { ok: true, value: null };
      },
    });
    runtime.init();
    const first = runtime.terminate();
    expect(first).toEqual({ ok: false, error: 'LMSFinish refused' });
    // not terminated yet, so the content can still save
    expect(runtime.setLocation('x').ok).toBe(true);
    expect(runtime.terminate().ok).toBe(true);
    expect(runtime.terminate().ok).toBe(true);
    expect(attempts).toBe(2);
    expect(runtime.setLocation('x').ok).toBe(false);
  });

  test('exit() reports a terminate failure and can be repeated', async () => {
    let attempts = 0;
    const runtime = createRuntime({
      ...createStandaloneAdapter(),
      terminate: () => {
        attempts += 1;
        return attempts === 1
          ? { ok: false, error: 'LMSFinish refused' }
          : { ok: true, value: null };
      },
    });
    runtime.init();
    expect((await runtime.exit()).ok).toBe(false);
    expect((await runtime.exit()).ok).toBe(true);
  });
});
