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

/**
 * Exports a course as a plain HTML5 package: `index.html` plus assets. It
 * reports progress to a host page with `postMessage`, so it works standalone
 * and inside hosts such as reactive-lms.
 */
export const html5Exporter: Exporter = {
  standard: 'html5',
  export(course: CourseModel, options?: ExportOptions): Result<PackageFiles> {
    const player: Result<PlayerFiles> = buildPlayerFiles(course, {
      ...(options?.assets === undefined ? {} : { assets: options.assets }),
    });
    return player.ok ? { ok: true, value: player.value } : player;
  },
};
