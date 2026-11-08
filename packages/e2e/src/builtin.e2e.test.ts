import { expect } from 'bun:test';
import { unzipSync } from 'fflate';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { e2eTest, launchBrowser, startApp, type RunningApp } from './appServer';
import { createCourse, editAndPreview, exportPackage, save } from './flows';

const TINY_PNG: Buffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

e2eTest(
  'built-in accounts: sign up, author a quiz with media, preview, export, sign out',
  async (): Promise<void> => {
    const app: RunningApp = await startApp({
      IDENTITY_PROVIDER: 'builtin',
      ALLOW_SIGN_UP: 'true',
    });
    const browser: Browser = await launchBrowser();
    const context: BrowserContext = await browser.newContext({
      acceptDownloads: true,
    });
    const page: Page = await context.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error): void => {
      problems.push(error.message);
    });
    try {
      // a signed-out visit is sent to sign in
      await page.goto(`${app.baseUrl}/`);
      expect(new URL(page.url()).pathname).toBe('/sign-in');

      await page.goto(`${app.baseUrl}/sign-up`);
      await page.getByLabel('Your name').fill('Ada');
      await page
        .getByLabel('Email')
        .fill(`ada-${crypto.randomUUID()}@example.com`);
      await page.getByLabel('Password').fill('a long enough password');
      await page.getByRole('button', { name: 'Create account' }).click();
      await page.waitForURL(`${app.baseUrl}/`);

      await createCourse(page, app.baseUrl, 'Safety Quiz');
      await editAndPreview(page, 'Welcome to safety training');

      // media: a real image is accepted, text pretending to be a PNG is not
      await page.getByLabel('Choose files to upload').setInputFiles([
        { name: 'dot.png', mimeType: 'image/png', buffer: TINY_PNG },
        {
          name: 'fake.png',
          mimeType: 'image/png',
          buffer: Buffer.from('not an image'),
        },
      ]);
      await page.getByText('dot.png').first().waitFor();
      await page
        .getByRole('alert')
        .filter({ hasText: 'not supported' })
        .waitFor();
      await page.getByPlaceholder('What the image shows').fill('A dot');
      await page
        .getByRole('button', { name: 'Insert dot.png into the page' })
        .click();
      await page.getByRole('button', { name: 'HTML', exact: true }).click();
      expect(await page.getByLabel('Page content (HTML)').inputValue()).toMatch(
        /<img src="media:[0-9a-f-]{36}" alt="A dot">/
      );
      await save(page);

      // a second page with one question; passing the quiz completes the course
      await page.getByRole('button', { name: '+ Add page' }).click();
      await page.getByLabel('Page title').fill('Quiz');
      await page.getByRole('button', { name: '+ Add question' }).click();
      await page
        .getByLabel('Question 1 text')
        .fill('Where is a hard hat worn?');
      await page.getByLabel('Question 1 choice 1 text').fill('On site');
      await page.getByLabel('Question 1 choice 2 text').fill('At home');
      await page
        .getByLabel('Complete when the learner passes the quiz')
        .check();
      await page.getByLabel('Pass mark in percent').fill('60');
      await save(page);

      const frame = page.frameLocator('iframe[title="Course preview"]');
      await frame.getByRole('button', { name: 'Quiz', exact: true }).click();
      await frame.getByLabel('At home', { exact: true }).check();
      await frame.getByRole('button', { name: 'Submit answers' }).click();
      expect(await frame.locator('#lpm-quiz-summary').textContent()).toContain(
        '0'
      );
      await frame.getByRole('button', { name: 'Try again' }).click();
      await frame.getByLabel('On site', { exact: true }).check();
      await frame.getByRole('button', { name: 'Submit answers' }).click();
      expect(await frame.locator('#lpm-quiz-summary').textContent()).toContain(
        '100'
      );

      // export: the package holds the manifest, the player and the image
      const scorm = await exportPackage(page, 'Export SCORM 1.2');
      expect(scorm.fileName).toMatch(/\.zip$/);
      const scormFiles: string[] = Object.keys(unzipSync(scorm.bytes));
      expect(scormFiles).toContain('imsmanifest.xml');
      expect(scormFiles).toContain('index.html');
      expect(scormFiles.some((name) => name.startsWith('media/'))).toBe(true);
      const scorm2004 = await exportPackage(page, 'Export SCORM 2004');
      const scorm2004Files: string[] = Object.keys(unzipSync(scorm2004.bytes));
      expect(scorm2004Files).toContain('imsmanifest.xml');
      expect(scorm2004Files).toContain('adlcp_v1p3.xsd');
      const xapi = await exportPackage(page, 'Export xAPI');
      const xapiFiles: string[] = Object.keys(unzipSync(xapi.bytes));
      expect(xapiFiles).toContain('tincan.xml');
      expect(xapiFiles.some((name) => name.startsWith('media/'))).toBe(true);
      const cmi5 = await exportPackage(page, 'Export cmi5');
      const cmi5Files: string[] = Object.keys(unzipSync(cmi5.bytes));
      expect(cmi5Files).toContain('cmi5.xml');
      expect(cmi5Files).not.toContain('tincan.xml');
      const aicc = await exportPackage(page, 'Export AICC');
      const aiccFiles: string[] = Object.keys(unzipSync(aicc.bytes));
      for (const extension of ['crs', 'au', 'des', 'cst']) {
        expect(aiccFiles).toContain(`course.${extension}`);
      }
      const html5 = await exportPackage(page, 'Export HTML5');
      expect(Object.keys(unzipSync(html5.bytes))).toContain('index.html');

      await page.goto(`${app.baseUrl}/`);
      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.waitForURL(/sign-in/);
      expect(problems).toEqual([]);
    } finally {
      await browser.close();
      await app.stop();
    }
  },
  120_000
);
