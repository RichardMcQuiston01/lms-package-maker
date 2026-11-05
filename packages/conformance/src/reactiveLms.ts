import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'bun:test';

const repoRoot: string = path.resolve(import.meta.dir, '../../..');

/** Where the pinned reactive-lms checkout lives unless overridden. */
export const DEFAULT_CHECKOUT_DIRECTORY: string = path.join(
  repoRoot,
  '.cache',
  'reactive-lms'
);

/** Minimal view of reactive-lms' package file index. */
export interface PackageFileIndex {
  readonly paths: readonly string[];
  has(path: string): boolean;
  read(path: string): Uint8Array | undefined;
}

export interface ParsedPackage {
  readonly title: string;
  readonly entryHref: string;
  readonly packageType: string;
  readonly activities: readonly {
    readonly title: string;
    readonly href?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }[];
}

/** The pieces of reactive-lms these tests call. */
export interface ReactiveLms {
  readonly directory: string;
  createZipFileIndex(zip: Uint8Array): PackageFileIndex;
  detectPackageType(files: PackageFileIndex): string;
  parseImsmanifest(files: PackageFileIndex): ParsedPackage;
  parseHtml5(files: PackageFileIndex): Promise<ParsedPackage>;
  mapCmiToProgress(
    values: Record<string, string>,
    ids: {
      registrationId: string;
      courseModuleId: string;
      activityNodeId: string;
    }
  ): Record<string, unknown>;
  mapHtml5Message(
    data: unknown,
    context: { registrationId: string; courseModuleId: string }
  ): Record<string, unknown> | null;
  /** Path of the CmiStore source, bundled into the browser as `window.API`. */
  readonly cmiStoreSourcePath: string;
}

/**
 * Directory of the reactive-lms checkout, or null when there is none.
 * Set LMS_PACKAGE_MAKER_REACTIVE_LMS_DIR to test against another checkout.
 */
export function findCheckoutDirectory(): string | null {
  const configured: string | undefined =
    process.env['LMS_PACKAGE_MAKER_REACTIVE_LMS_DIR'];
  const directory: string =
    configured !== undefined && configured !== ''
      ? path.resolve(configured)
      : DEFAULT_CHECKOUT_DIRECTORY;
  return existsSync(path.join(directory, 'packages', 'core', 'src'))
    ? directory
    : null;
}

/**
 * Loads reactive-lms, or returns null so the caller can skip. On CI a missing
 * checkout is an error: a skipped suite must never look like a passing one.
 */
export async function loadReactiveLms(): Promise<ReactiveLms | null> {
  const directory: string | null = findCheckoutDirectory();
  if (directory === null) {
    if (process.env['CI'] !== undefined && process.env['CI'] !== '') {
      throw new Error(
        `reactive-lms checkout not found at ${DEFAULT_CHECKOUT_DIRECTORY}; run 'bun run conformance:fetch' before the tests`
      );
    }
    console.warn(
      "Skipping reactive-lms conformance tests: run 'bun run conformance:fetch' first"
    );
    return null;
  }
  const core: string = path.join(directory, 'packages', 'core', 'src');
  const shared: string = path.join(directory, 'packages', 'shared', 'src');
  const cmiStoreSourcePath: string = path.join(
    shared,
    'models',
    'cmi-store.ts'
  );
  const fileIndex = await import(
    path.join(core, 'import', 'package-file-index.ts')
  );
  const detect = await import(
    path.join(core, 'import', 'detect-package-type.ts')
  );
  const manifest = await import(
    path.join(core, 'runtimes', 'scorm', 'parse-imsmanifest.ts')
  );
  const html5 = await import(
    path.join(core, 'runtimes', 'html5', 'html5-runtime.ts')
  );
  const cmi = await import(cmiStoreSourcePath);
  const message = await import(
    path.join(
      directory,
      'packages',
      'player',
      'src',
      'progress',
      'map-html5-message.ts'
    )
  );
  return {
    directory,
    cmiStoreSourcePath,
    createZipFileIndex: fileIndex.createZipFileIndex,
    detectPackageType: detect.detectPackageType,
    parseImsmanifest: manifest.parseImsmanifest,
    parseHtml5: (files: PackageFileIndex): Promise<ParsedPackage> =>
      new html5.Html5Runtime().parse(files),
    mapCmiToProgress: cmi.mapCmiToProgress,
    mapHtml5Message: message.mapHtml5Message,
  };
}

/** `test` when reactive-lms is available, otherwise `test.skip`. */
export function testIf(available: boolean): typeof test {
  return available ? test : test.skip;
}
