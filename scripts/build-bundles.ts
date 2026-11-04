import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BUNDLE_TARGETS, REPO_ROOT, renderTarget } from './bundle';

const checkOnly: boolean = process.argv.includes('--check');
let stale = false;

for (const target of BUNDLE_TARGETS) {
  const expected: string = await renderTarget(target);
  const outputPath: string = path.join(REPO_ROOT, target.output);
  const current: string = await readFile(outputPath, 'utf8').catch(() => '');
  if (current === expected) {
    continue;
  }
  if (checkOnly) {
    console.error(`${target.output} is stale; run: bun run build:bundles`);
    stale = true;
  } else {
    await writeFile(outputPath, expected);
    console.log(`wrote ${target.output}`);
  }
}

process.exit(stale ? 1 : 0);
