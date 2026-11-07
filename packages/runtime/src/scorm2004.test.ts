import { describe, expect, test } from 'bun:test';
import { createRuntime } from './core.js';
import { FakeScorm12Api, FakeScorm2004Api } from './fakeScormApi.js';
import {
  createScorm2004Adapter,
  findScorm2004Api,
  formatIsoDuration,
} from './scorm2004.js';
import { selectAdapter, type HostWindow } from './select.js';
import type { ApiWindow } from './apiSearch.js';

describe('findScorm2004Api', () => {
  test('finds API_1484_11 on a parent window, then the opener', () => {
    const api: FakeScorm2004Api = new FakeScorm2004Api();
    expect(findScorm2004Api({ parent: { parent: { API_1484_11: api } } })).toBe(
      api
    );
    expect(findScorm2004Api({ opener: { API_1484_11: api } })).toBe(api);
  });

  test('ignores a SCORM 1.2 API and survives blocked windows', () => {
    expect(
      findScorm2004Api({ parent: { API: new FakeScorm12Api() } })
    ).toBeNull();
    const sandboxed: ApiWindow = {
      get API_1484_11(): never {
        throw new Error('Sandbox access violation');
      },
    };
    expect(findScorm2004Api({ parent: sandboxed })).toBeNull();
  });
});

describe('formatIsoDuration', () => {
  test('formats seconds as an ISO 8601 duration', () => {
    expect(formatIsoDuration(0)).toBe('PT0H0M0.00S');
    expect(formatIsoDuration(3725.5)).toBe('PT1H2M5.50S');
    expect(formatIsoDuration(-4)).toBe('PT0H0M0.00S');
  });
});

describe('scorm2004 adapter through the runtime', () => {
  test('marks a new attempt incomplete, then completes and terminates', () => {
    const api: FakeScorm2004Api = new FakeScorm2004Api();
    let clock = 0;
    const runtime = createRuntime(createScorm2004Adapter(api), () => clock);
    expect(runtime.init().ok).toBe(true);
    expect(api.values.get('cmi.completion_status')).toBe('incomplete');
    expect(runtime.setLocation('page-2').ok).toBe(true);
    expect(runtime.setSuspendData('101').ok).toBe(true);
    expect(runtime.setProgress(0.5).ok).toBe(true);
    expect(runtime.complete().ok).toBe(true);
    clock = 90_000;
    expect(runtime.terminate().ok).toBe(true);
    expect(api.values.get('cmi.completion_status')).toBe('completed');
    expect(api.values.has('cmi.success_status')).toBe(false);
    expect(api.values.get('cmi.location')).toBe('page-2');
    expect(api.values.get('cmi.suspend_data')).toBe('101');
    expect(api.values.get('cmi.progress_measure')).toBe('0.5');
    expect(api.values.get('cmi.session_time')).toBe('PT0H1M30.00S');
    expect(api.values.get('cmi.exit')).toBe('');
    expect(api.calls.at(-1)).toBe('Terminate()');
  });

  test('a pass completes the SCO; a fail leaves it incomplete', () => {
    const api: FakeScorm2004Api = new FakeScorm2004Api();
    const runtime = createRuntime(createScorm2004Adapter(api));
    runtime.init();
    expect(runtime.fail().ok).toBe(true);
    expect(api.values.get('cmi.success_status')).toBe('failed');
    expect(api.values.get('cmi.completion_status')).toBe('incomplete');
    expect(runtime.pass().ok).toBe(true);
    expect(api.values.get('cmi.success_status')).toBe('passed');
    expect(api.values.get('cmi.completion_status')).toBe('completed');
    // every attempt is reported, so a later fail goes through too
    expect(runtime.fail().ok).toBe(true);
    expect(api.values.get('cmi.success_status')).toBe('failed');
  });

  test('resumes from stored location, suspend data and status', () => {
    const api: FakeScorm2004Api = new FakeScorm2004Api();
    api.values.set('cmi.completion_status', 'incomplete');
    api.values.set('cmi.location', 'page-3');
    api.values.set('cmi.suspend_data', '110');
    expect(createRuntime(createScorm2004Adapter(api)).init()).toEqual({
      ok: true,
      value: { location: 'page-3', suspendData: '110', status: 'incomplete' },
    });
  });

  test('reads a recorded pass or fail ahead of completion', () => {
    for (const [success, expected] of [
      ['passed', 'passed'],
      ['failed', 'failed'],
    ] as const) {
      const api: FakeScorm2004Api = new FakeScorm2004Api();
      api.values.set('cmi.completion_status', 'completed');
      api.values.set('cmi.success_status', success);
      const init = createRuntime(createScorm2004Adapter(api)).init();
      expect(init.ok && init.value.status).toBe(expected);
    }
    const unknown: FakeScorm2004Api = new FakeScorm2004Api();
    unknown.values.set('cmi.completion_status', 'not attempted');
    unknown.values.set('cmi.success_status', 'unknown');
    const init = createRuntime(createScorm2004Adapter(unknown)).init();
    expect(init.ok && init.value.status).toBe(null);
  });

  test('suspends the attempt when it ends incomplete', () => {
    const api: FakeScorm2004Api = new FakeScorm2004Api();
    const runtime = createRuntime(createScorm2004Adapter(api));
    runtime.init();
    runtime.terminate();
    expect(api.values.get('cmi.exit')).toBe('suspend');
  });

  test('writes raw, min, max and the scaled score', () => {
    const api: FakeScorm2004Api = new FakeScorm2004Api();
    const runtime = createRuntime(createScorm2004Adapter(api));
    runtime.init();
    expect(runtime.setScore({ raw: 80, min: 0, max: 100 }).ok).toBe(true);
    expect(api.values.get('cmi.score.raw')).toBe('80');
    expect(api.values.get('cmi.score.min')).toBe('0');
    expect(api.values.get('cmi.score.max')).toBe('100');
    expect(api.values.get('cmi.score.scaled')).toBe('0.8');
  });

  test('reports the LMS error code, text and diagnostic when a write fails', () => {
    const api: FakeScorm2004Api = new FakeScorm2004Api();
    api.failElement = 'cmi.location';
    const runtime = createRuntime(createScorm2004Adapter(api));
    runtime.init();
    const result = runtime.setLocation('x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("SetValue('cmi.location')");
      expect(result.error).toContain('406');
      expect(result.error).toContain('Data Model Element Type Mismatch');
      expect(result.error).toContain('bad value for cmi.location');
    }
  });

  test('rejects values over the SCORM 2004 limits', () => {
    const api: FakeScorm2004Api = new FakeScorm2004Api();
    const runtime = createRuntime(createScorm2004Adapter(api));
    runtime.init();
    expect(runtime.setSuspendData('1'.repeat(64001)).ok).toBe(false);
    expect(runtime.setSuspendData('1'.repeat(64000)).ok).toBe(true);
    expect(runtime.setLocation('p'.repeat(1001)).ok).toBe(false);
  });
});

const noPostMessage = (): void => undefined;

describe('selectAdapter with both APIs on offer', () => {
  const both = (): HostWindow => ({
    parent: {
      API: new FakeScorm12Api(),
      API_1484_11: new FakeScorm2004Api(),
      postMessage: noPostMessage,
    },
  });

  test('uses SCORM 1.2 by default and SCORM 2004 when the package asks', () => {
    expect(selectAdapter(both()).name).toBe('scorm12');
    expect(selectAdapter(both(), 'scorm2004').name).toBe('scorm2004');
  });

  test('falls back to whichever API exists', () => {
    const only2004: HostWindow = {
      parent: {
        API_1484_11: new FakeScorm2004Api(),
        postMessage: noPostMessage,
      },
    };
    const only12: HostWindow = {
      parent: { API: new FakeScorm12Api(), postMessage: noPostMessage },
    };
    expect(selectAdapter(only2004).name).toBe('scorm2004');
    expect(selectAdapter(only12, 'scorm2004').name).toBe('scorm12');
  });
});
