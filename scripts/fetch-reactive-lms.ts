import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import pin from '../packages/conformance/reactive-lms.json';

const repoRoot: string = path.resolve(import.meta.dir, '..');
const target: string = path.join(repoRoot, '.cache', 'reactive-lms');

async function run(args: readonly string[], cwd: string): Promise<string> {
  const child = Bun.spawn([...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `'${args.join(' ')}' failed in ${cwd} with exit code ${exitCode}: ${stderr.trim()}`
    );
  }
  return stdout.trim();
}

async function currentCommit(): Promise<string | null> {
  if (!existsSync(path.join(target, '.git'))) {
    return null;
  }
  try {
    return await run(['git', 'rev-parse', 'HEAD'], target);
  } catch {
    return null;
  }
}

if ((await currentCommit()) !== pin.commit) {
  await mkdir(target, { recursive: true });
  await run(['git', 'init', '-q'], target);
  await run(
    ['git', 'fetch', '--depth', '1', pin.repository, pin.commit],
    target
  );
  await run(['git', 'checkout', '-q', '--force', 'FETCH_HEAD'], target);
  console.log(`checked out reactive-lms ${pin.commit} into ${target}`);
} else {
  console.log(`reactive-lms ${pin.commit} is already checked out`);
}

await run(['bun', 'install', '--frozen-lockfile'], target);
console.log('installed reactive-lms dependencies');
