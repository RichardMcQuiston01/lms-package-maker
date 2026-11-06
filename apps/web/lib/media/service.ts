import { createHash } from 'node:crypto';
import type { ErrorLogAdapter } from '@richardmcquiston01/error-log-adapter';
import type { StorageAdapter } from '@richardmcquiston01/storage-adapters';
import {
  collectCourseMediaUses,
  rewriteCourseMedia,
  type CourseModel,
  type MediaUse,
} from '@richardmcquiston01/lms-package-maker-model';
import type { AppErrorCode } from '../errorLog';
import type { ProjectRepository } from '../projects/types';
import type { ServiceResult } from '../serviceResult';
import {
  ALLOWED_MEDIA_DESCRIPTION,
  cleanFileName,
  extensionFor,
  sniffMedia,
  type SniffedMedia,
} from './sniff';
import type {
  MediaRecord,
  MediaRepository,
  MediaResolver,
  ResolvedCourse,
} from './types';

export const DEFAULT_MAX_MEDIA_BYTES = 25 * 1024 * 1024;
export const DEFAULT_MAX_MEDIA_PER_PROJECT = 100;

export interface MediaFile {
  readonly record: MediaRecord;
  readonly bytes: Uint8Array;
}

export interface MediaService extends MediaResolver {
  upload(
    projectId: string,
    ownerId: string,
    input: { fileName: string; bytes: Uint8Array }
  ): Promise<ServiceResult<MediaRecord>>;
  list(
    projectId: string,
    ownerId: string
  ): Promise<ServiceResult<readonly MediaRecord[]>>;
  read(
    projectId: string,
    ownerId: string,
    mediaId: string
  ): Promise<ServiceResult<MediaFile>>;
  remove(
    projectId: string,
    ownerId: string,
    mediaId: string
  ): Promise<ServiceResult<null>>;
}

export interface MediaServiceDependencies {
  readonly media: MediaRepository;
  readonly projects: ProjectRepository;
  readonly storage: StorageAdapter;
  readonly errorLog: ErrorLogAdapter<AppErrorCode>;
  readonly newId: () => string;
  readonly maxBytes?: number;
  readonly maxPerProject?: number;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createMediaService(
  dependencies: MediaServiceDependencies
): MediaService {
  const { media, projects, storage, errorLog, newId } = dependencies;
  const maxBytes: number = dependencies.maxBytes ?? DEFAULT_MAX_MEDIA_BYTES;
  const maxPerProject: number =
    dependencies.maxPerProject ?? DEFAULT_MAX_MEDIA_PER_PROJECT;

  async function logProblem(message: string, source: string): Promise<void> {
    await errorLog.log({ code: 'STORAGE_FAILED', message, source });
  }

  function failed(errors: readonly string[]): ServiceResult<never> {
    return { ok: false, kind: 'failed', errors };
  }

  async function requireProject(
    projectId: string,
    ownerId: string
  ): Promise<ServiceResult<CourseModel>> {
    const found = await projects.get(projectId, ownerId);
    if (!found.ok) {
      await logProblem(found.errors.join('; '), 'media.project');
      return failed(found.errors);
    }
    if (found.value === null) {
      return {
        ok: false,
        kind: 'notFound',
        errors: [`project '${projectId}' does not exist`],
      };
    }
    return { ok: true, value: found.value.course };
  }

  /** Reads and checks the stored bytes of one file. */
  async function readBytes(
    record: MediaRecord
  ): Promise<ServiceResult<Uint8Array>> {
    const stored = await storage.get(record.storageKey, {
      signal: new AbortController().signal,
    });
    if (!stored.ok) {
      await logProblem(
        `could not read '${record.fileName}' (${record.id}): ${stored.error}`,
        'media.read'
      );
      return failed([
        `the file '${record.fileName}' could not be read from storage: ${stored.error}`,
      ]);
    }
    if (stored.value === null) {
      await logProblem(
        `storage has no bytes for media ${record.id} (${record.storageKey})`,
        'media.read'
      );
      return failed([
        `the file '${record.fileName}' is missing from storage; upload it again`,
      ]);
    }
    const bytes: Uint8Array = new Uint8Array(
      Buffer.from(stored.value.value, 'base64')
    );
    const checksum: string = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== record.byteSize || checksum !== record.sha256) {
      await logProblem(
        `stored bytes of media ${record.id} do not match their checksum`,
        'media.read'
      );
      return failed([
        `the file '${record.fileName}' is damaged in storage; upload it again`,
      ]);
    }
    return { ok: true, value: bytes };
  }

  return {
    async upload(
      projectId,
      ownerId,
      input
    ): Promise<ServiceResult<MediaRecord>> {
      const project = await requireProject(projectId, ownerId);
      if (!project.ok) {
        return project;
      }
      if (input.bytes.length === 0) {
        return { ok: false, kind: 'invalid', errors: ['the file is empty'] };
      }
      if (input.bytes.length > maxBytes) {
        return {
          ok: false,
          kind: 'tooLarge',
          errors: [
            `the file is ${formatMegabytes(input.bytes.length)}, over the ${formatMegabytes(maxBytes)} limit`,
          ],
        };
      }
      const sniffed: SniffedMedia | null = sniffMedia(input.bytes);
      if (sniffed === null) {
        return {
          ok: false,
          kind: 'invalid',
          errors: [
            `this file type is not supported; use ${ALLOWED_MEDIA_DESCRIPTION}`,
          ],
        };
      }
      const existing = await media.listByProject(projectId);
      if (!existing.ok) {
        await logProblem(existing.errors.join('; '), 'media.upload');
        return failed(existing.errors);
      }
      if (existing.value.length >= maxPerProject) {
        return {
          ok: false,
          kind: 'invalid',
          errors: [
            `a course can hold ${maxPerProject} media files; remove one you no longer use first`,
          ],
        };
      }

      const id: string = newId();
      const storageKey = `media:${id}`;
      const fileName: string = cleanFileName(input.fileName);
      const stored = await storage.set(
        storageKey,
        Buffer.from(input.bytes).toString('base64'),
        {
          signal: new AbortController().signal,
        }
      );
      if (!stored.ok) {
        await logProblem(
          `could not store '${fileName}': ${stored.error}`,
          'media.upload'
        );
        return failed([`the file could not be saved: ${stored.error}`]);
      }
      const created = await media.create({
        id,
        projectId,
        fileName,
        contentType: sniffed.contentType,
        byteSize: input.bytes.length,
        sha256: createHash('sha256').update(input.bytes).digest('hex'),
        storageKey,
      });
      if (!created.ok) {
        await logProblem(created.errors.join('; '), 'media.upload');
        // Do not leave bytes behind that no record points to.
        await storage.remove?.(storageKey, {
          signal: new AbortController().signal,
        });
        return failed(created.errors);
      }
      return { ok: true, value: created.value };
    },

    async list(
      projectId,
      ownerId
    ): Promise<ServiceResult<readonly MediaRecord[]>> {
      const project = await requireProject(projectId, ownerId);
      if (!project.ok) {
        return project;
      }
      const listed = await media.listByProject(projectId);
      if (!listed.ok) {
        await logProblem(listed.errors.join('; '), 'media.list');
        return failed(listed.errors);
      }
      return { ok: true, value: listed.value };
    },

    async read(projectId, ownerId, mediaId): Promise<ServiceResult<MediaFile>> {
      const project = await requireProject(projectId, ownerId);
      if (!project.ok) {
        return project;
      }
      const found = await media.get(projectId, mediaId);
      if (!found.ok) {
        await logProblem(found.errors.join('; '), 'media.read');
        return failed(found.errors);
      }
      if (found.value === null) {
        return {
          ok: false,
          kind: 'notFound',
          errors: [`media '${mediaId}' does not exist`],
        };
      }
      const bytes = await readBytes(found.value);
      return bytes.ok
        ? { ok: true, value: { record: found.value, bytes: bytes.value } }
        : bytes;
    },

    async remove(projectId, ownerId, mediaId): Promise<ServiceResult<null>> {
      const project = await requireProject(projectId, ownerId);
      if (!project.ok) {
        return project;
      }
      const found = await media.get(projectId, mediaId);
      if (!found.ok) {
        await logProblem(found.errors.join('; '), 'media.remove');
        return failed(found.errors);
      }
      if (found.value === null) {
        return {
          ok: false,
          kind: 'notFound',
          errors: [`media '${mediaId}' does not exist`],
        };
      }
      const uses: MediaUse[] = collectCourseMediaUses(project.value).filter(
        (use: MediaUse): boolean => use.mediaId === mediaId
      );
      if (uses.length > 0) {
        const pages: string = [
          ...new Set(uses.map((use: MediaUse): string => `'${use.pageTitle}'`)),
        ].join(', ');
        return {
          ok: false,
          kind: 'invalid',
          errors: [
            `'${found.value.fileName}' is still used on ${pages}; remove it from the page first`,
          ],
        };
      }
      const deleted = await media.delete(projectId, mediaId);
      if (!deleted.ok) {
        await logProblem(deleted.errors.join('; '), 'media.remove');
        return failed(deleted.errors);
      }
      const removed = await storage.remove?.(found.value.storageKey, {
        signal: new AbortController().signal,
      });
      if (removed !== undefined && !removed.ok) {
        // The record is gone, so the author sees success; the stray bytes are only logged.
        await logProblem(
          `could not delete the bytes of media ${mediaId}: ${removed.error}`,
          'media.remove'
        );
      }
      return { ok: true, value: null };
    },

    async findMissing(
      projectId,
      mediaIds
    ): Promise<ServiceResult<readonly string[]>> {
      if (mediaIds.length === 0) {
        return { ok: true, value: [] };
      }
      const found = await media.getMany(projectId, mediaIds);
      if (!found.ok) {
        await logProblem(found.errors.join('; '), 'media.check');
        return failed(found.errors);
      }
      const known: Set<string> = new Set(
        found.value.map((record: MediaRecord): string => record.id)
      );
      return {
        ok: true,
        value: mediaIds.filter((id: string): boolean => !known.has(id)),
      };
    },

    async resolve(projectId, course): Promise<ServiceResult<ResolvedCourse>> {
      const uses: MediaUse[] = collectCourseMediaUses(course);
      if (uses.length === 0) {
        return {
          ok: true,
          value: { course, assets: new Map<string, Uint8Array>() },
        };
      }
      const ids: string[] = [
        ...new Set(uses.map((use: MediaUse): string => use.mediaId)),
      ];
      const found = await media.getMany(projectId, ids);
      if (!found.ok) {
        await logProblem(found.errors.join('; '), 'media.resolve');
        return failed(found.errors);
      }
      const byId: Map<string, MediaRecord> = new Map(
        found.value.map((record: MediaRecord): [string, MediaRecord] => [
          record.id,
          record,
        ])
      );
      const missing: string[] = uses
        .filter((use: MediaUse): boolean => !byId.has(use.mediaId))
        .map(
          (use: MediaUse): string =>
            `page '${use.pageTitle}' uses media ${use.mediaId} that no longer exists`
        );
      if (missing.length > 0) {
        return { ok: false, kind: 'invalid', errors: missing };
      }
      const assets: Map<string, Uint8Array> = new Map<string, Uint8Array>();
      const paths: Map<string, string> = new Map<string, string>();
      for (const record of byId.values()) {
        const bytes = await readBytes(record);
        if (!bytes.ok) {
          return bytes;
        }
        const path = `media/${record.id}.${extensionFor(record.contentType)}`;
        assets.set(path, bytes.value);
        paths.set(record.id, path);
      }
      return {
        ok: true,
        value: {
          course: rewriteCourseMedia(course, (id: string): string | undefined =>
            paths.get(id)
          ),
          assets,
        },
      };
    },
  };
}
