import { Prisma, type PrismaClient } from '@prisma/client';
import type { Result } from '@richardmcquiston01/lms-package-maker-model';
import type {
  AuthRepository,
  AuthUser,
  NewSession,
  NewUser,
  SessionRecord,
  UserRecord,
} from './types';

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function failure<TValue>(message: string, cause: unknown): Result<TValue> {
  return { ok: false, errors: [`${message}: ${describeCause(cause)}`] };
}

/** What the repository needs; a transaction client satisfies it too. */
export type AuthDatabase = Pick<PrismaClient, 'user' | 'session' | 'project'>;

/** Stores accounts and sessions in PostgreSQL through Prisma. */
export function createPrismaAuthRepository(
  client: AuthDatabase
): AuthRepository {
  return {
    async countUsers(): Promise<Result<number>> {
      try {
        return { ok: true, value: await client.user.count() };
      } catch (cause: unknown) {
        return failure('could not count accounts', cause);
      }
    },
    async createUser(input: NewUser): Promise<Result<UserRecord | null>> {
      try {
        return { ok: true, value: await client.user.create({ data: input }) };
      } catch (cause: unknown) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === 'P2002'
        ) {
          return { ok: true, value: null };
        }
        return failure('could not create the account', cause);
      }
    },
    async findUserByEmail(email: string): Promise<Result<UserRecord | null>> {
      try {
        return {
          ok: true,
          value: await client.user.findUnique({ where: { email } }),
        };
      } catch (cause: unknown) {
        return failure('could not look up the account', cause);
      }
    },
    async createSession(input: NewSession): Promise<Result<SessionRecord>> {
      try {
        const row = await client.session.create({ data: input });
        return {
          ok: true,
          value: { id: row.id, userId: row.userId, expiresAt: row.expiresAt },
        };
      } catch (cause: unknown) {
        return failure('could not start the session', cause);
      }
    },
    async findSession(
      tokenHash: string,
      now: Date
    ): Promise<Result<{ session: SessionRecord; user: AuthUser } | null>> {
      try {
        const row = await client.session.findUnique({
          where: { tokenHash },
          include: { user: true },
        });
        if (row === null || row.expiresAt <= now) {
          return { ok: true, value: null };
        }
        return {
          ok: true,
          value: {
            session: {
              id: row.id,
              userId: row.userId,
              expiresAt: row.expiresAt,
            },
            user: {
              id: row.user.id,
              email: row.user.email,
              displayName: row.user.displayName,
            },
          },
        };
      } catch (cause: unknown) {
        return failure('could not look up the session', cause);
      }
    },
    async deleteSession(tokenHash: string): Promise<Result<null>> {
      try {
        await client.session.deleteMany({ where: { tokenHash } });
        return { ok: true, value: null };
      } catch (cause: unknown) {
        return failure('could not end the session', cause);
      }
    },
    async deleteExpiredSessions(now: Date): Promise<Result<null>> {
      try {
        await client.session.deleteMany({ where: { expiresAt: { lte: now } } });
        return { ok: true, value: null };
      } catch (cause: unknown) {
        return failure('could not remove expired sessions', cause);
      }
    },
    async claimUnownedProjects(userId: string): Promise<Result<number>> {
      try {
        const result = await client.project.updateMany({
          where: { ownerId: null },
          data: { ownerId: userId },
        });
        return { ok: true, value: result.count };
      } catch (cause: unknown) {
        return failure(
          'could not assign existing projects to the first account',
          cause
        );
      }
    },
  };
}
