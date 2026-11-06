import type { ErrorLogAdapter } from '@richardmcquiston01/error-log-adapter';
import type { Result } from '@richardmcquiston01/lms-package-maker-model';
import type { AppErrorCode } from '../errorLog';
import {
  hashPassword,
  validatePassword,
  verifyAgainstDummy,
  verifyPassword,
} from './password';
import type { RateLimiter } from './rateLimiter';
import { generateSessionToken, hashToken } from './tokens';
import type { AuthRepository, AuthUser, UserRecord } from './types';

export const SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

const MAX_EMAIL_LENGTH = 254;
const MAX_DISPLAY_NAME_LENGTH = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface StartedSession {
  readonly user: AuthUser;
  /** The cookie value. Shown once; only its hash is stored. */
  readonly token: string;
  readonly expiresAt: Date;
}

export type AuthResult<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | {
      readonly ok: false;
      readonly kind:
        'invalid' | 'unauthorized' | 'forbidden' | 'rateLimited' | 'failed';
      readonly errors: readonly string[];
      readonly retryAfterSeconds?: number;
    };

export interface AuthService {
  /** True while an account can still be created from the sign-up page. */
  isSignUpOpen(): Promise<boolean>;
  signUp(
    input: { email: string; password: string; displayName: string },
    clientAddress: string
  ): Promise<AuthResult<StartedSession>>;
  signIn(
    input: { email: string; password: string },
    clientAddress: string
  ): Promise<AuthResult<StartedSession>>;
  signOut(token: string): Promise<void>;
  /** The person a cookie value belongs to, or null when it is missing, unknown or expired. */
  authenticate(token: string | null): Promise<AuthUser | null>;
}

export interface AuthServiceDependencies {
  readonly repository: AuthRepository;
  readonly errorLog: ErrorLogAdapter<AppErrorCode>;
  readonly rateLimiter: RateLimiter;
  /** When false, sign-up works only until the first account exists. */
  readonly allowSignUp: boolean;
  readonly newId: () => string;
  readonly now?: () => Date;
}

const WRONG_CREDENTIALS = 'Email or password is incorrect.';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createAuthService(
  dependencies: AuthServiceDependencies
): AuthService {
  const { repository, errorLog, rateLimiter, allowSignUp, newId } =
    dependencies;
  const now: () => Date = dependencies.now ?? ((): Date => new Date());

  async function logProblem(message: string, source: string): Promise<void> {
    await errorLog.log({ code: 'AUTH_FAILED', message, source });
  }

  async function startSession(
    user: AuthUser
  ): Promise<AuthResult<StartedSession>> {
    const token: string = generateSessionToken();
    const expiresAt: Date = new Date(now().getTime() + SESSION_LIFETIME_MS);
    const created = await repository.createSession({
      id: newId(),
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
    });
    if (!created.ok) {
      await logProblem(created.errors.join('; '), 'auth.session');
      return { ok: false, kind: 'failed', errors: created.errors };
    }
    return { ok: true, value: { user, token, expiresAt } };
  }

  async function signUpIsOpen(): Promise<Result<boolean>> {
    if (allowSignUp) {
      return { ok: true, value: true };
    }
    const counted = await repository.countUsers();
    return counted.ok ? { ok: true, value: counted.value === 0 } : counted;
  }

  return {
    async isSignUpOpen(): Promise<boolean> {
      const open = await signUpIsOpen();
      return open.ok && open.value;
    },

    async signUp(input, clientAddress): Promise<AuthResult<StartedSession>> {
      const limited: number = rateLimiter.retryAfterSeconds(
        `sign-up|${clientAddress}`
      );
      if (limited > 0) {
        return rateLimitedResult(limited);
      }
      const email: string = normalizeEmail(input.email);
      const displayName: string = input.displayName.trim();
      const problems: string[] = [];
      if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) {
        problems.push(
          'email must look like name@example.com and be at most 254 characters'
        );
      }
      if (displayName === '' || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
        problems.push(
          `name must be 1 to ${MAX_DISPLAY_NAME_LENGTH} characters, got ${displayName.length}`
        );
      }
      const password = validatePassword(input.password);
      if (!password.ok) {
        problems.push(...password.errors);
      }
      if (problems.length > 0) {
        return { ok: false, kind: 'invalid', errors: problems };
      }

      const open = await signUpIsOpen();
      if (!open.ok) {
        await logProblem(open.errors.join('; '), 'auth.sign-up');
        return { ok: false, kind: 'failed', errors: open.errors };
      }
      if (!open.value) {
        return {
          ok: false,
          kind: 'forbidden',
          errors: [
            'Sign-up is closed. Ask the person who runs this server to create your account, or to set ALLOW_SIGN_UP=true.',
          ],
        };
      }

      const counted = await repository.countUsers();
      const isFirstAccount: boolean = counted.ok && counted.value === 0;
      rateLimiter.recordFailure(`sign-up|${clientAddress}`);
      const created = await repository.createUser({
        id: newId(),
        email,
        displayName,
        passwordHash: await hashPassword(input.password),
      });
      if (!created.ok) {
        await logProblem(created.errors.join('; '), 'auth.sign-up');
        return { ok: false, kind: 'failed', errors: created.errors };
      }
      if (created.value === null) {
        return {
          ok: false,
          kind: 'invalid',
          errors: [
            'An account with this email already exists. Sign in instead.',
          ],
        };
      }
      if (isFirstAccount) {
        const claimed = await repository.claimUnownedProjects(created.value.id);
        if (!claimed.ok) {
          await logProblem(claimed.errors.join('; '), 'auth.sign-up');
        }
      }
      return startSession({
        id: created.value.id,
        email: created.value.email,
        displayName: created.value.displayName,
      });
    },

    async signIn(input, clientAddress): Promise<AuthResult<StartedSession>> {
      const email: string = normalizeEmail(input.email);
      const keys: string[] = [`sign-in|${clientAddress}`, `sign-in|${email}`];
      const wait: number = Math.max(
        ...keys.map((key: string): number => rateLimiter.retryAfterSeconds(key))
      );
      if (wait > 0) {
        return rateLimitedResult(wait);
      }
      const found = await repository.findUserByEmail(email);
      if (!found.ok) {
        await logProblem(found.errors.join('; '), 'auth.sign-in');
        return { ok: false, kind: 'failed', errors: found.errors };
      }
      const user: UserRecord | null = found.value;
      const matches: boolean =
        user !== null &&
        (await verifyPassword(input.password, user.passwordHash));
      if (user === null) {
        await verifyAgainstDummy(input.password);
      }
      if (!matches || user === null) {
        keys.forEach((key: string): void => rateLimiter.recordFailure(key));
        return { ok: false, kind: 'unauthorized', errors: [WRONG_CREDENTIALS] };
      }
      keys.forEach((key: string): void => rateLimiter.reset(key));
      await repository.deleteExpiredSessions(now());
      return startSession({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      });
    },

    async signOut(token: string): Promise<void> {
      const removed = await repository.deleteSession(hashToken(token));
      if (!removed.ok) {
        await logProblem(removed.errors.join('; '), 'auth.sign-out');
      }
    },

    async authenticate(token: string | null): Promise<AuthUser | null> {
      if (token === null || token === '') {
        return null;
      }
      const found = await repository.findSession(hashToken(token), now());
      if (!found.ok) {
        await logProblem(found.errors.join('; '), 'auth.session');
        return null;
      }
      return found.value?.user ?? null;
    },
  };
}

function rateLimitedResult(retryAfterSeconds: number): AuthResult<never> {
  return {
    ok: false,
    kind: 'rateLimited',
    errors: [`Too many attempts. Try again in ${retryAfterSeconds} seconds.`],
    retryAfterSeconds,
  };
}
