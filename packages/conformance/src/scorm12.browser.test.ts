import { afterAll, beforeAll, describe, expect } from 'bun:test';
import { scorm12Exporter } from '@richardmcquiston01/lms-package-maker-exporter-scorm12';
import type { PackageFiles } from '@richardmcquiston01/lms-package-maker-exporters';
import type { Browser, Page } from 'playwright-core';
import {
  bundleCmiHost,
  launchBrowser,
  openWithCmiStore,
  type OpenedPackage,
} from './browser';
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

const launch = (seed: Record<string, unknown>): Promise<OpenedPackage> =>
  openWithCmiStore(browser as Browser, cmiHostScript, packageFiles, seed);

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
      expect(progress['suspendData']).toBe('v2;111;-;');
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
          'cmi.suspend_data': 'v2;110;-;',
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

  testIf(reactiveLms !== null)(
    'Exit course ends the session: session time is saved and the page says so',
    async () => {
      const { page, problems } = await launch({});
      const frame = page.frameLocator('#f');
      await frame.locator('[data-action="next"]').click();
      await frame.getByRole('button', { name: 'Exit course' }).click();
      await frame
        .locator('#lpm-status')
        .getByText('The session has ended')
        .waitFor();
      const values = await snapshot(page);
      expect(values['cmi.core.session_time']).toMatch(/^\d\d:\d\d:\d\d/);
      expect(values['cmi.core.exit']).toBe('suspend');
      expect(
        await frame.getByRole('button', { name: 'Exit course' }).isDisabled()
      ).toBe(true);
      expect(problems).toEqual([]);
      await page.close();
    },
    60_000
  );
});
