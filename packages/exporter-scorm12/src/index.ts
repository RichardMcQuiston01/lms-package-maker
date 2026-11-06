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
import { buildScorm12Manifest } from './manifest.js';
import { scorm12SchemaFiles } from './schemas.generated.js';

export { buildScorm12Manifest, toIdentifier } from './manifest.js';
export { scorm12SchemaFiles } from './schemas.generated.js';

/**
 * Exports a course as a SCORM 1.2 package (`imsmanifest.xml` at the root).
 * The runtime in the package finds `window.API` and reports lesson status,
 * bookmark, suspend data and session time. The four SCORM 1.2 schema files
 * sit next to the manifest, as the SCORM Content Aggregation Model expects.
 */
export const scorm12Exporter: Exporter = {
  standard: 'scorm12',
  export(course: CourseModel, options?: ExportOptions): Result<PackageFiles> {
    const assets: ReadonlyMap<string, Uint8Array> | undefined = options?.assets;
    const player: Result<PlayerFiles> = buildPlayerFiles(course, {
      ...(assets === undefined ? {} : { assets }),
    });
    if (!player.ok) {
      return player;
    }
    const files: PlayerFiles = new Map(player.value);
    const encoder: TextEncoder = new TextEncoder();
    files.set(
      'imsmanifest.xml',
      encoder.encode(
        buildScorm12Manifest(course, [...(assets?.keys() ?? [])].sort())
      )
    );
    for (const [name, text] of Object.entries(scorm12SchemaFiles)) {
      files.set(name, encoder.encode(text));
    }
    return { ok: true, value: files };
  },
};
