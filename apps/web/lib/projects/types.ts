import type {
  CourseModel,
  Result,
} from '@richardmcquiston01/lms-package-maker-model';

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly updatedAt: Date;
}

export interface ProjectRecord extends ProjectSummary {
  readonly course: CourseModel;
  readonly createdAt: Date;
}

export interface ExportRecord {
  readonly id: string;
  readonly projectId: string;
  readonly standard: string;
  readonly storageKey: string;
  readonly byteSize: number;
  readonly createdAt: Date;
}

export interface NewExport {
  readonly id: string;
  readonly projectId: string;
  readonly standard: string;
  readonly storageKey: string;
  readonly byteSize: number;
}

/** Where projects live. Every method returns a Result the caller must check. */
export interface ProjectRepository {
  /** Only the owner's projects. */
  list(ownerId: string): Promise<Result<readonly ProjectSummary[]>>;
  /** Null when the project does not exist or belongs to someone else. */
  get(id: string, ownerId: string): Promise<Result<ProjectRecord | null>>;
  create(
    id: string,
    ownerId: string,
    course: CourseModel
  ): Promise<Result<ProjectRecord>>;
  /**
   * Replaces the course. Resolves to null when the project does not exist or
   * belongs to someone else.
   */
  update(
    id: string,
    ownerId: string,
    course: CourseModel
  ): Promise<Result<ProjectRecord | null>>;
  recordExport(input: NewExport): Promise<Result<ExportRecord>>;
  listExports(projectId: string): Promise<Result<readonly ExportRecord[]>>;
}
