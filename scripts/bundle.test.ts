import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  BUNDLE_TARGETS,
  REPO_ROOT,
  renderTarget,
  renderTextFilesTarget,
  TEXT_FILE_TARGETS,
} from './bundle';

describe('generated browser bundles', () => {
  for (const target of BUNDLE_TARGETS) {
    test(`${target.output} is up to date`, async () => {
      const committed: string = await readFile(
        path.join(REPO_ROOT, target.output),
        'utf8'
      );
      expect(committed).toBe(await renderTarget(target));
    });
  }

  for (const target of TEXT_FILE_TARGETS) {
    test(`${target.output} is up to date`, async () => {
      const committed: string = await readFile(
        path.join(REPO_ROOT, target.output),
        'utf8'
      );
      expect(committed).toBe(await renderTextFilesTarget(target));
    });
  }
});
