import type {
  CourseModel,
  Result,
} from '@richardmcquiston01/lms-package-maker-model';
import type { ServiceResult } from '../serviceResult';

export type MediaKind = 'image' | 'audio' | 'video';

export interface MediaRecord {
  readonly id: string;
  readonly projectId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly storageKey: string;
  readonly createdAt: Date;
}

export interface NewMedia {
  readonly id: string;
  readonly projectId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly storageKey: string;
}

/** Where the facts about uploaded files live. The bytes are kept in storage. */
export interface MediaRepository {
  create(input: NewMedia): Promise<Result<MediaRecord>>;
  listByProject(projectId: string): Promise<Result<readonly MediaRecord[]>>;
  /** Null when the file does not exist or belongs to another project. */
  get(projectId: string, mediaId: string): Promise<Result<MediaRecord | null>>;
  /** The files that exist in this project, out of the ids asked for. */
  getMany(
    projectId: string,
    mediaIds: readonly string[]
  ): Promise<Result<readonly MediaRecord[]>>;
  delete(projectId: string, mediaId: string): Promise<Result<null>>;
}

/** A course with its media references replaced, and the files they point to. */
export interface ResolvedCourse {
  readonly course: CourseModel;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

/** What the project service needs from media when it saves, previews or exports. */
export interface MediaResolver {
  /** Names the ids that are not in this project's media, as an error message list. */
  findMissing(
    projectId: string,
    mediaIds: readonly string[]
  ): Promise<ServiceResult<readonly string[]>>;
  resolve(
    projectId: string,
    course: CourseModel
  ): Promise<ServiceResult<ResolvedCourse>>;
}
