import { expect } from 'bun:test';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { e2eTest, launchBrowser, startApp, type RunningApp } from './appServer';
import { createCourse, editAndPreview, exportPackage } from './flows';

const PROXY_SECRET = 'proxy-secret-for-the-browser-test';

e2eTest(
  'header mode: only requests carrying the proxy secret are signed in',
  async (): Promise<void> => {
    const app: RunningApp = await startApp({
      IDENTITY_PROVIDER: 'header',
      IDENTITY_PROXY_SECRET: PROXY_SECRET,
      IDENTITY_SIGN_IN_URL: 'https://login.example.test/start',
    });
    const browser: Browser = await launchBrowser();
    try {
      // someone who reaches the app directly and forges the user header
      const forged: Response = await fetch(`${app.baseUrl}/api/projects`, {
        headers: { 'x-forwarded-user': 'ada.lovelace@example.com' },
      });
      expect(forged.status).toBe(401);

      // the proxy's own requests carry the secret
      const context: BrowserContext = await browser.newContext({
        acceptDownloads: true,
        extraHTTPHeaders: {
          'x-identity-proxy-secret': PROXY_SECRET,
          'x-forwarded-user': `ada.lovelace.${crypto.randomUUID()}@example.com`,
          'x-forwarded-preferred-username': 'Ada Lovelace',
        },
      });
      const page: Page = await context.newPage();
      await page.goto(`${app.baseUrl}/`);
      await page.getByText('Ada Lovelace').first().waitFor();
      // sign-out belongs to the proxy, and the built-in pages are off
      expect(await page.getByRole('button', { name: 'Sign out' }).count()).toBe(
        0
      );
      expect((await fetch(`${app.baseUrl}/sign-in`)).status).toBe(404);

      await createCourse(page, app.baseUrl, 'From the proxy');
      await editAndPreview(page, 'Hello from header mode');
      const exported = await exportPackage(page, 'Export SCORM 1.2');
      expect(exported.fileName).toMatch(/\.zip$/);
    } finally {
      await browser.close();
      await app.stop();
    }
  },
  120_000
);

e2eTest(
  'single-user mode: no sign-in, one named author',
  async (): Promise<void> => {
    const app: RunningApp = await startApp({
      IDENTITY_PROVIDER: 'single-user',
      IDENTITY_SINGLE_USER_ACKNOWLEDGED: 'true',
      SINGLE_USER_NAME: 'Solo Author',
    });
    const browser: Browser = await launchBrowser();
    try {
      const page: Page = await (
        await browser.newContext({ acceptDownloads: true })
      ).newPage();
      await page.goto(`${app.baseUrl}/`);
      await page.getByText('Solo Author').first().waitFor();
      await createCourse(page, app.baseUrl, 'Solo course');
      await editAndPreview(page, 'Hello from single-user mode');
      expect((await fetch(`${app.baseUrl}/sign-up`)).status).toBe(404);
    } finally {
      await browser.close();
      await app.stop();
    }
  },
  120_000
);
