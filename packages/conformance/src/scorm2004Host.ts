import { HOST_URL, serve } from './browser';
import type { PackageFiles } from '@richardmcquiston01/lms-package-maker-exporters';
import type { Browser, Page } from 'playwright-core';

/**
 * A stand-in SCORM 2004 LMS, written in plain JavaScript for the browser.
 * reactive-lms has no `API_1484_11` yet, so this host is strict instead of
 * real: it keeps the SCORM 2004 call-state rules (122/123/132/133), the data
 * model's value spaces (statuses, ranges, ISO 8601 `session_time`, limits)
 * and read-only elements, and records every refusal in `violations`.
 */
const HOST_SCRIPT = String.raw`
(function () {
  var seed = JSON.parse(document.currentScript.getAttribute('data-seed') || '{}');
  var data = Object.assign({}, seed);
  var state = { initialized: false, terminated: false, failTerminate: false };
  var calls = [];
  var violations = [];
  var lastError = '0';
  var ERRORS = {
    '0': 'No Error', '122': 'Retrieve Data Before Initialization Error',
    '123': 'Retrieve Data After Termination Error', '132': 'Store Data Before Initialization Error',
    '133': 'Store Data After Termination Error', '103': 'Already Initialized',
    '111': 'General Termination Failure', '201': 'General Argument Error',
    '301': 'General Get Failure', '351': 'General Set Failure',
    '401': 'Undefined Data Model Element', '404': 'Data Model Element Is Read Only',
    '405': 'Data Model Element Is Write Only', '406': 'Data Model Element Type Mismatch',
    '407': 'Data Model Element Value Out Of Range'
  };
  var DURATION = /^P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d{1,2})?S)?)?$/;
  function real(v) { return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null; }
  function fail(code, what) { lastError = String(code); violations.push(what + ' -> ' + code + ' ' + ERRORS[code]); return 'false'; }
  var WRITABLE = {
    'cmi.completion_status': function (v) { return ['completed', 'incomplete', 'not attempted', 'unknown'].indexOf(v) >= 0 ? 0 : 406; },
    'cmi.success_status': function (v) { return ['passed', 'failed', 'unknown'].indexOf(v) >= 0 ? 0 : 406; },
    'cmi.location': function (v) { return v.length <= 1000 ? 0 : 407; },
    'cmi.suspend_data': function (v) { return v.length <= 64000 ? 0 : 407; },
    'cmi.exit': function (v) { return ['time-out', 'suspend', 'logout', 'normal', ''].indexOf(v) >= 0 ? 0 : 406; },
    'cmi.session_time': function (v) { return v !== 'P' && DURATION.test(v) ? 0 : 406; },
    'cmi.progress_measure': function (v) { var n = real(v); return n === null ? 406 : (n < 0 || n > 1 ? 407 : 0); },
    'cmi.score.scaled': function (v) { var n = real(v); return n === null ? 406 : (n < -1 || n > 1 ? 407 : 0); },
    'cmi.score.raw': function (v) { return real(v) === null ? 406 : 0; },
    'cmi.score.min': function (v) { return real(v) === null ? 406 : 0; },
    'cmi.score.max': function (v) { return real(v) === null ? 406 : 0; }
  };
  var READ_ONLY = ['cmi.mode', 'cmi.entry', 'cmi.credit', 'cmi._version', 'cmi.launch_data'];
  window.API_1484_11 = {
    Initialize: function (p) {
      calls.push('Initialize(' + p + ')');
      if (p !== '') { return fail(201, 'Initialize("' + p + '")'); }
      if (state.initialized) { return fail(103, 'Initialize twice'); }
      state.initialized = true; lastError = '0'; return 'true';
    },
    Terminate: function (p) {
      calls.push('Terminate(' + p + ')');
      if (p !== '') { return fail(201, 'Terminate("' + p + '")'); }
      if (!state.initialized) { return fail(112, 'Terminate before Initialize'); }
      if (state.failTerminate) { state.failTerminate = false; return fail(111, 'Terminate refused (simulated)'); }
      state.terminated = true; state.initialized = false; lastError = '0'; return 'true';
    },
    GetValue: function (e) {
      if (!state.initialized) { fail(state.terminated ? 123 : 122, 'GetValue(' + e + ')'); return ''; }
      lastError = '0'; return data[e] === undefined ? '' : String(data[e]);
    },
    SetValue: function (e, v) {
      calls.push('SetValue(' + e + ',' + v + ')');
      if (!state.initialized) { return fail(state.terminated ? 133 : 132, 'SetValue(' + e + ')'); }
      if (READ_ONLY.indexOf(e) >= 0) { return fail(404, 'SetValue(' + e + ')'); }
      var check = WRITABLE[e];
      if (!check) { return fail(401, 'SetValue(' + e + ')'); }
      var code = check(String(v));
      if (code !== 0) { return fail(code, 'SetValue(' + e + ',' + v + ')'); }
      data[e] = String(v); lastError = '0'; return 'true';
    },
    Commit: function (p) {
      calls.push('Commit(' + p + ')');
      if (!state.initialized) { return fail(state.terminated ? 133 : 132, 'Commit'); }
      lastError = '0'; return 'true';
    },
    GetLastError: function () { return lastError; },
    GetErrorString: function (c) { return ERRORS[c] || ''; },
    GetDiagnostic: function (c) { return 'diagnostic ' + c; }
  };
  window.__lms = { data: data, state: state, calls: calls, violations: violations };
})();
`;

export interface Opened2004Package {
  readonly page: Page;
  /** Messages from the runtime or the page that point at a problem. */
  readonly problems: string[];
}

/** Opens a package in a frame whose parent exposes the strict SCORM 2004 host. */
export async function openWithScorm2004Host(
  browser: Browser,
  files: PackageFiles,
  seed: Record<string, string>
): Promise<Opened2004Package> {
  const page: Page = await browser.newPage();
  const problems: string[] = [];
  page.on('console', (message): void => {
    if (message.text().includes('[lms-package]')) {
      problems.push(message.text());
    }
  });
  page.on('pageerror', (error): void => {
    problems.push(error.message);
  });
  const seedAttribute: string = JSON.stringify(seed).replace(/"/g, '&quot;');
  const host = `<script data-seed="${seedAttribute}">${HOST_SCRIPT}</script><iframe id="f" src="/index.html" width="900" height="600"></iframe>`;
  await serve(page, host, files);
  await page.goto(HOST_URL);
  await page.frameLocator('#f').locator('[data-action="next"]').waitFor();
  return { page, problems };
}
