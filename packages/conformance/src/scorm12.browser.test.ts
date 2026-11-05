import { afterAll, beforeAll, describe, expect } from 'bun:test';
import { scorm12Exporter } from '@richardmcquiston01/lms-package-maker-exporter-scorm12';
import type { PackageFiles } from '@richardmcquiston01/lms-package-maker-exporters';
import type { Browser, Page } from 'playwright-core';
import { bundleCmiHost, HOST_URL, launchBrowser, serve } from './browser';
import { sampleCourse } from './fixtures';
import { loadReactiveLms, testIf, type ReactiveLms } from './reactiveLms';

const reactiveLms: ReactiveLms | null = await loadReactiveLms();
const exported = scorm12Exporter.export(sampleCourse);
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

interface Launch {
  readonly page: Page;
  readonly problems: string[];
}

/** Opens the package in a frame whose parent exposes reactive-lms' CmiStore. */
async function launch(seed: Record<string, unknown>): Promise<Launch> {
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
  const seedAttribute: string = JSON.stringify(seed).replace(/"/g, '&quot;');
  const host = `<script data-seed="${seedAttribute}">${cmiHostScript.replace(/<\/script/gi, '<\\/script')}</script><iframe id="f" src="/index.html" width="900" height="600"></iframe>`;
  await serve(page, host, packageFiles);
  await page.goto(HOST_URL);
  await page.frameLocator('#f').locator('[data-action="next"]').waitFor();
  return { page, problems };
}

const snapshot = (page: Page): Promise<Record<string, string>> =>
  page.evaluate(() => (window as any).__store.snapshot());

describe('SCORM 1.2 package against the real reactive-lms CmiStore', () => {
  testIf(reactiveLms !== null)(
    'a first launch ends completed with bookmark and suspend data',
    async () => {
      const lms = reactiveLms as ReactiveLms;
      const { page, problems } = await launch({});
      const frame = page.frameLocator('#f');
      expect((await snapshot(page))['cmi.core.lesson_status']).toBe(
        'incomplete'
      );
      await frame.locator('[data-action="next"]').click();
      await frame.locator('[data-action="next"]').click();
      await page.evaluate(() =>
        (
          document.getElementById('f') as HTMLIFrameElement
        ).contentWindow?.dispatchEvent(new Event('pagehide'))
      );
      const values = await snapshot(page);
      const progress = lms.mapCmiToProgress(values, {
        registrationId: 'r1',
        courseModuleId: 'c1',
        activityNodeId: 'a1',
      });
      expect(progress['completionStatus']).toBe('completed');
      expect(progress['location']).toBe('p3');
      expect(progress['suspendData']).toBe('111');
      expect(
        await page.evaluate(() => (window as any).__store.isFinished())
      ).toBe(true);
      expect(problems).toEqual([]);
      await page.close();
    },
    60_000
  );

  testIf(reactiveLms !== null)(
    'a resumed launch starts at the stored page and keeps its progress',
    async () => {
      const lms = reactiveLms as ReactiveLms;
      const { page, problems } = await launch({
        values: {
          'cmi.core.lesson_status': 'incomplete',
          'cmi.core.lesson_location': 'p2',
          'cmi.suspend_data': '110',
          'cmi.core.entry': 'resume',
        },
      });
      const frame = page.frameLocator('#f');
      expect(await frame.locator('#lpm-status').textContent()).toBe(
        'Page 2 of 3'
      );
      await frame.locator('[data-action="next"]').click();
      const progress = lms.mapCmiToProgress(await snapshot(page), {
        registrationId: 'r1',
        courseModuleId: 'c1',
        activityNodeId: 'a1',
      });
      expect(progress['completionStatus']).toBe('completed');
      expect(problems).toEqual([]);
      await page.close();
    },
    60_000
  );
});
