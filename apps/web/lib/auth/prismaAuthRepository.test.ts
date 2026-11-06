import { afterAll, describe, expect } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { createPrismaRepository } from '../projects/prismaRepository';
import { testIf } from '../testSupport';
import { createPrismaAuthRepository } from './prismaAuthRepository';

/** Runs against a real PostgreSQL database; see prismaRepository.test.ts. */
const databaseUrl: string | undefined = process.env['DATABASE_URL'];
if ((databaseUrl === undefined || databaseUrl === '') && process.env['CI']) {
  throw new Error(
    'DATABASE_URL must be set on CI so the Prisma auth repository is tested'
  );
}
const available: boolean = databaseUrl !== undefined && databaseUrl !== '';
const client: PrismaClient | null = available ? new PrismaClient() : null;
const createdUsers: string[] = [];

afterAll(async (): Promise<void> => {
  await client?.project.deleteMany({
    where: { ownerId: { in: createdUsers } },
  });
  await client?.user.deleteMany({ where: { id: { in: createdUsers } } });
  await client?.$disconnect();
});

function newUser(): {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
} {
  const id: string = crypto.randomUUID();
  createdUsers.push(id);
  return {
    id,
    email: `${id}@test.invalid`,
    displayName: 'Test',
    passwordHash: 'scrypt$x',
  };
}

describe('Prisma auth repository', () => {
  testIf(available)(
    'creates a user once per email and finds it again',
    async () => {
      const repository = createPrismaAuthRepository(client as PrismaClient);
      const user = newUser();
      const created = await repository.createUser(user);
      expect(created.ok && created.value?.email).toBe(user.email);
      const duplicate = await repository.createUser({
        ...user,
        id: crypto.randomUUID(),
      });
      expect(duplicate).toEqual({ ok: true, value: null });
      const found = await repository.findUserByEmail(user.email);
      expect(found.ok && found.value?.id).toBe(user.id);
      expect(await repository.findUserByEmail('nobody@test.invalid')).toEqual({
        ok: true,
        value: null,
      });
    }
  );

  testIf(available)(
    'stores sessions by hash, expires them and deletes them',
    async () => {
      const repository = createPrismaAuthRepository(client as PrismaClient);
      const user = newUser();
      await repository.createUser(user);
      const now = new Date();
      const live = {
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: `live-${user.id}`,
        expiresAt: new Date(now.getTime() + 60_000),
      };
      const old = {
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: `old-${user.id}`,
        expiresAt: new Date(now.getTime() - 60_000),
      };
      await repository.createSession(live);
      await repository.createSession(old);

      const found = await repository.findSession(live.tokenHash, now);
      expect(found.ok && found.value?.user.email).toBe(user.email);
      expect(
        found.ok && found.value !== null && 'passwordHash' in found.value.user
      ).toBe(false);
      expect(await repository.findSession(old.tokenHash, now)).toEqual({
        ok: true,
        value: null,
      });

      await repository.deleteExpiredSessions(now);
      expect(await client?.session.count({ where: { userId: user.id } })).toBe(
        1
      );
      await repository.deleteSession(live.tokenHash);
      expect(await client?.session.count({ where: { userId: user.id } })).toBe(
        0
      );
    }
  );

  testIf(available)(
    'the first account claims projects that have no owner',
    async () => {
      // Claiming is global (every project without an owner), so run it in a
      // transaction that is rolled back; real rows in the database stay untouched.
      class Rollback extends Error {}
      const user = newUser();
      const orphanId: string = crypto.randomUUID();
      let claimedCount = -1;
      let nameBefore: string | null | undefined;
      let nameAfter: string | null | undefined;
      try {
        await (client as PrismaClient).$transaction(async (transaction) => {
          const auth = createPrismaAuthRepository(transaction);
          const projects = createPrismaRepository(transaction);
          await auth.createUser(user);
          await transaction.project.create({
            data: {
              id: orphanId,
              name: 'Old project',
              courseJson: {
                modelVersion: 1,
                id: orphanId,
                title: 'Old project',
                description: '',
                language: 'en',
                completion: { kind: 'viewAll' },
                modules: [
                  {
                    id: 'm',
                    title: 'M',
                    pages: [{ id: 'p', title: 'P', html: '' }],
                  },
                ],
              },
            },
          });
          const before = await projects.get(orphanId, user.id);
          nameBefore = before.ok ? (before.value?.name ?? null) : undefined;
          const claimed = await auth.claimUnownedProjects(user.id);
          claimedCount = claimed.ok ? claimed.value : -1;
          const after = await projects.get(orphanId, user.id);
          nameAfter = after.ok ? (after.value?.name ?? null) : undefined;
          throw new Rollback('undo everything');
        });
      } catch (cause: unknown) {
        if (!(cause instanceof Rollback)) {
          throw cause;
        }
      }
      expect(nameBefore).toBeNull();
      expect(claimedCount).toBeGreaterThanOrEqual(1);
      expect(nameAfter).toBe('Old project');
      // Nothing was kept.
      expect(await client?.user.count({ where: { id: user.id } })).toBe(0);
      expect(await client?.project.count({ where: { id: orphanId } })).toBe(0);
    }
  );
});
