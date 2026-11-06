import { afterAll, beforeAll, describe, expect } from 'bun:test';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import { PrismaClient } from '@prisma/client';
import { testIf } from '../testSupport';
import { createPrismaRepository } from './prismaRepository';

/**
 * Runs against a real PostgreSQL database (DATABASE_URL, migrations applied).
 * Locally it is skipped without one; on CI a missing database is an error.
 */
const databaseUrl: string | undefined = process.env['DATABASE_URL'];
if ((databaseUrl === undefined || databaseUrl === '') && process.env['CI']) {
  throw new Error(
    'DATABASE_URL must be set on CI so the Prisma repository is tested'
  );
}
const available: boolean = databaseUrl !== undefined && databaseUrl !== '';
const client: PrismaClient | null = available ? new PrismaClient() : null;

const course = (id: string, title: string): CourseModel => ({
  modelVersion: 1,
  id,
  title,
  description: 'd',
  language: 'en',
  completion: { kind: 'viewAll' },
  modules: [
    { id: 'm', title: 'M', pages: [{ id: 'p', title: 'P', html: '<p>x</p>' }] },
  ],
});

const ownerId: string = crypto.randomUUID();
const otherOwnerId: string = crypto.randomUUID();

beforeAll(async (): Promise<void> => {
  await client?.user.createMany({
    data: [ownerId, otherOwnerId].map((id: string) => ({
      id,
      email: `${id}@test.invalid`,
      displayName: 'Test owner',
      passwordHash: 'not-a-real-hash',
    })),
  });
});

afterAll(async (): Promise<void> => {
  const owners: string[] = [ownerId, otherOwnerId];
  await client?.project.deleteMany({ where: { ownerId: { in: owners } } });
  await client?.user.deleteMany({ where: { id: { in: owners } } });
  await client?.$disconnect();
});

describe('Prisma project repository', () => {
  testIf(available)(
    'creates, reads, updates, lists and records exports',
    async () => {
      const repository = createPrismaRepository(client as PrismaClient);
      const id: string = crypto.randomUUID();
      try {
        const created = await repository.create(
          id,
          ownerId,
          course(id, 'First')
        );
        expect(created.ok && created.value.name).toBe('First');

        const read = await repository.get(id, ownerId);
        expect(read.ok && read.value?.course.modules[0]?.pages[0]?.html).toBe(
          '<p>x</p>'
        );

        const updated = await repository.update(
          id,
          ownerId,
          course(id, 'Second')
        );
        expect(updated.ok && updated.value?.name).toBe('Second');
        expect(
          updated.ok &&
            updated.value !== null &&
            updated.value.updatedAt >= updated.value.createdAt
        ).toBe(true);

        const listed = await repository.list(ownerId);
        expect(listed.ok && listed.value.some((entry) => entry.id === id)).toBe(
          true
        );

        const exportId: string = crypto.randomUUID();
        const recorded = await repository.recordExport({
          id: exportId,
          projectId: id,
          standard: 'scorm12',
          storageKey: `export:${exportId}`,
          byteSize: 10,
        });
        expect(recorded.ok).toBe(true);
        const exports = await repository.listExports(id);
        expect(exports.ok && exports.value.length).toBe(1);

        const missing = await repository.update(
          crypto.randomUUID(),
          ownerId,
          course(id, 'X')
        );
        expect(missing).toEqual({ ok: true, value: null });
      } finally {
        await client?.project.deleteMany({ where: { id } });
      }
    }
  );

  testIf(available)(
    'accepts an owner id from any identity provider, with no account row behind it',
    async () => {
      const repository = createPrismaRepository(client as PrismaClient);
      const id: string = crypto.randomUUID();
      const hostOwner = `header:ada.lovelace+${id}@example.com`;
      try {
        const created = await repository.create(
          id,
          hostOwner,
          course(id, 'Hosted')
        );
        expect(created.ok).toBe(true);
        const read = await repository.get(id, hostOwner);
        expect(read.ok && read.value?.name).toBe('Hosted');
        const listed = await repository.list(hostOwner);
        expect(listed.ok && listed.value.map((entry) => entry.id)).toEqual([
          id,
        ]);
        // A different id, even a prefix of it, is a different owner.
        expect(await repository.get(id, 'header:ada.lovelace')).toEqual({
          ok: true,
          value: null,
        });
      } finally {
        await client?.project.deleteMany({ where: { id } });
      }
    }
  );

  testIf(available)('keeps projects private to their owner', async () => {
    const repository = createPrismaRepository(client as PrismaClient);
    const id: string = crypto.randomUUID();
    await repository.create(id, ownerId, course(id, 'Mine'));
    expect(await repository.get(id, otherOwnerId)).toEqual({
      ok: true,
      value: null,
    });
    expect(
      await repository.update(id, otherOwnerId, course(id, 'Stolen'))
    ).toEqual({ ok: true, value: null });
    const others = await repository.list(otherOwnerId);
    expect(others.ok && others.value.some((entry) => entry.id === id)).toBe(
      false
    );
    const mine = await repository.get(id, ownerId);
    expect(mine.ok && mine.value?.name).toBe('Mine');
  });

  testIf(available)(
    'says what is wrong when an export has no project',
    async () => {
      const repository = createPrismaRepository(client as PrismaClient);
      const result = await repository.recordExport({
        id: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        standard: 'html5',
        storageKey: 'x',
        byteSize: 1,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]).toContain(
          'could not record the export of project'
        );
      }
    }
  );

  testIf(available)(
    'reports a stored course that is no longer valid',
    async () => {
      const repository = createPrismaRepository(client as PrismaClient);
      const id: string = crypto.randomUUID();
      try {
        await (client as PrismaClient).project.create({
          data: {
            id,
            ownerId,
            name: 'Broken',
            courseJson: { modelVersion: 99 },
          },
        });
        const read = await repository.get(id, ownerId);
        expect(read.ok).toBe(false);
        if (!read.ok) {
          expect(read.errors[0]).toContain('no longer valid');
        }
      } finally {
        await client?.project.deleteMany({ where: { id } });
      }
    }
  );
});
