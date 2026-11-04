import type {
  CourseModel,
  Result,
} from '@richardmcquiston01/lms-package-maker-model';

/** Files of an exported package, keyed by forward-slash relative path. */
export type PackageFiles = ReadonlyMap<string, Uint8Array>;

export type ExportStandard =
  'html5' | 'scorm12' | 'scorm2004' | 'xapi' | 'cmi5' | 'aicc';

/**
 * A pure function from a course to package files. Exporters do no file or
 * network I/O so they run in the browser, Node, Docker and Electron alike.
 */
export interface Exporter {
  readonly standard: ExportStandard;
  export(course: CourseModel): Result<PackageFiles>;
}
