import { afterAll, beforeAll, describe, expect } from 'bun:test';
import { html5Exporter } from '@richardmcquiston01/lms-package-maker-exporter-html5';
import type { PackageFiles } from '@richardmcquiston01/lms-package-maker-exporters';
import type { Browser } from 'playwright-core';
import { HOST_URL, launchBrowser, serve } from './browser';
import { sampleCourse } from './fixtures';
import { loadReactiveLms, testIf, type ReactiveLms } from './reactiveLms';

const reactiveLms: ReactiveLms | null = await loadReactiveLms();
const exported = html5Exporter.export(sampleCourse);
if (!exported.ok) {
  throw new Error(exported.errors.join('; '));
}
const packageFiles: PackageFiles = exported.value;
let browser: Browser | null = null;

beforeAll(async (): Promise<void> => {
  if (reactiveLms !== null) {
    browser = await launchBrowser();
  }
});
afterAll(async (): Promise<void> => {
  await browser?.close();
});

describe('HTML5 package against the reactive-lms postMessage mapper', () => {
  testIf(reactiveLms !== null)(
    'progress messages map to a completed registration',
    async () => {
      const lms = reactiveLms as ReactiveLms;
      const page = await (browser as Browser).newPage();
      // Like the reactive-lms player, accept only messages from the iframe.
      const host = `<iframe id="f" src="/index.html" width="900" height="600"></iframe>
<script>
window.__messages = [];
window.addEventListener('message', (event) => {
  if (event.source === document.getElementById('f').contentWindow) {
    window.__messages.push(event.data);
  }
});
</script>`;
      await serve(page, host, packageFiles);
      await page.goto(HOST_URL);
      const frame = page.frameLocator('#f');
      await frame.locator('[data-action="next"]').waitFor();
      await frame.locator('[data-action="next"]').click();
      await frame.locator('[data-action="next"]').click();
      await page.waitForFunction(() =>
        (window as any).__messages.some((data: any) => data.type === 'complete')
      );
      const messages: unknown[] = await page.evaluate(
        () => (window as any).__messages
      );
      const mapped = messages
        .map((data: unknown) =>
          lms.mapHtml5Message(data, {
            registrationId: 'r1',
            courseModuleId: 'c1',
          })
        )
        .filter((value) => value !== null);
      expect(mapped.length).toBe(messages.length);
      expect(mapped.at(-1)?.['completionStatus']).toBe('completed');
      expect(mapped.some((value) => value?.['progressMeasure'] === 1)).toBe(
        true
      );
      await page.close();
    },
    60_000
  );
});
