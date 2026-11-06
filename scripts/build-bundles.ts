import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BUNDLE_TARGETS,
  REPO_ROOT,
  renderTarget,
  renderTextFilesTarget,
  TEXT_FILE_TARGETS,
} from './bundle';

const checkOnly: boolean = process.argv.includes('--check');
let stale = false;

const expectedModules: { output: string; expected: string }[] = [];
for (const target of BUNDLE_TARGETS) {
  expectedModules.push({
    output: target.output,
    expected: await renderTarget(target),
  });
}
for (const target of TEXT_FILE_TARGETS) {
  expectedModules.push({
    output: target.output,
    expected: await renderTextFilesTarget(target),
  });
}

for (const { output, expected } of expectedModules) {
  const outputPath: string = path.join(REPO_ROOT, output);
  const current: string = await readFile(outputPath, 'utf8').catch(() => '');
  if (current === expected) {
    continue;
  }
  if (checkOnly) {
    console.error(`${output} is stale; run: bun run build:bundles`);
    stale = true;
  } else {
    await writeFile(outputPath, expected);
    console.log(`wrote ${output}`);
  }
}

process.exit(stale ? 1 : 0);
