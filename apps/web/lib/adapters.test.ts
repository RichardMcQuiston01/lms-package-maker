import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createErrorLog } from './errorLog';
import { createFileStorage } from './storage';

const dataDirectory: Promise<string> = mkdtemp(
  path.join(os.tmpdir(), 'lms-pm-test-')
);

afterAll(async (): Promise<void> => {
  await rm(await dataDirectory, { recursive: true, force: true });
});

describe('storage adapter', () => {
  test('round-trips a value through the file adapter', async () => {
    const storage = createFileStorage(await dataDirectory);
    const signal: AbortSignal = new AbortController().signal;
    const saved = await storage.set('project:1', 'hello', { signal });
    expect(saved.ok).toBe(true);
    const loaded = await storage.get('project:1', { signal });
    expect(loaded.ok && loaded.value?.value).toBe('hello');
  });
});

describe('error log adapter', () => {
  test('writes an entry to the NDJSON file', async () => {
    const directory: string = await dataDirectory;
    const result = await createErrorLog(directory).log({
      code: 'EXPORT_FAILED',
      message: 'scorm12 exporter is not implemented yet',
      source: 'test',
    });
    expect(result.ok).toBe(true);
    const text: string = await readFile(
      path.join(directory, 'logs', 'errors.ndjson'),
      'utf8'
    );
    expect(text).toContain('EXPORT_FAILED');
  });
});
