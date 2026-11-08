import { afterAll, beforeAll, describe, expect } from 'bun:test';
import { aiccExporter } from '@richardmcquiston01/lms-package-maker-exporter-aicc';
import type { PackageFiles } from '@richardmcquiston01/lms-package-maker-exporters';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import type { Browser, Page } from 'playwright-core';
import { launchBrowser } from './browser';
import { sampleCourse } from './fixtures';
import { loadReactiveLms, testIf, type ReactiveLms } from './reactiveLms';
import { StandInAiccLms } from './standInAiccLms';

// Gated like the other browser tests: they run where the pinned checkout and
// Chromium are installed (CI), and are skipped locally otherwise.
const reactiveLms: ReactiveLms | null = await loadReactiveLms();

const quizCourse: CourseModel = {
  modelVersion: 1,
  id: 'quiz-course-aicc',
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
  const exported = aiccExporter.export(course);
  if (!exported.ok) {
    throw new Error(exported.errors.join('; '));
  }
  return exported.value;
}

const viewAllFiles: PackageFiles = build(sampleCourse);
const quizFiles: PackageFiles = build(quizCourse);
let browser: Browser | null = null;
let lms: StandInAiccLms | null = null;
const packageServers: { stop(force: boolean): Promise<void> }[] = [];

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

/** Serves the package from its own loopback port, so the page and the LMS differ in origin. */
function servePackage(files: PackageFiles): string {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (request: Request): Response => {
      const name: string = new URL(request.url).pathname.slice(1);
      const content: Uint8Array | undefined = files.get(name);
      if (content === undefined) {
        return new Response(`not in package: ${name}`, { status: 404 });
      }
      const extension: string = name.slice(name.lastIndexOf('.'));
      return new Response(content, {
        headers: {
          'Content-Type':
            CONTENT_TYPES[extension] ?? 'application/octet-stream',
        },
      });
    },
  });
  packageServers.push(server);
  return `http://127.0.0.1:${server.port}`;
}

beforeAll(async (): Promise<void> => {
  if (reactiveLms !== null) {
    browser = await launchBrowser();
  }
});
afterAll(async (): Promise<void> => {
  await browser?.close();
  await lms?.stop();
  for (const server of packageServers) {
    await server.stop(true);
  }
});

async function launch(
  origin: string,
  query: Record<string, string> | null
): Promise<{ page: Page; problems: string[] }> {
  const page: Page = await (browser as Browser).newPage();
  const problems: string[] = [];
  page.on('console', (message): void => {
    if (message.text().includes('[lms-package]')) {
      problems.push(message.text());
    }
  });
  page.on('pageerror', (error): void => {
    problems.push(error.message);
  });
  const search: string =
    query === null ? '' : `?${new URLSearchParams(query).toString()}`;
  await page.goto(`${origin}/index.html${search}`);
  await page.locator('[data-action="next"]').waitFor();
  return { page, problems };
}

const leave = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
};

async function until(condition: () => boolean): Promise<void> {
  const deadline: number = Date.now() + 5000;
  while (!condition() && Date.now() < deadline) {
    await Bun.sleep(25);
  }
  expect(condition()).toBe(true);
}

describe('AICC package against a stand-in AICC LMS', () => {
  testIf(reactiveLms !== null)(
    'GetParam on start, PutParam as the learner progresses, then a last PutParam and ExitAU',
    async () => {
      lms = new StandInAiccLms();
      const origin = servePackage(viewAllFiles);
      const { page, problems } = await launch(origin, lms.launch('session-1'));
      await page.locator('[data-action="next"]').click();
      await page.locator('[data-action="next"]').click();
      await leave(page);
      await until(() => lms?.commands().at(-1) === 'ExitAU');
      const commands = lms.commands();
      expect(commands[0]).toBe('GetParam');
      expect(commands.slice(-2)).toEqual(['PutParam', 'ExitAU']);
      expect(commands.slice(1, -2).every((c) => c === 'PutParam')).toBe(true);
      expect(lms.learner).toMatchObject({
        status: 'Completed',
        location: 'p3',
        suspendData: 'v2;111;-;',
      });
      expect(lms.learner.time).toMatch(/^\d\d:\d\d:\d\d$/);
      expect(lms.violations).toEqual([]);
      expect(problems).toEqual([]);
      await page.close();

      // the same learner comes back in a new session and is where they were
      const again = await launch(origin, lms.launch('session-2'));
      expect(await again.page.locator('#lpm-status').textContent()).toBe(
        'Course complete.'
      );
      expect(
        await again.page
          .locator('.lpm-page:not([hidden])')
          .getAttribute('aria-label')
      ).toBe('Three');
      expect(lms.violations).toEqual([]);
      expect(again.problems).toEqual([]);
      await again.page.close();
      await lms.stop();
      lms = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'an unfinished attempt leaves with the Suspend flag',
    async () => {
      lms = new StandInAiccLms();
      const origin = servePackage(viewAllFiles);
      const { page } = await launch(origin, lms.launch('session-1'));
      await leave(page);
      await until(() => lms?.commands().at(-1) === 'ExitAU');
      const lastPut = lms.requests
        .filter((r) => r.command === 'PutParam')
        .at(-1);
      expect(lastPut?.form['aicc_data']).toContain(
        'Lesson_Status=Incomplete,Suspend'
      );
      expect(lms.violations).toEqual([]);
      await page.close();
      await lms.stop();
      lms = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'quiz: the score and the latest result reach the LMS, and a later fail replaces a pass',
    async () => {
      lms = new StandInAiccLms();
      lms.masteryScore = 70;
      const origin = servePackage(quizFiles);
      const first = await launch(origin, lms.launch('session-1'));
      await first.page.getByLabel('Alpha', { exact: true }).check();
      await first.page.getByRole('button', { name: 'Submit answers' }).click();
      await until(() => lms?.learner.status === 'Failed');
      expect(lms.learner.score).toBe('0,100,0');
      await first.page.getByRole('button', { name: 'Try again' }).click();
      await first.page.getByLabel('Bravo', { exact: true }).check();
      await first.page.getByRole('button', { name: 'Submit answers' }).click();
      await until(() => lms?.learner.status === 'Passed');
      expect(lms.learner.score).toBe('100,100,0');
      await leave(first.page);
      await until(() => lms?.commands().at(-1) === 'ExitAU');
      expect(lms.violations).toEqual([]);
      expect(first.problems).toEqual([]);
      await first.page.close();

      // the content reports each attempt as it happened; a worse one replaces the pass
      const second = await launch(origin, lms.launch('session-2'));
      await second.page.getByRole('button', { name: 'Try again' }).click();
      await second.page.getByLabel('Alpha', { exact: true }).check();
      await second.page.getByRole('button', { name: 'Submit answers' }).click();
      await until(() => lms?.learner.status === 'Failed');
      expect(lms.violations).toEqual([]);
      await second.page.close();
      await lms.stop();
      lms = null;
    },
    90_000
  );

  testIf(reactiveLms !== null)(
    'opened without launch parameters it runs on its own and sends nothing',
    async () => {
      lms = new StandInAiccLms();
      const origin = servePackage(viewAllFiles);
      const { page, problems } = await launch(origin, null);
      await page.locator('[data-action="next"]').click();
      await leave(page);
      await Bun.sleep(200);
      expect(lms.requests).toEqual([]);
      expect(problems).toEqual([]);
      await page.close();
      await lms.stop();
      lms = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'a half launch and a refusal by the LMS are explained on the page',
    async () => {
      lms = new StandInAiccLms();
      const origin = servePackage(viewAllFiles);
      const half = await launch(origin, { AICC_SID: 'session-1' });
      expect(await half.page.getByRole('alert').textContent()).toContain(
        'AICC_URL is missing'
      );
      await half.page.close();

      // a session the LMS does not know: error=3
      const unknown = await launch(origin, {
        AICC_SID: 'nobody',
        AICC_URL: lms.url,
      });
      expect(await unknown.page.getByRole('alert').textContent()).toContain(
        'Invalid Session ID'
      );
      expect(lms.commands()).toEqual(['GetParam']);
      await unknown.page.close();
      await lms.stop();
      lms = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'the stand-in is strict: it refuses a status that is not an AICC status',
    async () => {
      lms = new StandInAiccLms();
      const origin = servePackage(viewAllFiles);
      const query = lms.launch('session-1');
      const { page } = await launch(origin, query);
      const answer: string = await page.evaluate(
        async ([url, session]) => {
          const response = await fetch(url as string, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              command: 'PutParam',
              version: '3.5',
              session_id: session as string,
              aicc_data: '[Core]\r\nLesson_Status=done\r\n',
            }).toString(),
          });
          return response.text();
        },
        [lms.url, 'session-1']
      );
      expect(answer).toContain('error=1');
      expect(lms.violations.join('\n')).toContain(
        "Lesson_Status 'done' is not an AICC status"
      );
      await page.close();
      await lms.stop();
      lms = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'Exit course sends the last PutParam and ExitAU before the page says the session is over',
    async () => {
      lms = new StandInAiccLms();
      const origin = servePackage(viewAllFiles);
      const { page, problems } = await launch(origin, lms.launch('session-1'));
      await page.locator('[data-action="next"]').click();
      await page.locator('[data-action="next"]').click();
      await page.getByRole('button', { name: 'Exit course' }).click();
      await page
        .locator('#lpm-status')
        .getByText('The session has ended')
        .waitFor();
      expect(lms.commands().slice(-2)).toEqual(['PutParam', 'ExitAU']);
      expect(lms.learner.status).toBe('Completed');
      // closing the window afterwards sends nothing more
      const before = lms.requests.length;
      await leave(page);
      await Bun.sleep(150);
      expect(lms.requests.length).toBe(before);
      expect(lms.violations).toEqual([]);
      expect(problems).toEqual([]);
      await page.close();
      await lms.stop();
      lms = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'a window the LMS opened closes itself after Exit course',
    async () => {
      lms = new StandInAiccLms();
      const origin = servePackage(viewAllFiles);
      const query = new URLSearchParams(lms.launch('session-1')).toString();
      const launcher: Page = await (browser as Browser).newPage();
      // a page that opens the course in a new window, as an LMS does
      await launcher.route(`${origin}/launcher.html`, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<button onclick="window.open('${origin}/index.html?${query}')">Launch</button>`,
        })
      );
      await launcher.goto(`${origin}/launcher.html`);
      const [popup] = await Promise.all([
        launcher.waitForEvent('popup'),
        launcher.getByRole('button', { name: 'Launch' }).click(),
      ]);
      await popup.locator('[data-action="next"]').waitFor();
      const closed = popup.waitForEvent('close');
      await popup.getByRole('button', { name: 'Exit course' }).click();
      await closed;
      expect(lms.commands().slice(-2)).toEqual(['PutParam', 'ExitAU']);
      expect(lms.violations).toEqual([]);
      await launcher.close();
      await lms.stop();
      lms = null;
    },
    60_000
  );
});
