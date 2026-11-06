import type {
  CourseModel,
  Result,
} from '@richardmcquiston01/lms-package-maker-model';
import type {
  ExportRecord,
  NewExport,
  ProjectRecord,
  ProjectRepository,
  ProjectSummary,
} from './types';

/** In-memory repository for tests and for running without a database. */
export function createMemoryRepository(
  now: () => Date = (): Date => new Date()
): ProjectRepository {
  const projects: Map<string, ProjectRecord> = new Map<string, ProjectRecord>();
  const owners: Map<string, string> = new Map<string, string>();
  const exports: ExportRecord[] = [];

  function toRecord(
    id: string,
    course: CourseModel,
    createdAt: Date
  ): ProjectRecord {
    return {
      id,
      name: course.title,
      description: course.description,
      course,
      createdAt,
      updatedAt: now(),
    };
  }

  function ownedBy(id: string, ownerId: string): ProjectRecord | undefined {
    return owners.get(id) === ownerId ? projects.get(id) : undefined;
  }

  return {
    async list(ownerId: string): Promise<Result<readonly ProjectSummary[]>> {
      const summaries: ProjectSummary[] = [...projects.values()]
        .filter(
          (project: ProjectRecord): boolean =>
            owners.get(project.id) === ownerId
        )
        .map(({ id, name, description, updatedAt }): ProjectSummary => ({
          id,
          name,
          description,
          updatedAt,
        }))
        .sort((a, b): number => b.updatedAt.getTime() - a.updatedAt.getTime());
      return { ok: true, value: summaries };
    },
    async get(
      id: string,
      ownerId: string
    ): Promise<Result<ProjectRecord | null>> {
      return { ok: true, value: ownedBy(id, ownerId) ?? null };
    },
    async create(
      id: string,
      ownerId: string,
      course: CourseModel
    ): Promise<Result<ProjectRecord>> {
      if (projects.has(id)) {
        return { ok: false, errors: [`project '${id}' already exists`] };
      }
      const record: ProjectRecord = toRecord(id, course, now());
      projects.set(id, record);
      owners.set(id, ownerId);
      return { ok: true, value: record };
    },
    async update(
      id: string,
      ownerId: string,
      course: CourseModel
    ): Promise<Result<ProjectRecord | null>> {
      const existing: ProjectRecord | undefined = ownedBy(id, ownerId);
      if (existing === undefined) {
        return { ok: true, value: null };
      }
      const record: ProjectRecord = toRecord(id, course, existing.createdAt);
      projects.set(id, record);
      return { ok: true, value: record };
    },
    async recordExport(input: NewExport): Promise<Result<ExportRecord>> {
      if (!projects.has(input.projectId)) {
        return {
          ok: false,
          errors: [
            `project '${input.projectId}' does not exist, so its export was not recorded`,
          ],
        };
      }
      const record: ExportRecord = { ...input, createdAt: now() };
      exports.push(record);
      return { ok: true, value: record };
    },
    async listExports(
      projectId: string
    ): Promise<Result<readonly ExportRecord[]>> {
      return {
        ok: true,
        value: exports.filter(
          (entry: ExportRecord): boolean => entry.projectId === projectId
        ),
      };
    },
  };
}
