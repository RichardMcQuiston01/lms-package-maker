import { afterAll, beforeAll, describe, expect } from 'bun:test';
import { cmi5Exporter } from '@richardmcquiston01/lms-package-maker-exporter-cmi5';
import type { PackageFiles } from '@richardmcquiston01/lms-package-maker-exporters';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import type { Browser, Page } from 'playwright-core';
import { launchBrowser } from './browser';
import { sampleCourse } from './fixtures';
import { loadReactiveLms, testIf, type ReactiveLms } from './reactiveLms';
import { StandInCmi5Lms, type Cmi5LaunchSetup } from './standInCmi5Lms';

// Gated like the other browser tests: they run where the pinned checkout and
// Chromium are installed (CI), and are skipped locally otherwise.
const reactiveLms: ReactiveLms | null = await loadReactiveLms();

const ACTOR = {
  objectType: 'Agent',
  account: { homePage: 'https://lms.example.com', name: 'learner-1' },
};
const REGISTRATION = '3b6c1f0e-8f0a-4c3e-9a55-1f2b3c4d5e6f';
const ACTIVITY = 'https://lms.example.com/aus/1';

const quizCourse: CourseModel = {
  modelVersion: 1,
  id: 'quiz-course-cmi5',
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

const RETURNED = '/returned.html';

function build(course: CourseModel): PackageFiles {
  const exported = cmi5Exporter.export(course);
  if (!exported.ok) {
    throw new Error(exported.errors.join('; '));
  }
  const files = new Map(exported.value);
  files.set(
    RETURNED,
    new TextEncoder().encode('<p id="back">back in the LMS</p>')
  );
  return files;
}

const viewAllFiles: PackageFiles = build(sampleCourse);
const quizFiles: PackageFiles = build(quizCourse);
let browser: Browser | null = null;
let lms: StandInCmi5Lms | null = null;
const packageServers: { stop(force: boolean): Promise<void> }[] = [];

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.xml': 'application/xml',
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

let sessionCounter = 0;

function newLms(): StandInCmi5Lms {
  return new StandInCmi5Lms();
}

function prepare(
  server: StandInCmi5Lms,
  origin: string,
  extra: Partial<Cmi5LaunchSetup> = {}
): void {
  sessionCounter += 1;
  server.prepareLaunch({
    actor: ACTOR,
    registration: REGISTRATION,
    activityId: ACTIVITY,
    publisherId: 'urn:lms-package-maker:au:test',
    sessionId: `session-${sessionCounter}`,
    returnURL: `${origin}${RETURNED}`,
    ...extra,
  });
}

/** Opens the AU the way a cmi5 LMS launches it. */
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

async function received(server: StandInCmi5Lms, count: number): Promise<void> {
  const deadline: number = Date.now() + 5000;
  while (server.statements.length < count && Date.now() < deadline) {
    await Bun.sleep(25);
  }
  expect(server.statements.length).toBeGreaterThanOrEqual(count);
}

async function exitCourse(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Exit course' }).click();
}

describe('cmi5 package against a stand-in cmi5 LMS', () => {
  testIf(reactiveLms !== null)(
    'a view-all course completes, terminates on Exit and returns to the LMS',
    async () => {
      lms = newLms();
      const origin = servePackage(viewAllFiles);
      prepare(lms, origin, { moveOn: 'Completed' });
      const { page, problems } = await launch(origin, lms.launchQuery());
      await received(lms, 1);
      await page.locator('[data-action="next"]').click();
      await page.locator('[data-action="next"]').click();
      await received(lms, 2);
      await exitCourse(page);
      await page.waitForURL(`${origin}${RETURNED}`);
      expect(lms.verbs()).toEqual(['initialized', 'completed', 'terminated']);
      const [initialized, completed, terminated] = lms.statements;
      expect(initialized?.statement['object']['id']).toBe(ACTIVITY);
      expect(completed?.statement['result']).toEqual({
        completion: true,
        duration: expect.stringMatching(/^PT\d+H\d+M\d+\.\d\dS$/),
      });
      expect(terminated?.statement['result']['duration']).toMatch(/^PT/);
      expect(lms.savedState()).toMatchObject({
        completedSent: true,
        passedSent: false,
        status: 'completed',
      });
      expect(lms.violations).toEqual([]);
      expect(problems).toEqual([]);
      await page.close();
      await lms.stop();
      lms = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'quiz: every attempt is on record, passed is sent once, and nothing contradicts it later',
    async () => {
      lms = newLms();
      const origin = servePackage(quizFiles);
      prepare(lms, origin, { masteryScore: 0.7, moveOn: 'Passed' });
      const first = await launch(origin, lms.launchQuery());
      await first.page.getByLabel('Alpha', { exact: true }).check();
      await first.page.getByRole('button', { name: 'Submit answers' }).click();
      await first.page.getByRole('button', { name: 'Try again' }).click();
      await first.page.getByLabel('Bravo', { exact: true }).check();
      await first.page.getByRole('button', { name: 'Submit answers' }).click();
      // a worse attempt after the pass
      await first.page.getByRole('button', { name: 'Try again' }).click();
      await first.page.getByLabel('Alpha', { exact: true }).check();
      await first.page.getByRole('button', { name: 'Submit answers' }).click();
      await received(lms, 5);
      await exitCourse(first.page);
      await first.page.waitForURL(`${origin}${RETURNED}`);
      expect(lms.verbs()).toEqual([
        'initialized',
        'scored',
        'scored',
        'passed',
        'scored',
        'terminated',
      ]);
      const passed = lms.statements.find((s) => s.verb === 'passed');
      expect(passed?.statement['result']).toMatchObject({
        success: true,
        score: { raw: 100, min: 0, max: 100, scaled: 1 },
      });
      expect(
        lms.statements
          .filter((s) => s.verb === 'scored')
          .map((s) => s.statement['result']['score']['raw'])
      ).toEqual([0, 100, 0]);
      expect(lms.violations).toEqual([]);
      expect(first.problems).toEqual([]);
      await first.page.close();

      // a later session of the same registration: a fail cannot follow the pass
      prepare(lms, origin, { masteryScore: 0.7, moveOn: 'Passed' });
      const before = lms.statements.length;
      const second = await launch(origin, lms.launchQuery());
      // the answers of the earlier session are restored, so retry first
      await second.page.getByRole('button', { name: 'Try again' }).click();
      await second.page.getByLabel('Alpha', { exact: true }).check();
      await second.page.getByRole('button', { name: 'Submit answers' }).click();
      await received(lms, before + 2);
      await exitCourse(second.page);
      await second.page.waitForURL(`${origin}${RETURNED}`);
      expect(lms.sessionVerbs()).toEqual([
        'initialized',
        'scored',
        'terminated',
      ]);
      expect(lms.violations).toEqual([]);
      expect(second.problems).toEqual([]);
      await second.page.close();
      await lms.stop();
      lms = null;
    },
    90_000
  );

  testIf(reactiveLms !== null)(
    'a failed attempt is sent as failed when the session ends',
    async () => {
      lms = newLms();
      const origin = servePackage(quizFiles);
      prepare(lms, origin, { masteryScore: 0.7 });
      const { page, problems } = await launch(origin, lms.launchQuery());
      await page.getByLabel('Alpha', { exact: true }).check();
      await page.getByRole('button', { name: 'Submit answers' }).click();
      await received(lms, 2);
      expect(lms.verbs()).toEqual(['initialized', 'scored']);
      await exitCourse(page);
      await page.waitForURL(`${origin}${RETURNED}`);
      expect(lms.verbs()).toEqual([
        'initialized',
        'scored',
        'failed',
        'terminated',
      ]);
      expect(lms.statements[2]?.statement['result']).toMatchObject({
        success: false,
        score: { raw: 0, scaled: 0 },
      });
      expect(lms.violations).toEqual([]);
      expect(problems).toEqual([]);
      await page.close();
      await lms.stop();
      lms = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'closing the window ends the session too',
    async () => {
      lms = newLms();
      const origin = servePackage(viewAllFiles);
      prepare(lms, origin, { moveOn: 'Completed' });
      const { page } = await launch(origin, lms.launchQuery());
      await received(lms, 1);
      await page.evaluate(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      await received(lms, 2);
      expect(lms.verbs()).toEqual(['initialized', 'terminated']);
      expect(lms.violations).toEqual([]);
      await page.close();
      await lms.stop();
      lms = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'Browse and Review modes send only initialized and terminated',
    async () => {
      for (const mode of ['Browse', 'Review'] as const) {
        lms = newLms();
        const origin = servePackage(quizFiles);
        prepare(lms, origin, { launchMode: mode, masteryScore: 0.7 });
        const { page, problems } = await launch(origin, lms.launchQuery());
        await page.getByLabel('Bravo', { exact: true }).check();
        await page.getByRole('button', { name: 'Submit answers' }).click();
        await exitCourse(page);
        await page.waitForURL(`${origin}${RETURNED}`);
        expect(lms.verbs()).toEqual(['initialized', 'terminated']);
        expect(lms.violations).toEqual([]);
        expect(problems).toEqual([]);
        await page.close();
        await lms.stop();
        lms = null;
      }
    },
    90_000
  );

  testIf(reactiveLms !== null)(
    'opened without launch parameters it runs on its own and sends nothing',
    async () => {
      lms = newLms();
      const origin = servePackage(viewAllFiles);
      prepare(lms, origin);
      const { page, problems } = await launch(origin, null);
      await page.locator('[data-action="next"]').click();
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
    'a used fetch address is explained on the page, and nothing is sent',
    async () => {
      lms = newLms();
      const origin = servePackage(viewAllFiles);
      prepare(lms, origin);
      const query = lms.launchQuery();
      // someone else already used the one-time address
      await fetch(lms.fetchUrl, { method: 'POST' });
      const { page } = await launch(origin, query);
      expect(await page.getByRole('alert').textContent()).toContain(
        'already been returned'
      );
      expect(lms.statements).toEqual([]);
      await page.close();
      await lms.stop();
      lms = null;
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'the stand-in is strict: it refuses a passed statement without a duration',
    async () => {
      lms = newLms();
      const origin = servePackage(viewAllFiles);
      prepare(lms, origin);
      const { page } = await launch(origin, lms.launchQuery());
      await received(lms, 1);
      const status: number = await page.evaluate(
        async ([
          endpoint,
          token,
          activityId,
          registration,
          sessionId,
          publisher,
        ]) => {
          const response = await fetch(`${endpoint}/statements`, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${token}`,
              'Content-Type': 'application/json',
              'X-Experience-API-Version': '1.0.3',
            },
            body: JSON.stringify({
              id: crypto.randomUUID(),
              actor: {
                objectType: 'Agent',
                account: {
                  homePage: 'https://lms.example.com',
                  name: 'learner-1',
                },
              },
              verb: { id: 'http://adlnet.gov/expapi/verbs/passed' },
              object: { objectType: 'Activity', id: activityId },
              result: { success: true },
              context: {
                registration,
                extensions: {
                  'https://w3id.org/xapi/cmi5/context/extensions/sessionid':
                    sessionId,
                },
                contextActivities: {
                  grouping: [{ id: publisher }],
                  category: [
                    {
                      id: 'https://w3id.org/xapi/cmi5/context/categories/cmi5',
                    },
                    {
                      id: 'https://w3id.org/xapi/cmi5/context/categories/moveon',
                    },
                  ],
                },
              },
              timestamp: new Date().toISOString(),
            }),
          });
          return response.status;
        },
        [
          lms.endpoint,
          lms.token,
          ACTIVITY,
          REGISTRATION,
          `session-${sessionCounter}`,
          'urn:lms-package-maker:au:test',
        ]
      );
      expect(status).toBe(400);
      expect(lms.violations.join('\n')).toContain(
        'passed must have an ISO 8601 result.duration'
      );
      await page.close();
      await lms.stop();
      lms = null;
    },
    60_000
  );
});
