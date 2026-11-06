import type { Result } from '@richardmcquiston01/lms-package-maker-model';
import type {
  AuthRepository,
  AuthUser,
  NewSession,
  NewUser,
  SessionRecord,
  UserRecord,
} from './types';

/** In-memory accounts for tests. */
export function createMemoryAuthRepository(
  now: () => Date = (): Date => new Date()
): AuthRepository & { readonly claimed: string[] } {
  const users: Map<string, UserRecord> = new Map<string, UserRecord>();
  const sessions: Map<string, NewSession> = new Map<string, NewSession>();
  const claimed: string[] = [];

  return {
    claimed,
    async countUsers(): Promise<Result<number>> {
      return { ok: true, value: users.size };
    },
    async createUser(input: NewUser): Promise<Result<UserRecord | null>> {
      if (
        [...users.values()].some(
          (user: UserRecord): boolean => user.email === input.email
        )
      ) {
        return { ok: true, value: null };
      }
      const record: UserRecord = {
        ...input,
        createdAt: now(),
        updatedAt: now(),
      };
      users.set(record.id, record);
      return { ok: true, value: record };
    },
    async findUserByEmail(email: string): Promise<Result<UserRecord | null>> {
      const found: UserRecord | undefined = [...users.values()].find(
        (user: UserRecord): boolean => user.email === email
      );
      return { ok: true, value: found ?? null };
    },
    async createSession(input: NewSession): Promise<Result<SessionRecord>> {
      sessions.set(input.tokenHash, input);
      return {
        ok: true,
        value: {
          id: input.id,
          userId: input.userId,
          expiresAt: input.expiresAt,
        },
      };
    },
    async findSession(
      tokenHash: string,
      at: Date
    ): Promise<Result<{ session: SessionRecord; user: AuthUser } | null>> {
      const session: NewSession | undefined = sessions.get(tokenHash);
      const user: UserRecord | undefined =
        session === undefined ? undefined : users.get(session.userId);
      if (
        session === undefined ||
        user === undefined ||
        session.expiresAt <= at
      ) {
        return { ok: true, value: null };
      }
      return {
        ok: true,
        value: {
          session: {
            id: session.id,
            userId: session.userId,
            expiresAt: session.expiresAt,
          },
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
          },
        },
      };
    },
    async deleteSession(tokenHash: string): Promise<Result<null>> {
      sessions.delete(tokenHash);
      return { ok: true, value: null };
    },
    async deleteExpiredSessions(at: Date): Promise<Result<null>> {
      for (const [hash, session] of sessions) {
        if (session.expiresAt <= at) sessions.delete(hash);
      }
      return { ok: true, value: null };
    },
    async claimUnownedProjects(userId: string): Promise<Result<number>> {
      claimed.push(userId);
      return { ok: true, value: 0 };
    },
  };
}
