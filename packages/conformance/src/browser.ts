import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import type { PackageFiles } from '@richardmcquiston01/lms-package-maker-exporters';

export const ORIGIN = 'http://lms.test';

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

export interface OpenedPackage {
  readonly page: Page;
  /** Messages from the runtime or the page that point at a problem. */
  readonly problems: string[];
}

/**
 * Opens a package in a frame whose parent page exposes reactive-lms' real
 * CmiStore as `window.API`. `seed` is passed to the CmiStore constructor, for
 * example to start from saved progress.
 */
export async function openWithCmiStore(
  browser: Browser,
  cmiHostScript: string,
  files: PackageFiles,
  seed: Record<string, unknown>
): Promise<OpenedPackage> {
  const page: Page = await browser.newPage();
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
  await serve(page, host, files);
  await page.goto(HOST_URL);
  await page.frameLocator('#f').locator('[data-action="next"]').waitFor();
  return { page, problems };
}

export const HOST_URL = `${ORIGIN}/host.html`;
