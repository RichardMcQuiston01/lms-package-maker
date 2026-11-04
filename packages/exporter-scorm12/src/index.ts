import type {
  CourseModel,
  Result,
} from '@richardmcquiston01/lms-package-maker-model';
import type {
  Exporter,
  PackageFiles,
} from '@richardmcquiston01/lms-package-maker-exporters';
import {
  buildPlayerFiles,
  type PlayerFiles,
} from '@richardmcquiston01/lms-package-maker-player';
import { buildScorm12Manifest } from './manifest.js';

export { buildScorm12Manifest, toIdentifier } from './manifest.js';

/**
 * Exports a course as a SCORM 1.2 package (`imsmanifest.xml` at the root).
 * The runtime in the package finds `window.API` and reports lesson status,
 * bookmark, suspend data and session time.
 */
export const scorm12Exporter: Exporter = {
  standard: 'scorm12',
  export(course: CourseModel): Result<PackageFiles> {
    const player: Result<PlayerFiles> = buildPlayerFiles(course);
    if (!player.ok) {
      return player;
    }
    const files: PlayerFiles = new Map(player.value);
    files.set(
      'imsmanifest.xml',
      new TextEncoder().encode(buildScorm12Manifest(course))
    );
    return { ok: true, value: files };
  },
};
