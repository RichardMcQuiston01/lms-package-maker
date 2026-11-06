import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'bun:test';
import { chromium, type Browser } from 'playwright-core';

const webDirectory: string = path.resolve(import.meta.dir, '../../../apps/web');

export interface RunningApp {
  readonly baseUrl: string;
  stop(): Promise<void>;
}

/**
 * Why the browser tests cannot run here, or null when they can. They need the
 * production build of the web app and a migrated database.
 */
export function missingPrerequisite(): string | null {
  if (!existsSync(path.join(webDirectory, '.next', 'BUILD_ID'))) {
    return "apps/web is not built (run 'bun run build:web')";
  }
  const databaseUrl: string | undefined = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') {
    return 'DATABASE_URL is not set';
  }
  return null;
}

/** `test` that is skipped locally and a failure on CI when prerequisites are missing. */
export function e2eTest(
  name: string,
  body: () => Promise<void>,
  timeoutMs: number = 60_000
): void {
  const reason: string | null = missingPrerequisite();
  if (reason === null) {
    test(name, body, timeoutMs);
  } else if (process.env['CI'] !== undefined && process.env['CI'] !== '') {
    test(name, () => {
      throw new Error(`browser tests cannot run on CI: ${reason}`);
    });
  } else {
    test.skip(`${name} (skipped: ${reason})`, () => {});
  }
}

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
      `could not start Chromium (${reason}); install it with 'bun run conformance:browser' or set CHROMIUM_PATH`
    );
  }
}

async function freePort(): Promise<number> {
  const probe = Bun.serve({ port: 0, fetch: () => new Response('') });
  const port: number = probe.port ?? 0;
  await probe.stop(true);
  return port;
}

async function waitForHealth(
  baseUrl: string,
  output: () => string
): Promise<void> {
  const deadline: number = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response: Response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // not listening yet
    }
    await Bun.sleep(250);
  }
  throw new Error(
    `the app did not answer ${baseUrl}/api/health within 30 seconds. Output:\n${output()}`
  );
}

/** Starts `next start` on a free port with its own data directory. */
export async function startApp(
  environment: Readonly<Record<string, string>>
): Promise<RunningApp> {
  const port: number = await freePort();
  const dataDirectory: string = await mkdtemp(
    path.join(os.tmpdir(), 'lpm-e2e-')
  );
  const processHandle = Bun.spawn(
    ['bun', 'run', 'next', 'start', '-p', String(port)],
    {
      cwd: webDirectory,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        LMS_DATA_DIR: dataDirectory,
        AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
        ...environment,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  let collected = '';
  const collect = async (stream: ReadableStream<Uint8Array>): Promise<void> => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      collected += decoder.decode(value);
    }
  };
  void collect(processHandle.stdout);
  void collect(processHandle.stderr);
  const baseUrl = `http://localhost:${port}`;
  try {
    await waitForHealth(baseUrl, () => collected);
  } catch (cause: unknown) {
    processHandle.kill();
    await rm(dataDirectory, { recursive: true, force: true });
    throw cause;
  }
  return {
    baseUrl,
    stop: async (): Promise<void> => {
      processHandle.kill();
      await processHandle.exited;
      await rm(dataDirectory, { recursive: true, force: true });
    },
  };
}
