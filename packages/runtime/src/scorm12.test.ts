import { describe, expect, test } from 'bun:test';
import { createRuntime } from './core.js';
import { FakeScorm12Api } from './fakeScormApi.js';
import {
  createScorm12Adapter,
  findScorm12Api,
  formatScormTimespan,
  type ApiWindow,
} from './scorm12.js';

describe('findScorm12Api', () => {
  test('finds the API on a parent window', () => {
    const api: FakeScorm12Api = new FakeScorm12Api();
    const top: ApiWindow = { API: api };
    const frame: ApiWindow = { parent: top };
    expect(findScorm12Api({ parent: frame })).toBe(api);
  });

  test('falls back to the opener', () => {
    const api: FakeScorm12Api = new FakeScorm12Api();
    expect(findScorm12Api({ opener: { API: api } })).toBe(api);
  });

  test('returns null when nothing exposes an API', () => {
    expect(findScorm12Api({ parent: {} })).toBeNull();
  });

  test('survives a cross-origin parent that throws', () => {
    const blocked: ApiWindow = {
      get parent(): ApiWindow {
        throw new Error('SecurityError');
      },
    };
    expect(findScorm12Api(blocked)).toBeNull();
  });
});

describe('formatScormTimespan', () => {
  test('formats seconds as HH:MM:SS.SS', () => {
    expect(formatScormTimespan(0)).toBe('00:00:00.00');
    expect(formatScormTimespan(3725.5)).toBe('01:02:05.50');
  });
});

describe('scorm12 adapter through the runtime', () => {
  test('marks a new attempt incomplete, then completes and finishes', () => {
    const api: FakeScorm12Api = new FakeScorm12Api();
    let clock = 0;
    const runtime = createRuntime(createScorm12Adapter(api), () => clock);
    expect(runtime.init().ok).toBe(true);
    expect(api.values.get('cmi.core.lesson_status')).toBe('incomplete');
    expect(runtime.setLocation('page-2').ok).toBe(true);
    expect(runtime.setSuspendData('101').ok).toBe(true);
    expect(runtime.complete().ok).toBe(true);
    clock = 90_000;
    expect(runtime.terminate().ok).toBe(true);
    expect(api.values.get('cmi.core.lesson_status')).toBe('completed');
    expect(api.values.get('cmi.core.lesson_location')).toBe('page-2');
    expect(api.values.get('cmi.suspend_data')).toBe('101');
    expect(api.values.get('cmi.core.session_time')).toBe('00:01:30.00');
    expect(api.values.get('cmi.core.exit')).toBe('');
    expect(api.calls.at(-1)).toBe('LMSFinish()');
  });

  test('resumes from stored location and suspend data', () => {
    const api: FakeScorm12Api = new FakeScorm12Api();
    api.values.set('cmi.core.lesson_status', 'incomplete');
    api.values.set('cmi.core.lesson_location', 'page-3');
    api.values.set('cmi.suspend_data', '110');
    const init = createRuntime(createScorm12Adapter(api)).init();
    expect(init).toEqual({
      ok: true,
      value: { location: 'page-3', suspendData: '110', status: 'incomplete' },
    });
  });

  test('does not move a completed lesson back to incomplete', () => {
    const api: FakeScorm12Api = new FakeScorm12Api();
    api.values.set('cmi.core.lesson_status', 'completed');
    const runtime = createRuntime(createScorm12Adapter(api));
    runtime.init();
    expect(api.calls).not.toContain(
      'LMSSetValue(cmi.core.lesson_status,incomplete)'
    );
  });

  test('suspends the attempt when it ends incomplete', () => {
    const api: FakeScorm12Api = new FakeScorm12Api();
    const runtime = createRuntime(createScorm12Adapter(api));
    runtime.init();
    runtime.terminate();
    expect(api.values.get('cmi.core.exit')).toBe('suspend');
  });

  test('reports the LMS error code and text when a write fails', () => {
    const api: FakeScorm12Api = new FakeScorm12Api();
    api.failElement = 'cmi.core.lesson_location';
    const runtime = createRuntime(createScorm12Adapter(api));
    runtime.init();
    const result = runtime.setLocation('x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("LMSSetValue('cmi.core.lesson_location')");
      expect(result.error).toContain('405');
      expect(result.error).toContain('Incorrect Data Type');
    }
  });

  test('rejects suspend data over the 4096 character limit', () => {
    const api: FakeScorm12Api = new FakeScorm12Api();
    const runtime = createRuntime(createScorm12Adapter(api));
    runtime.init();
    const result = runtime.setSuspendData('1'.repeat(4097));
    expect(result.ok).toBe(false);
  });

  test('writes score min, max and raw', () => {
    const api: FakeScorm12Api = new FakeScorm12Api();
    const runtime = createRuntime(createScorm12Adapter(api));
    runtime.init();
    expect(runtime.setScore({ raw: 80, min: 0, max: 100 }).ok).toBe(true);
    expect(api.values.get('cmi.core.score.raw')).toBe('80');
    expect(runtime.setScore({ raw: 120, min: 0, max: 100 }).ok).toBe(false);
  });
});
