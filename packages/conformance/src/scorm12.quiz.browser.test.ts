import { afterAll, beforeAll, describe, expect } from 'bun:test';
import { scorm12Exporter } from '@richardmcquiston01/lms-package-maker-exporter-scorm12';
import type { PackageFiles } from '@richardmcquiston01/lms-package-maker-exporters';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import type { Browser, FrameLocator, Page } from 'playwright-core';
import { bundleCmiHost, launchBrowser, openWithCmiStore } from './browser';
import { loadReactiveLms, testIf, type ReactiveLms } from './reactiveLms';

const reactiveLms: ReactiveLms | null = await loadReactiveLms();

/** Five points: a single-answer question worth 2 and a pick-two question worth 3. */
const quizCourse: CourseModel = {
  modelVersion: 1,
  id: 'quiz-course',
  title: 'Quiz Course',
  description: '',
  language: 'en',
  completion: { kind: 'passQuiz', minScorePercent: 70 },
  modules: [
    {
      id: 'm1',
      title: 'Module',
      pages: [
        { id: 'intro', title: 'Intro', html: '<p>Read me</p>' },
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
              explanation: 'B is bravo.',
            },
            {
              id: 'q2',
              kind: 'multiple',
              prompt: 'Pick A and C',
              choices: [
                { id: 'a', text: 'Apple' },
                { id: 'b', text: 'Banana' },
                { id: 'c', text: 'Cherry' },
              ],
              correctChoiceIds: ['a', 'c'],
              points: 3,
            },
          ],
        },
      ],
    },
  ],
};

const exported = scorm12Exporter.export(quizCourse);
if (!exported.ok) {
  throw new Error(exported.errors.join('; '));
}
const packageFiles: PackageFiles = exported.value;
let browser: Browser | null = null;
let cmiHostScript = '';

beforeAll(async (): Promise<void> => {
  if (reactiveLms !== null) {
    browser = await launchBrowser();
    cmiHostScript = await bundleCmiHost(reactiveLms.cmiStoreSourcePath);
  }
});
afterAll(async (): Promise<void> => {
  await browser?.close();
});

const snapshot = (page: Page): Promise<Record<string, string>> =>
  page.evaluate(() => (window as any).__store.snapshot());

async function openQuizPage(seed: Record<string, unknown> = {}) {
  const opened = await openWithCmiStore(
    browser as Browser,
    cmiHostScript,
    packageFiles,
    seed
  );
  const frame: FrameLocator = opened.page.frameLocator('#f');
  await frame.getByRole('button', { name: 'Quiz', exact: true }).click();
  return { ...opened, frame };
}

async function answer(
  frame: FrameLocator,
  single: string,
  multiple: string[]
): Promise<void> {
  await frame.getByLabel(single, { exact: true }).check();
  for (const label of multiple) {
    await frame.getByLabel(label, { exact: true }).check();
  }
  await frame.getByRole('button', { name: 'Submit answers' }).click();
}

function progressOf(lms: ReactiveLms, values: Record<string, string>) {
  return lms.mapCmiToProgress(values, {
    registrationId: 'r',
    courseModuleId: 'c',
    activityNodeId: 'a',
  });
}

describe('quiz in a SCORM 1.2 package against the real reactive-lms CmiStore', () => {
  testIf(reactiveLms !== null)(
    'a course with a pass mark stays incomplete until the quiz is answered',
    async () => {
      const { page, frame, problems } = await openQuizPage();
      expect((await snapshot(page))['cmi.core.lesson_status']).toBe(
        'incomplete'
      );
      // Viewing every page does not finish a pass-the-quiz course.
      await frame.getByRole('button', { name: 'Intro', exact: true }).click();
      expect((await snapshot(page))['cmi.core.lesson_status']).toBe(
        'incomplete'
      );
      expect(problems).toEqual([]);
      await page.close();
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'each completed attempt is reported as it happened, so a later worse attempt is reported too',
    async () => {
      const lms = reactiveLms as ReactiveLms;
      const { page, frame, problems } = await openQuizPage();

      // 0 of 5 points: Alpha is wrong, and Banana alone is wrong.
      await answer(frame, 'Alpha', ['Banana']);
      let values = await snapshot(page);
      expect(values['cmi.core.lesson_status']).toBe('failed');
      expect(values['cmi.core.score.raw']).toBe('0');
      expect(values['cmi.core.score.min']).toBe('0');
      expect(values['cmi.core.score.max']).toBe('100');
      await expect(
        frame.locator('.lpm-question.is-wrong').count()
      ).resolves.toBe(2);
      expect(await frame.locator('.lpm-explanation:visible').count()).toBe(1);
      expect(await frame.locator('#lpm-quiz-summary').textContent()).toContain(
        'Not passed (pass mark 70%)'
      );

      // Try again with the right answers.
      await frame.getByRole('button', { name: 'Try again' }).click();
      expect(await frame.getByLabel('Alpha', { exact: true }).isEnabled()).toBe(
        true
      );
      expect(await frame.getByLabel('Alpha', { exact: true }).isChecked()).toBe(
        false
      );
      await answer(frame, 'Bravo', ['Apple', 'Cherry']);
      values = await snapshot(page);
      expect(values['cmi.core.lesson_status']).toBe('passed');
      expect(values['cmi.core.score.raw']).toBe('100');
      const progress = progressOf(lms, values);
      expect(progress['successStatus']).toBe('passed');
      expect(progress['scoreScaled']).toBe(1);

      // A worse later attempt is reported as it happened. Which attempt counts
      // (the latest, the best, ...) is for the system that records the result.
      await frame.getByRole('button', { name: 'Try again' }).click();
      await answer(frame, 'Alpha', ['Banana']);
      values = await snapshot(page);
      expect(values['cmi.core.lesson_status']).toBe('failed');
      expect(values['cmi.core.score.raw']).toBe('0');
      expect(await frame.locator('#lpm-quiz-summary').textContent()).toContain(
        'Quiz score: 0%. Not passed'
      );
      expect(problems).toEqual([]);
      await page.close();
    },
    90_000
  );

  testIf(reactiveLms !== null)(
    'a partial score below the pass mark fails',
    async () => {
      // 2 of 5 points = 40%: below 70%.
      const { page, frame } = await openQuizPage();
      await answer(frame, 'Bravo', ['Apple']);
      const values = await snapshot(page);
      expect(values['cmi.core.score.raw']).toBe('40');
      expect(values['cmi.core.lesson_status']).toBe('failed');
      await page.close();
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'resuming restores answers, their marking and the latest score from suspend data',
    async () => {
      const first = await openQuizPage();
      await answer(first.frame, 'Bravo', ['Apple', 'Cherry']);
      const values = await snapshot(first.page);
      const suspendData: string = values['cmi.suspend_data'] ?? '';
      expect(suspendData).toMatch(/^v2;\d+;100;/);
      await first.page.close();

      const resumed = await openQuizPage({
        values: {
          'cmi.core.lesson_status': 'passed',
          'cmi.core.lesson_location': 'quiz',
          'cmi.suspend_data': suspendData,
          'cmi.core.score.raw': '100',
          'cmi.core.entry': 'resume',
        },
      });
      expect(
        await resumed.frame.getByLabel('Bravo', { exact: true }).isChecked()
      ).toBe(true);
      expect(
        await resumed.frame.getByLabel('Bravo', { exact: true }).isDisabled()
      ).toBe(true);
      expect(
        await resumed.frame.locator('.lpm-question.is-correct').count()
      ).toBe(2);
      expect(
        await resumed.frame
          .getByRole('button', { name: 'Try again' })
          .isVisible()
      ).toBe(true);
      expect(
        await resumed.frame.locator('#lpm-quiz-summary').textContent()
      ).toContain('Passed');
      // The LMS still says passed.
      expect((await snapshot(resumed.page))['cmi.core.lesson_status']).toBe(
        'passed'
      );
      expect(resumed.problems).toEqual([]);
      await resumed.page.close();
    },
    90_000
  );
});
