import { zipSync } from 'fflate';
import type { Result } from '@richardmcquiston01/lms-package-maker-model';
import type { PackageFiles } from './types';

/** Fixed timestamp so identical input always yields identical bytes. */
const ZIP_EPOCH: Date = new Date('2000-01-01T00:00:00Z');

/** Zips package files deterministically (sorted paths, fixed mtime). */
export function zipPackage(files: PackageFiles): Result<Uint8Array> {
  const entries: Record<string, [Uint8Array, { mtime: Date }]> = {};
  for (const path of [...files.keys()].sort()) {
    if (path.startsWith('/') || path.includes('..') || path.includes('\\')) {
      return {
        ok: false,
        errors: [
          `package path '${path}' must be relative, use '/' and not contain '..'`,
        ],
      };
    }
    const content: Uint8Array | undefined = files.get(path);
    if (content === undefined) {
      continue;
    }
    entries[path] = [content, { mtime: ZIP_EPOCH }];
  }
  try {
    return { ok: true, value: zipSync(entries) };
  } catch (cause: unknown) {
    const reason: string =
      cause instanceof Error ? cause.message : String(cause);
    return { ok: false, errors: [`failed to create zip: ${reason}`] };
  }
}
