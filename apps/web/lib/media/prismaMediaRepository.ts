import type { PrismaClient } from '@prisma/client';
import type { Result } from '@richardmcquiston01/lms-package-maker-model';
import type { MediaRecord, MediaRepository, NewMedia } from './types';

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function failure<TValue>(message: string, cause: unknown): Result<TValue> {
  return { ok: false, errors: [`${message}: ${describeCause(cause)}`] };
}

/** What the repository needs; a transaction client satisfies it too. */
export type MediaDatabase = Pick<PrismaClient, 'media'>;

/** Stores facts about uploaded files in PostgreSQL through Prisma. */
export function createPrismaMediaRepository(
  client: MediaDatabase
): MediaRepository {
  return {
    async create(input: NewMedia): Promise<Result<MediaRecord>> {
      try {
        return { ok: true, value: await client.media.create({ data: input }) };
      } catch (cause: unknown) {
        return failure(
          `could not record the upload '${input.fileName}'`,
          cause
        );
      }
    },
    async listByProject(
      projectId: string
    ): Promise<Result<readonly MediaRecord[]>> {
      try {
        return {
          ok: true,
          value: await client.media.findMany({
            where: { projectId },
            orderBy: { createdAt: 'desc' },
          }),
        };
      } catch (cause: unknown) {
        return failure(
          `could not list the media of project '${projectId}'`,
          cause
        );
      }
    },
    async get(
      projectId: string,
      mediaId: string
    ): Promise<Result<MediaRecord | null>> {
      try {
        return {
          ok: true,
          value: await client.media.findFirst({
            where: { id: mediaId, projectId },
          }),
        };
      } catch (cause: unknown) {
        return failure(`could not read media '${mediaId}'`, cause);
      }
    },
    async getMany(
      projectId: string,
      mediaIds: readonly string[]
    ): Promise<Result<readonly MediaRecord[]>> {
      try {
        return {
          ok: true,
          value: await client.media.findMany({
            where: { projectId, id: { in: [...mediaIds] } },
          }),
        };
      } catch (cause: unknown) {
        return failure(
          `could not look up media of project '${projectId}'`,
          cause
        );
      }
    },
    async delete(projectId: string, mediaId: string): Promise<Result<null>> {
      try {
        await client.media.deleteMany({ where: { id: mediaId, projectId } });
        return { ok: true, value: null };
      } catch (cause: unknown) {
        return failure(`could not delete media '${mediaId}'`, cause);
      }
    },
  };
}
