import type { PrismaClient, Prisma } from '@prisma/client';
import {
  validateCourseModel,
  type CourseModel,
  type Result,
} from '@richardmcquiston01/lms-package-maker-model';
import type {
  ExportRecord,
  NewExport,
  ProjectRecord,
  ProjectRepository,
  ProjectSummary,
} from './types';

interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly courseJson: Prisma.JsonValue;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function toRecord(row: ProjectRow): Result<ProjectRecord> {
  const course: Result<CourseModel> = validateCourseModel(row.courseJson);
  if (!course.ok) {
    return {
      ok: false,
      errors: [
        `project '${row.id}' holds a course that is no longer valid: ${course.errors.join('; ')}`,
      ],
    };
  }
  return {
    ok: true,
    value: {
      id: row.id,
      name: row.name,
      description: row.description,
      course: course.value,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
  };
}

/** Stores projects in PostgreSQL through Prisma. */
export function createPrismaRepository(
  client: PrismaClient
): ProjectRepository {
  return {
    async list(): Promise<Result<readonly ProjectSummary[]>> {
      try {
        const rows = await client.project.findMany({
          select: { id: true, name: true, description: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
        });
        return { ok: true, value: rows };
      } catch (cause: unknown) {
        return {
          ok: false,
          errors: [`could not list projects: ${describeCause(cause)}`],
        };
      }
    },
    async get(id: string): Promise<Result<ProjectRecord | null>> {
      try {
        const row = await client.project.findUnique({ where: { id } });
        if (row === null) {
          return { ok: true, value: null };
        }
        return toRecord(row);
      } catch (cause: unknown) {
        return {
          ok: false,
          errors: [`could not read project '${id}': ${describeCause(cause)}`],
        };
      }
    },
    async create(
      id: string,
      course: CourseModel
    ): Promise<Result<ProjectRecord>> {
      try {
        const row = await client.project.create({
          data: {
            id,
            name: course.title,
            description: course.description,
            courseJson: course as unknown as Prisma.InputJsonValue,
          },
        });
        return toRecord(row);
      } catch (cause: unknown) {
        return {
          ok: false,
          errors: [`could not create project '${id}': ${describeCause(cause)}`],
        };
      }
    },
    async update(
      id: string,
      course: CourseModel
    ): Promise<Result<ProjectRecord | null>> {
      try {
        const result = await client.project.updateMany({
          where: { id },
          data: {
            name: course.title,
            description: course.description,
            courseJson: course as unknown as Prisma.InputJsonValue,
          },
        });
        if (result.count === 0) {
          return { ok: true, value: null };
        }
        const row = await client.project.findUnique({ where: { id } });
        return row === null ? { ok: true, value: null } : toRecord(row);
      } catch (cause: unknown) {
        return {
          ok: false,
          errors: [`could not update project '${id}': ${describeCause(cause)}`],
        };
      }
    },
    async recordExport(input: NewExport): Promise<Result<ExportRecord>> {
      try {
        const row = await client.packageExport.create({ data: input });
        return { ok: true, value: row };
      } catch (cause: unknown) {
        return {
          ok: false,
          errors: [
            `could not record the export of project '${input.projectId}': ${describeCause(cause)}`,
          ],
        };
      }
    },
    async listExports(
      projectId: string
    ): Promise<Result<readonly ExportRecord[]>> {
      try {
        const rows = await client.packageExport.findMany({
          where: { projectId },
          orderBy: { createdAt: 'desc' },
        });
        return { ok: true, value: rows };
      } catch (cause: unknown) {
        return {
          ok: false,
          errors: [
            `could not list exports of project '${projectId}': ${describeCause(cause)}`,
          ],
        };
      }
    },
  };
}
