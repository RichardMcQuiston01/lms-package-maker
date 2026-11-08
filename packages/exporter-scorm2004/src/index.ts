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
import { buildScorm2004Manifest } from './manifest.js';
import { scorm2004SchemaFiles } from './schemas.generated.js';

export { buildScorm2004Manifest } from './manifest.js';
export { scorm2004SchemaFiles } from './schemas.generated.js';

/**
 * Exports a course as a SCORM 2004 4th Edition package (`imsmanifest.xml` at
 * the root). The runtime in the package finds `window.API_1484_11` and reports
 * completion and success status, scaled score, progress, location, suspend
 * data and session time. The content packaging, ADL and simple sequencing
 * schema files sit next to the manifest, as the SCORM Content Aggregation
 * Model expects. Sequencing and navigation rules are not used.
 */
export const scorm2004Exporter: Exporter = {
  standard: 'scorm2004',
  export(course: CourseModel, options?: ExportOptions): Result<PackageFiles> {
    const assets: ReadonlyMap<string, Uint8Array> | undefined = options?.assets;
    const player: Result<PlayerFiles> = buildPlayerFiles(course, {
      exitButton: true,
      runtimeApi: 'scorm2004',
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
        buildScorm2004Manifest(course, [...(assets?.keys() ?? [])].sort())
      )
    );
    for (const [name, text] of Object.entries(scorm2004SchemaFiles)) {
      files.set(name, encoder.encode(text));
    }
    return { ok: true, value: files };
  },
};
