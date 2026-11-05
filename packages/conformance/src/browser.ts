import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import type { PackageFiles } from '@richardmcquiston01/lms-package-maker-exporters';

const ORIGIN = 'http://lms.test';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

/** Chromium path: CHROMIUM_PATH, the sandbox default, or Playwright's own. */
function chromiumPath(): string | undefined {
  const configured: string | undefined = process.env['CHROMIUM_PATH'];
  if (configured !== undefined && configured !== '') {
    return configured;
  }
  return existsSync('/opt/pw-browsers/chromium')
    ? '/opt/pw-browsers/chromium'
    : undefined;
}

export async function launchBrowser(): Promise<Browser> {
  const executablePath: string | undefined = chromiumPath();
  try {
    return await chromium.launch(
      executablePath === undefined ? {} : { executablePath }
    );
  } catch (cause: unknown) {
    const reason: string =
      cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `could not start Chromium (${reason}); install it with 'bunx playwright-core install chromium' or set CHROMIUM_PATH`
    );
  }
}

/** Bundles a tiny entry that exposes the real reactive-lms CmiStore as window.API. */
export async function bundleCmiHost(
  cmiStoreSourcePath: string
): Promise<string> {
  const directory: string = await mkdtemp(path.join(os.tmpdir(), 'lpm-cmi-'));
  try {
    const entry: string = path.join(directory, 'entry.ts');
    await writeFile(
      entry,
      `import { CmiStore } from ${JSON.stringify(cmiStoreSourcePath)};
const seed = JSON.parse(document.currentScript?.getAttribute('data-seed') ?? '{}');
const store = new CmiStore(seed);
(window as any).API = store;
(window as any).__store = store;
`
    );
    const result = await Bun.build({
      entrypoints: [entry],
      target: 'browser',
      format: 'iife',
    });
    if (!result.success || result.outputs[0] === undefined) {
      throw new Error(
        `bundling CmiStore failed: ${result.logs.map(String).join('\n')}`
      );
    }
    return await result.outputs[0].text();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Serves the host page and the exported package from memory. */
export async function serve(
  page: Page,
  hostHtml: string,
  files: PackageFiles
): Promise<void> {
  await page.route(`${ORIGIN}/**`, async (route) => {
    const pathname: string = new URL(route.request().url()).pathname;
    if (pathname === '/host.html') {
      await route.fulfill({ contentType: 'text/html', body: hostHtml });
      return;
    }
    const content: Uint8Array | undefined = files.get(pathname.slice(1));
    if (content === undefined) {
      await route.fulfill({ status: 404, body: `not in package: ${pathname}` });
      return;
    }
    const extension: string = path.extname(pathname);
    await route.fulfill({
      contentType: CONTENT_TYPES[extension] ?? 'application/octet-stream',
      body: Buffer.from(content),
    });
  });
}

export const HOST_URL = `${ORIGIN}/host.html`;
