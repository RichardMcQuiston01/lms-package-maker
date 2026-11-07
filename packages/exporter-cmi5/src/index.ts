import type {
  CourseModel,
  Result,
} from '@richardmcquiston01/lms-package-maker-model';
import type {
  ExportOptions,
  Exporter,
  PackageFiles,
} from '@richardmcquiston01/lms-package-maker-exporters';
import {
  buildPlayerFiles,
  type PlayerFiles,
} from '@richardmcquiston01/lms-package-maker-player';
import { buildCmi5CourseStructure } from './manifest.js';

export {
  buildCmi5CourseStructure,
  cmi5AuId,
  cmi5CourseId,
} from './manifest.js';

/**
 * Exports a course as a cmi5 package (`cmi5.xml` at the root): one course with
 * one assignable unit. Launched by a cmi5 LMS (with `endpoint`, `fetch`,
 * `actor`, `registration` and `activityId`), the runtime in the package gets
 * its token, reads the launch data, and sends `initialized`, `completed`,
 * `passed` or `failed`, and `terminated` statements as cmi5 requires. It also
 * adds an "Exit course" button that ends the session and returns the learner
 * to the LMS. Opened without those parameters it runs on its own.
 */
export const cmi5Exporter: Exporter = {
  standard: 'cmi5',
  export(course: CourseModel, options?: ExportOptions): Result<PackageFiles> {
    const assets: ReadonlyMap<string, Uint8Array> | undefined = options?.assets;
    const player: Result<PlayerFiles> = buildPlayerFiles(course, {
      cmi5: true,
      ...(assets === undefined ? {} : { assets }),
    });
    if (!player.ok) {
      return player;
    }
    const files: PlayerFiles = new Map(player.value);
    files.set(
      'cmi5.xml',
      new TextEncoder().encode(buildCmi5CourseStructure(course))
    );
    return { ok: true, value: files };
  },
};
