import { afterAll, beforeAll, describe, expect } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { createPrismaRepository } from '../projects/prismaRepository';
import { testIf } from '../testSupport';
import { createPrismaMediaRepository } from './prismaMediaRepository';

/** Runs against a real PostgreSQL database; see prismaRepository.test.ts. */
const databaseUrl: string | undefined = process.env['DATABASE_URL'];
if ((databaseUrl === undefined || databaseUrl === '') && process.env['CI']) {
  throw new Error(
    'DATABASE_URL must be set on CI so the Prisma media repository is tested'
  );
}
const available: boolean = databaseUrl !== undefined && databaseUrl !== '';
const client: PrismaClient | null = available ? new PrismaClient() : null;
const ownerId: string = crypto.randomUUID();
const projectIds: string[] = [];

beforeAll(async (): Promise<void> => {
  await client?.user.create({
    data: {
      id: ownerId,
      email: `${ownerId}@test.invalid`,
      displayName: 'Test',
      passwordHash: 'x',
    },
  });
});

afterAll(async (): Promise<void> => {
  await client?.project.deleteMany({ where: { id: { in: projectIds } } });
  await client?.user.deleteMany({ where: { id: ownerId } });
  await client?.$disconnect();
});

async function newProject(): Promise<string> {
  const id: string = crypto.randomUUID();
  projectIds.push(id);
  await createPrismaRepository(client as PrismaClient).create(id, ownerId, {
    modelVersion: 1,
    id,
    title: 'T',
    description: '',
    language: 'en',
    completion: { kind: 'viewAll' },
    modules: [
      { id: 'm', title: 'M', pages: [{ id: 'p', title: 'P', html: '' }] },
    ],
  });
  return id;
}

function newMedia(projectId: string) {
  const id: string = crypto.randomUUID();
  return {
    id,
    projectId,
    fileName: 'cat.png',
    contentType: 'image/png',
    byteSize: 3,
    sha256: 'ab'.repeat(32),
    storageKey: `media:${id}`,
  };
}

describe('Prisma media repository', () => {
  testIf(available)(
    'creates, lists, gets and deletes within one project',
    async () => {
      const repository = createPrismaMediaRepository(client as PrismaClient);
      const projectId = await newProject();
      const otherProjectId = await newProject();
      const mine = newMedia(projectId);
      expect((await repository.create(mine)).ok).toBe(true);

      const listed = await repository.listByProject(projectId);
      expect(listed.ok && listed.value.map((entry) => entry.id)).toEqual([
        mine.id,
      ]);
      expect(await repository.get(projectId, mine.id)).toMatchObject({
        ok: true,
        value: { fileName: 'cat.png' },
      });
      // The same id asked for through another project finds nothing.
      expect(await repository.get(otherProjectId, mine.id)).toEqual({
        ok: true,
        value: null,
      });
      const many = await repository.getMany(otherProjectId, [mine.id]);
      expect(many.ok && many.value.length).toBe(0);
      const own = await repository.getMany(projectId, [
        mine.id,
        crypto.randomUUID(),
      ]);
      expect(own.ok && own.value.length).toBe(1);

      await repository.delete(otherProjectId, mine.id);
      expect((await repository.get(projectId, mine.id)).ok).toBe(true);
      expect(await repository.get(projectId, mine.id)).toMatchObject({
        value: { id: mine.id },
      });
      await repository.delete(projectId, mine.id);
      expect(await repository.get(projectId, mine.id)).toEqual({
        ok: true,
        value: null,
      });
    }
  );

  testIf(available)(
    "removes a project's media records with the project",
    async () => {
      const repository = createPrismaMediaRepository(client as PrismaClient);
      const projectId = await newProject();
      const record = newMedia(projectId);
      await repository.create(record);
      await (client as PrismaClient).project.delete({
        where: { id: projectId },
      });
      expect(
        await (client as PrismaClient).media.count({ where: { id: record.id } })
      ).toBe(0);
    }
  );

  testIf(available)(
    'says what failed when the project does not exist',
    async () => {
      const repository = createPrismaMediaRepository(client as PrismaClient);
      const result = await repository.create(newMedia(crypto.randomUUID()));
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.errors[0]).toContain(
          "could not record the upload 'cat.png'"
        );
    }
  );
});
