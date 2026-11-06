import type { Result } from '@richardmcquiston01/lms-package-maker-model';
import type { MediaRecord, MediaRepository, NewMedia } from './types';

/** In-memory media records for tests. */
export function createMemoryMediaRepository(
  now: () => Date = (): Date => new Date()
): MediaRepository {
  const records: Map<string, MediaRecord> = new Map<string, MediaRecord>();
  return {
    async create(input: NewMedia): Promise<Result<MediaRecord>> {
      const record: MediaRecord = { ...input, createdAt: now() };
      records.set(record.id, record);
      return { ok: true, value: record };
    },
    async listByProject(
      projectId: string
    ): Promise<Result<readonly MediaRecord[]>> {
      return {
        ok: true,
        value: [...records.values()]
          .filter(
            (record: MediaRecord): boolean => record.projectId === projectId
          )
          .sort(
            (a, b): number => b.createdAt.getTime() - a.createdAt.getTime()
          ),
      };
    },
    async get(
      projectId: string,
      mediaId: string
    ): Promise<Result<MediaRecord | null>> {
      const found: MediaRecord | undefined = records.get(mediaId);
      return { ok: true, value: found?.projectId === projectId ? found : null };
    },
    async getMany(
      projectId: string,
      mediaIds: readonly string[]
    ): Promise<Result<readonly MediaRecord[]>> {
      return {
        ok: true,
        value: mediaIds
          .map((id: string): MediaRecord | undefined => records.get(id))
          .filter(
            (record): record is MediaRecord => record?.projectId === projectId
          ),
      };
    },
    async delete(projectId: string, mediaId: string): Promise<Result<null>> {
      if (records.get(mediaId)?.projectId === projectId) {
        records.delete(mediaId);
      }
      return { ok: true, value: null };
    },
  };
}
