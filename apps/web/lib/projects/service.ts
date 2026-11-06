import type { ErrorLogAdapter } from '@richardmcquiston01/error-log-adapter';
import type { StorageAdapter } from '@richardmcquiston01/storage-adapters';
import {
  validateCourseModel,
  type CourseModel,
  type Module,
  type Page,
  type Result,
} from '@richardmcquiston01/lms-package-maker-model';
import {
  zipPackage,
  type Exporter,
  type ExportStandard,
  type PackageFiles,
} from '@richardmcquiston01/lms-package-maker-exporters';
import type { AppErrorCode } from '../errorLog';
import { sanitizePageHtml } from '../sanitize';
import type { ProjectRecord, ProjectRepository, ProjectSummary } from './types';

/** Standards the app can export today. */
export type SupportedStandard = Extract<ExportStandard, 'html5' | 'scorm12'>;

export const SUPPORTED_STANDARDS: readonly SupportedStandard[] = [
  'html5',
  'scorm12',
];

export function isSupportedStandard(value: string): value is SupportedStandard {
  return (SUPPORTED_STANDARDS as readonly string[]).includes(value);
}

/** Why a service call failed, so callers can pick an HTTP status or a message. */
export type ServiceResult<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | {
      readonly ok: false;
      readonly kind: 'invalid' | 'notFound' | 'failed';
      readonly errors: readonly string[];
    };

export interface ExportedPackage {
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly contentType: 'application/zip';
}

export interface PreviewFile {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface ProjectService {
  list(): Promise<ServiceResult<readonly ProjectSummary[]>>;
  get(id: string): Promise<ServiceResult<ProjectRecord>>;
  create(input: {
    title: string;
    description?: string;
    language?: string;
  }): Promise<ServiceResult<ProjectRecord>>;
  saveCourse(
    id: string,
    course: unknown
  ): Promise<ServiceResult<ProjectRecord>>;
  exportProject(
    id: string,
    standard: SupportedStandard
  ): Promise<ServiceResult<ExportedPackage>>;
  preview(id: string, filePath: string): Promise<ServiceResult<PreviewFile>>;
}

export interface ProjectServiceDependencies {
  readonly repository: ProjectRepository;
  readonly storage: StorageAdapter;
  readonly errorLog: ErrorLogAdapter<AppErrorCode>;
  readonly exporters: Readonly<Record<SupportedStandard, Exporter>>;
  readonly newId: () => string;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const MAX_TITLE_LENGTH = 200;

function contentTypeOf(filePath: string): string {
  const dot: number = filePath.lastIndexOf('.');
  const extension: string = dot === -1 ? '' : filePath.slice(dot);
  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}

/** A readable file name for a download, such as `safety-101-scorm12.zip`. */
export function downloadFileName(title: string, standard: string): string {
  const slug: string = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug === '' ? 'course' : slug}-${standard}.zip`;
}

function sanitizeCourse(course: CourseModel): CourseModel {
  return {
    ...course,
    modules: course.modules.map((courseModule: Module): Module => ({
      ...courseModule,
      pages: courseModule.pages.map((page: Page): Page => ({
        ...page,
        html: sanitizePageHtml(page.html),
      })),
    })),
  };
}

function starterCourse(
  id: string,
  title: string,
  description: string,
  language: string,
  newId: () => string
): CourseModel {
  return {
    modelVersion: 1,
    id,
    title,
    description,
    language,
    completion: { kind: 'viewAll' },
    modules: [
      {
        id: newId(),
        title: 'Module 1',
        pages: [
          {
            id: newId(),
            title: 'Welcome',
            html: '<p>Start writing your first page.</p>',
          },
        ],
      },
    ],
  };
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function createProjectService(
  dependencies: ProjectServiceDependencies
): ProjectService {
  const { repository, storage, errorLog, exporters, newId } = dependencies;

  async function logProblem(
    code: AppErrorCode,
    message: string,
    source: string
  ): Promise<void> {
    // Logging must never break the request; the adapter reports instead of throwing.
    await errorLog.log({ code, message, source });
  }

  async function load(id: string): Promise<ServiceResult<ProjectRecord>> {
    const found = await repository.get(id);
    if (!found.ok) {
      await logProblem(
        'STORAGE_FAILED',
        found.errors.join('; '),
        'projects.get'
      );
      return { ok: false, kind: 'failed', errors: found.errors };
    }
    if (found.value === null) {
      return {
        ok: false,
        kind: 'notFound',
        errors: [`project '${id}' does not exist`],
      };
    }
    return { ok: true, value: found.value };
  }

  return {
    async list(): Promise<ServiceResult<readonly ProjectSummary[]>> {
      const listed = await repository.list();
      if (!listed.ok) {
        await logProblem(
          'STORAGE_FAILED',
          listed.errors.join('; '),
          'projects.list'
        );
        return { ok: false, kind: 'failed', errors: listed.errors };
      }
      return { ok: true, value: listed.value };
    },

    get: load,

    async create(input): Promise<ServiceResult<ProjectRecord>> {
      const title: string = (input.title ?? '').trim();
      if (title === '' || title.length > MAX_TITLE_LENGTH) {
        return {
          ok: false,
          kind: 'invalid',
          errors: [
            `title must be 1 to ${MAX_TITLE_LENGTH} characters, got ${title.length}`,
          ],
        };
      }
      const id: string = newId();
      const course: CourseModel = starterCourse(
        id,
        title,
        (input.description ?? '').trim(),
        (input.language ?? 'en').trim() || 'en',
        newId
      );
      const created = await repository.create(id, course);
      if (!created.ok) {
        await logProblem(
          'STORAGE_FAILED',
          created.errors.join('; '),
          'projects.create'
        );
        return { ok: false, kind: 'failed', errors: created.errors };
      }
      return { ok: true, value: created.value };
    },

    async saveCourse(
      id: string,
      input: unknown
    ): Promise<ServiceResult<ProjectRecord>> {
      const validated: Result<CourseModel> = validateCourseModel(input);
      if (!validated.ok) {
        return { ok: false, kind: 'invalid', errors: validated.errors };
      }
      if (validated.value.title.length > MAX_TITLE_LENGTH) {
        return {
          ok: false,
          kind: 'invalid',
          errors: [
            `course.title must be at most ${MAX_TITLE_LENGTH} characters`,
          ],
        };
      }
      // The project id is the course id; never trust the client's copy.
      const course: CourseModel = sanitizeCourse({ ...validated.value, id });
      const updated = await repository.update(id, course);
      if (!updated.ok) {
        await logProblem(
          'STORAGE_FAILED',
          updated.errors.join('; '),
          'projects.save'
        );
        return { ok: false, kind: 'failed', errors: updated.errors };
      }
      if (updated.value === null) {
        return {
          ok: false,
          kind: 'notFound',
          errors: [`project '${id}' does not exist`],
        };
      }
      return { ok: true, value: updated.value };
    },

    async exportProject(
      id: string,
      standard: SupportedStandard
    ): Promise<ServiceResult<ExportedPackage>> {
      const project = await load(id);
      if (!project.ok) {
        return project;
      }
      const exported: Result<PackageFiles> = exporters[standard].export(
        project.value.course
      );
      if (!exported.ok) {
        await logProblem(
          'EXPORT_FAILED',
          `${standard} export of project '${id}' failed: ${exported.errors.join('; ')}`,
          'projects.export'
        );
        return { ok: false, kind: 'invalid', errors: exported.errors };
      }
      const zipped: Result<Uint8Array> = zipPackage(exported.value);
      if (!zipped.ok) {
        await logProblem(
          'EXPORT_FAILED',
          `zipping the ${standard} export of project '${id}' failed: ${zipped.errors.join('; ')}`,
          'projects.export'
        );
        return { ok: false, kind: 'failed', errors: zipped.errors };
      }
      await keepCopy(id, standard, zipped.value);
      return {
        ok: true,
        value: {
          fileName: downloadFileName(project.value.name, standard),
          bytes: zipped.value,
          contentType: 'application/zip',
        },
      };
    },

    async preview(
      id: string,
      filePath: string
    ): Promise<ServiceResult<PreviewFile>> {
      const project = await load(id);
      if (!project.ok) {
        return project;
      }
      const built: Result<PackageFiles> = exporters.html5.export(
        project.value.course
      );
      if (!built.ok) {
        return { ok: false, kind: 'invalid', errors: built.errors };
      }
      const name: string = filePath === '' ? 'index.html' : filePath;
      const bytes: Uint8Array | undefined = built.value.get(name);
      if (bytes === undefined) {
        return {
          ok: false,
          kind: 'notFound',
          errors: [`preview has no file '${name}'`],
        };
      }
      return { ok: true, value: { bytes, contentType: contentTypeOf(name) } };
    },
  };

  /**
   * Keeps a copy of every export. A failure here is logged but does not stop
   * the download, because the learner-facing file was built correctly.
   */
  async function keepCopy(
    projectId: string,
    standard: SupportedStandard,
    bytes: Uint8Array
  ): Promise<void> {
    const exportId: string = newId();
    const storageKey = `export:${exportId}`;
    const stored = await storage.set(storageKey, encodeBase64(bytes), {
      signal: new AbortController().signal,
    });
    if (!stored.ok) {
      await logProblem(
        'STORAGE_FAILED',
        `could not keep a copy of the ${standard} export of project '${projectId}': ${stored.error}`,
        'projects.export'
      );
      return;
    }
    const recorded = await repository.recordExport({
      id: exportId,
      projectId,
      standard,
      storageKey,
      byteSize: bytes.length,
    });
    if (!recorded.ok) {
      await logProblem(
        'STORAGE_FAILED',
        recorded.errors.join('; '),
        'projects.export'
      );
    }
  }
}
