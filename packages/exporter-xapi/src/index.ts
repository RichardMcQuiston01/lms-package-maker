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
import { buildTincanManifest, xapiActivityId } from './manifest.js';

export { buildTincanManifest, xapiActivityId } from './manifest.js';

/**
 * Exports a course as an xAPI (TinCan) package (`tincan.xml` at the root).
 * Launched from an LRS with the usual `endpoint`, `auth`, `actor` and
 * `registration` parameters, the runtime in the package sends `initialized`,
 * `scored`, `completed`, `passed`, `failed` and `terminated` statements and
 * keeps the learner's place in the LRS State API. Opened without those
 * parameters it runs on its own and sends nothing.
 */
export const xapiExporter: Exporter = {
  standard: 'xapi',
  export(course: CourseModel, options?: ExportOptions): Result<PackageFiles> {
    const assets: ReadonlyMap<string, Uint8Array> | undefined = options?.assets;
    const player: Result<PlayerFiles> = buildPlayerFiles(course, {
      exitButton: true,
      xapiActivityId: xapiActivityId(course),
      ...(assets === undefined ? {} : { assets }),
    });
    if (!player.ok) {
      return player;
    }
    const files: PlayerFiles = new Map(player.value);
    files.set(
      'tincan.xml',
      new TextEncoder().encode(buildTincanManifest(course))
    );
    return { ok: true, value: files };
  },
};
