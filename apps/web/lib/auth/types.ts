import type { Result } from '@richardmcquiston01/lms-package-maker-model';

/** The signed-in person, as the rest of the app sees them. */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

export interface UserRecord extends AuthUser {
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
}

export interface NewUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
}

export interface NewSession {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/** Where accounts and sessions live. Every method returns a Result to check. */
export interface AuthRepository {
  countUsers(): Promise<Result<number>>;
  /** Resolves to null when the email is already registered. */
  createUser(input: NewUser): Promise<Result<UserRecord | null>>;
  findUserByEmail(email: string): Promise<Result<UserRecord | null>>;
  createSession(input: NewSession): Promise<Result<SessionRecord>>;
  /** The live session and its user for a token hash, or null. */
  findSession(
    tokenHash: string,
    now: Date
  ): Promise<Result<{ session: SessionRecord; user: AuthUser } | null>>;
  deleteSession(tokenHash: string): Promise<Result<null>>;
  deleteExpiredSessions(now: Date): Promise<Result<null>>;
  /** Gives projects made before sign-in existed to this user. Returns how many. */
  claimUnownedProjects(userId: string): Promise<Result<number>>;
}
