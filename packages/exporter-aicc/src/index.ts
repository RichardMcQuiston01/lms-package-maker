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
import { AICC_FILE_BASE, buildAiccFiles, type AiccFiles } from './files.js';

export {
  AICC_AU_ID,
  AICC_FILE_BASE,
  aiccCourseId,
  buildAiccFiles,
  type AiccFiles,
} from './files.js';

/**
 * Exports a course as an AICC package: the four course description files
 * (`course.crs`, `.au`, `.des`, `.cst`) at the root beside the player. An AICC
 * LMS launches `index.html` with `AICC_SID` and `AICC_URL`; the runtime in the
 * package then speaks HACP to that address (GetParam on start, PutParam as the
 * learner progresses, a last PutParam and ExitAU at the end). Opened without
 * those parameters it runs on its own.
 */
export const aiccExporter: Exporter = {
  standard: 'aicc',
  export(course: CourseModel, options?: ExportOptions): Result<PackageFiles> {
    const assets: ReadonlyMap<string, Uint8Array> | undefined = options?.assets;
    const player: Result<PlayerFiles> = buildPlayerFiles(course, {
      exitButton: true,
      aicc: true,
      ...(assets === undefined ? {} : { assets }),
    });
    if (!player.ok) {
      return player;
    }
    const files: PlayerFiles = new Map(player.value);
    const aicc: AiccFiles = buildAiccFiles(course);
    const encoder: TextEncoder = new TextEncoder();
    files.set(`${AICC_FILE_BASE}.crs`, encoder.encode(aicc.course));
    files.set(`${AICC_FILE_BASE}.au`, encoder.encode(aicc.assignableUnits));
    files.set(`${AICC_FILE_BASE}.des`, encoder.encode(aicc.descriptors));
    files.set(`${AICC_FILE_BASE}.cst`, encoder.encode(aicc.structure));
    return { ok: true, value: files };
  },
};
