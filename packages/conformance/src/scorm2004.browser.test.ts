import { afterAll, beforeAll, describe, expect } from 'bun:test';
import { scorm2004Exporter } from '@richardmcquiston01/lms-package-maker-exporter-scorm2004';
import type { PackageFiles } from '@richardmcquiston01/lms-package-maker-exporters';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import type { Browser, FrameLocator, Page } from 'playwright-core';
import { launchBrowser } from './browser';
import { sampleCourse } from './fixtures';
import { loadReactiveLms, testIf, type ReactiveLms } from './reactiveLms';
import { openWithScorm2004Host } from './scorm2004Host';

// Gated like the other browser tests: they run where the pinned checkout and
// Chromium are installed (CI), and are skipped locally otherwise.
const reactiveLms: ReactiveLms | null = await loadReactiveLms();

const quizCourse: CourseModel = {
  modelVersion: 1,
  id: 'quiz-course-2004',
  title: 'Quiz Course',
  description: '',
  language: 'en',
  completion: { kind: 'passQuiz', minScorePercent: 70 },
  modules: [
    {
      id: 'm1',
      title: 'Module',
      pages: [
        {
          id: 'quiz',
          title: 'Quiz',
          html: '<p>Answer</p>',
          questions: [
            {
              id: 'q1',
              kind: 'single',
              prompt: 'Pick B',
              choices: [
                { id: 'a', text: 'Alpha' },
                { id: 'b', text: 'Bravo' },
              ],
              correctChoiceIds: ['b'],
              points: 2,
            },
          ],
        },
      ],
    },
  ],
};

function build(course: CourseModel): PackageFiles {
  const exported = scorm2004Exporter.export(course);
  if (!exported.ok) {
    throw new Error(exported.errors.join('; '));
  }
  return exported.value;
}

const viewAllFiles: PackageFiles = build(sampleCourse);
const quizFiles: PackageFiles = build(quizCourse);
let browser: Browser | null = null;

beforeAll(async (): Promise<void> => {
  if (reactiveLms !== null) {
    browser = await launchBrowser();
  }
});
afterAll(async (): Promise<void> => {
  await browser?.close();
});

const data = (page: Page): Promise<Record<string, string>> =>
  page.evaluate(() => (window as any).__lms.data);
const violations = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as any).__lms.violations);
const isTerminated = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as any).__lms.state.terminated);
const leave = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    (
      document.getElementById('f') as HTMLIFrameElement
    ).contentWindow?.dispatchEvent(new Event('pagehide'));
  });
};

describe('SCORM 2004 package against a strict SCORM 2004 host', () => {
  testIf(reactiveLms !== null)(
    'uses API_1484_11, completes after the last page and terminates cleanly',
    async () => {
      const { page, problems } = await openWithScorm2004Host(
        browser as Browser,
        viewAllFiles,
        {}
      );
      expect((await data(page))['cmi.completion_status']).toBe('incomplete');
      const frame: FrameLocator = page.frameLocator('#f');
      await frame.locator('[data-action="next"]').click();
      await frame.locator('[data-action="next"]').click();
      await leave(page);
      const values = await data(page);
      expect(values['cmi.completion_status']).toBe('completed');
      expect(values['cmi.location']).toBe('p3');
      expect(values['cmi.suspend_data']).toBe('v2;111;-;');
      expect(values['cmi.progress_measure']).toBe('1');
      expect(values['cmi.session_time']).toMatch(/^PT\d+H\d+M\d+\.\d\dS$/);
      expect(values['cmi.exit']).toBe('');
      expect(await isTerminated(page)).toBe(true);
      expect(await violations(page)).toEqual([]);
      expect(problems).toEqual([]);
      await page.close();
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'a resumed launch starts at the stored page',
    async () => {
      const { page, problems } = await openWithScorm2004Host(
        browser as Browser,
        viewAllFiles,
        {
          'cmi.completion_status': 'incomplete',
          'cmi.location': 'p2',
          'cmi.suspend_data': 'v2;110;-;',
          'cmi.entry': 'resume',
        }
      );
      expect(
        await page.frameLocator('#f').locator('#lpm-status').textContent()
      ).toBe('Page 2 of 3');
      expect(await violations(page)).toEqual([]);
      expect(problems).toEqual([]);
      await page.close();
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'an unfinished attempt is suspended',
    async () => {
      const { page } = await openWithScorm2004Host(
        browser as Browser,
        viewAllFiles,
        {}
      );
      await leave(page);
      expect((await data(page))['cmi.exit']).toBe('suspend');
      expect(await violations(page)).toEqual([]);
      await page.close();
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'quiz attempts report success status and a scaled score as they happen',
    async () => {
      const { page, problems } = await openWithScorm2004Host(
        browser as Browser,
        quizFiles,
        {}
      );
      const frame: FrameLocator = page.frameLocator('#f');
      await frame.getByLabel('Alpha', { exact: true }).check();
      await frame.getByRole('button', { name: 'Submit answers' }).click();
      let values = await data(page);
      expect(values['cmi.success_status']).toBe('failed');
      expect(values['cmi.completion_status']).toBe('incomplete');
      expect(values['cmi.score.scaled']).toBe('0');
      expect(values['cmi.score.raw']).toBe('0');

      await frame.getByRole('button', { name: 'Try again' }).click();
      await frame.getByLabel('Bravo', { exact: true }).check();
      await frame.getByRole('button', { name: 'Submit answers' }).click();
      values = await data(page);
      expect(values['cmi.success_status']).toBe('passed');
      expect(values['cmi.completion_status']).toBe('completed');
      expect(values['cmi.score.scaled']).toBe('1');
      expect(values['cmi.score.raw']).toBe('100');
      expect(await violations(page)).toEqual([]);
      expect(problems).toEqual([]);
      await page.close();
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'the host is strict: it refuses a value outside the data model',
    async () => {
      const { page } = await openWithScorm2004Host(
        browser as Browser,
        viewAllFiles,
        {}
      );
      const answer: { result: string; error: string } = await page.evaluate(
        () => {
          const api = (window as any).API_1484_11;
          const result = api.SetValue('cmi.score.scaled', '1.5');
          return { result, error: api.GetLastError() };
        }
      );
      expect(answer).toEqual({ result: 'false', error: '407' });
      expect((await violations(page)).length).toBe(1);
      await page.close();
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'Exit course terminates the session once, and the page says so',
    async () => {
      const { page, problems } = await openWithScorm2004Host(
        browser as Browser,
        viewAllFiles,
        {}
      );
      const frame: FrameLocator = page.frameLocator('#f');
      await frame.locator('[data-action="next"]').click();
      await frame.locator('[data-action="next"]').click();
      await frame.getByRole('button', { name: 'Exit course' }).click();
      await frame
        .locator('#lpm-status')
        .getByText('The session has ended')
        .waitFor();
      expect(await isTerminated(page)).toBe(true);
      const values = await data(page);
      expect(values['cmi.completion_status']).toBe('completed');
      expect(values['cmi.session_time']).toMatch(/^PT\d+H\d+M\d+\.\d\dS$/);
      // closing the window afterwards does not terminate a second time
      await leave(page);
      const calls: string[] = await page.evaluate(
        () => (window as any).__lms.calls
      );
      expect(calls.filter((call) => call.startsWith('Terminate'))).toHaveLength(
        1
      );
      expect(await violations(page)).toEqual([]);
      expect(problems).toEqual([]);
      await page.close();
    },
    60_000
  );
});
