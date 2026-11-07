import { afterAll, beforeAll, describe, expect } from 'bun:test';
import { xapiExporter } from '@richardmcquiston01/lms-package-maker-exporter-xapi';
import type { PackageFiles } from '@richardmcquiston01/lms-package-maker-exporters';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import type { Browser, FrameLocator, Page } from 'playwright-core';
import { launchBrowser } from './browser';
import { sampleCourse } from './fixtures';
import { loadReactiveLms, testIf, type ReactiveLms } from './reactiveLms';
import { StandInLrs } from './standInLrs';

// Gated like the other browser tests: they run where the pinned checkout and
// Chromium are installed (CI), and are skipped locally otherwise.
const reactiveLms: ReactiveLms | null = await loadReactiveLms();

const AUTH = 'Basic bGVhcm5lcjpzZWNyZXQ=';
const ACTOR = {
  objectType: 'Agent',
  name: 'Ada Lovelace',
  mbox: 'mailto:ada@example.com',
};
const REGISTRATION = '3b6c1f0e-8f0a-4c3e-9a55-1f2b3c4d5e6f';

const quizCourse: CourseModel = {
  modelVersion: 1,
  id: 'quiz-course-xapi',
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
  const exported = xapiExporter.export(course);
  if (!exported.ok) {
    throw new Error(exported.errors.join('; '));
  }
  return exported.value;
}

const viewAllFiles: PackageFiles = build(sampleCourse);
const quizFiles: PackageFiles = build(quizCourse);
let browser: Browser | null = null;
let lrs: StandInLrs | null = null;
const packageServers: { stop(force: boolean): Promise<void> }[] = [];

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.xml': 'application/xml',
};

/**
 * Serves the package from its own loopback port, so the page and the LRS are
 * different origins and the browser really performs the CORS preflight.
 */
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
  await lrs?.stop();
  for (const server of packageServers) {
    await server.stop(true);
  }
});

/** Opens the package the way an LRS launches it: with the TinCan query. */
async function launch(
  files: PackageFiles,
  query: Record<string, string> | null,
  ready: 'player' | 'status' = 'player'
): Promise<{ page: Page; frame: FrameLocator; problems: string[] }> {
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
  const origin: string = servePackage(files);
  const search: string =
    query === null ? '' : `?${new URLSearchParams(query).toString()}`;
  await page.goto(`${origin}/index.html${search}`);
  if (ready === 'player') {
    await page.locator('[data-action="next"]').waitFor();
  } else {
    await page.locator('#lpm-status').waitFor();
  }
  return { page, frame: page.mainFrame() as unknown as FrameLocator, problems };
}

function launchQuery(server: StandInLrs): Record<string, string> {
  return {
    endpoint: server.endpoint,
    auth: AUTH,
    actor: JSON.stringify(ACTOR),
    registration: REGISTRATION,
  };
}

const leave = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
};

/** Waits until the LRS has received `count` statements. */
async function statementsReceived(
  server: StandInLrs,
  count: number
): Promise<void> {
  const deadline: number = Date.now() + 5000;
  while (server.statements.length < count && Date.now() < deadline) {
    await Bun.sleep(25);
  }
  expect(server.statements.length).toBeGreaterThanOrEqual(count);
}

describe('xAPI package against a stand-in LRS', () => {
  testIf(reactiveLms !== null)(
    'launched with TinCan parameters it sends statements and saves progress',
    async () => {
      lrs = new StandInLrs(AUTH);
      const { page, problems } = await launch(viewAllFiles, launchQuery(lrs));
      await statementsReceived(lrs, 1);
      expect(lrs.verbs()).toEqual(['initialized']);

      await page.locator('[data-action="next"]').click();
      await page.locator('[data-action="next"]').click();
      await statementsReceived(lrs, 2);
      await leave(page);
      await statementsReceived(lrs, 3);
      expect(lrs.verbs()).toEqual(['initialized', 'completed', 'terminated']);

      const [initialized, completed, terminated] = lrs.statements;
      expect(initialized?.statement['actor']).toEqual(ACTOR);
      expect(initialized?.statement['object']['id']).toBe(
        'urn:lms-package-maker:course:conformance-course'
      );
      expect(initialized?.statement['context']['registration']).toBe(
        REGISTRATION
      );
      expect(completed?.statement['result']).toEqual({ completion: true });
      expect(terminated?.statement['result']['duration']).toMatch(
        /^PT\d+H\d+M\d+\.\d\dS$/
      );

      // Progress is in the LRS State API, so a second launch resumes.
      await Bun.sleep(100);
      expect(lrs.savedState()).toMatchObject({
        location: 'p3',
        suspendData: 'v2;111;-;',
        status: 'completed',
        progress: 1,
      });
      expect(lrs.violations).toEqual([]);
      expect(problems).toEqual([]);
      await page.close();

      const resumed = await launch(viewAllFiles, launchQuery(lrs));
      expect(await resumed.page.locator('#lpm-status').textContent()).toBe(
        'Course complete.'
      );
      expect(
        await resumed.page
          .locator('.lpm-page:not([hidden])')
          .getAttribute('aria-label')
      ).toBe('Three');
      expect(lrs.violations).toEqual([]);
      expect(resumed.problems).toEqual([]);
      await resumed.page.close();
      await lrs.stop();
      lrs = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'quiz attempts are reported as scored, then failed or passed, with a scaled score',
    async () => {
      lrs = new StandInLrs(AUTH);
      const { page, problems } = await launch(quizFiles, launchQuery(lrs));
      await page.getByLabel('Alpha', { exact: true }).check();
      await page.getByRole('button', { name: 'Submit answers' }).click();
      await statementsReceived(lrs, 3);
      await page.getByRole('button', { name: 'Try again' }).click();
      await page.getByLabel('Bravo', { exact: true }).check();
      await page.getByRole('button', { name: 'Submit answers' }).click();
      await statementsReceived(lrs, 5);
      expect(lrs.verbs()).toEqual([
        'initialized',
        'scored',
        'failed',
        'scored',
        'passed',
      ]);
      const [, , failed, , passed] = lrs.statements;
      expect(failed?.statement['result']).toEqual({
        success: false,
        score: { raw: 0, min: 0, max: 100, scaled: 0 },
      });
      expect(passed?.statement['result']).toEqual({
        completion: true,
        success: true,
        score: { raw: 100, min: 0, max: 100, scaled: 1 },
      });
      expect(lrs.violations).toEqual([]);
      expect(problems).toEqual([]);
      await page.close();
      await lrs.stop();
      lrs = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'opened without launch parameters it runs on its own and sends nothing',
    async () => {
      lrs = new StandInLrs(AUTH);
      const { page, problems } = await launch(viewAllFiles, null);
      await page.locator('[data-action="next"]').click();
      await leave(page);
      await Bun.sleep(200);
      expect(lrs.requests).toEqual([]);
      expect(problems).toEqual([]);
      await page.close();
      await lrs.stop();
      lrs = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'a broken launch is explained on the page and the course still works',
    async () => {
      lrs = new StandInLrs(AUTH);
      const { page } = await launch(
        viewAllFiles,
        { endpoint: lrs.endpoint, auth: AUTH },
        'status'
      );
      await page.locator('[data-action="next"]').waitFor();
      expect(await page.getByRole('alert').textContent()).toContain(
        "no 'actor' parameter"
      );
      await page.locator('[data-action="next"]').click();
      expect(lrs.requests).toEqual([]);
      await page.close();
      await lrs.stop();
      lrs = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'a wrong Authorization is refused by the LRS and shown on the page',
    async () => {
      lrs = new StandInLrs(AUTH);
      const { page } = await launch(
        viewAllFiles,
        { ...launchQuery(lrs), auth: 'Basic d3Jvbmc6d3Jvbmc=' },
        'status'
      );
      await page.locator('[data-action="next"]').waitFor();
      expect(await page.getByRole('alert').textContent()).toContain('401');
      expect(lrs.statements).toEqual([]);
      await page.close();
      await lrs.stop();
      lrs = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'the stand-in LRS is strict: it refuses a malformed statement',
    async () => {
      lrs = new StandInLrs(AUTH);
      const { page } = await launch(viewAllFiles, launchQuery(lrs));
      const status: number = await page.evaluate(
        async ([endpoint, auth]) => {
          const response = await fetch(`${endpoint}/statements`, {
            method: 'POST',
            headers: {
              Authorization: auth as string,
              'Content-Type': 'application/json',
              'X-Experience-API-Version': '1.0.3',
            },
            body: JSON.stringify({ id: 'not-a-uuid', verb: { id: 'nope' } }),
          });
          return response.status;
        },
        [lrs.endpoint, AUTH]
      );
      expect(status).toBe(400);
      expect(lrs.violations.join('\n')).toContain('id must be a UUID');
      await page.close();
      await lrs.stop();
      lrs = null;
    },
    60_000
  );
});
