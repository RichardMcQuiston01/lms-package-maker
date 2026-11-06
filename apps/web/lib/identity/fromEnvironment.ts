import {
  createSingleUserIdentityProvider,
  createTrustedHeaderIdentityProvider,
  type IdentityProvider,
} from '@richardmcquiston01/lms-package-maker-identity';
import type { AuthService } from '../auth/service';
import { createBuiltInIdentityProvider } from './builtIn';

export const IDENTITY_PROVIDERS = ['builtin', 'header', 'single-user'] as const;

export interface IdentitySetup {
  readonly identity: IdentityProvider;
  /**
   * The app's own sign-in, sign-up and sign-out. Present only for the
   * `builtin` provider; with any other provider those screens are off.
   */
  readonly accounts: AuthService | null;
}

export type IdentitySetupResult =
  | { readonly ok: true; readonly value: IdentitySetup }
  | { readonly ok: false; readonly errors: readonly string[] };

type Environment = Readonly<Record<string, string | undefined>>;

function optional(env: Environment, name: string): string | undefined {
  const value: string | undefined = env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

/**
 * Chooses who decides "who is signed in", from environment variables:
 *
 * - `IDENTITY_PROVIDER=builtin` (default): the app's own email and password.
 * - `IDENTITY_PROVIDER=header`: a login proxy in front of the app sets headers.
 * - `IDENTITY_PROVIDER=single-user`: no sign-in, for one person on their own machine.
 *
 * `createAccounts` is only called for `builtin`, so other modes never touch
 * the accounts tables.
 */
export function createIdentitySetup(
  env: Environment,
  createAccounts: () => AuthService
): IdentitySetupResult {
  const choice: string = optional(env, 'IDENTITY_PROVIDER') ?? 'builtin';
  switch (choice) {
    case 'builtin': {
      const accounts: AuthService = createAccounts();
      return {
        ok: true,
        value: { identity: createBuiltInIdentityProvider(accounts), accounts },
      };
    }
    case 'header': {
      const secret: string | undefined = optional(env, 'IDENTITY_PROXY_SECRET');
      if (secret === undefined) {
        return {
          ok: false,
          errors: [
            'IDENTITY_PROVIDER=header needs IDENTITY_PROXY_SECRET: a secret of at least 16 characters that your login proxy sends with every request, so the app can tell real proxy headers from forged ones',
          ],
        };
      }
      const created = createTrustedHeaderIdentityProvider({
        userHeader: optional(env, 'IDENTITY_USER_HEADER') ?? 'x-forwarded-user',
        nameHeader:
          optional(env, 'IDENTITY_NAME_HEADER') ??
          'x-forwarded-preferred-username',
        emailHeader:
          optional(env, 'IDENTITY_EMAIL_HEADER') ?? 'x-forwarded-email',
        secretHeader:
          optional(env, 'IDENTITY_SECRET_HEADER') ?? 'x-identity-proxy-secret',
        secret,
        signInUrl: optional(env, 'IDENTITY_SIGN_IN_URL') ?? null,
        signOutUrl: optional(env, 'IDENTITY_SIGN_OUT_URL') ?? null,
      });
      return created.ok
        ? { ok: true, value: { identity: created.value, accounts: null } }
        : { ok: false, errors: created.errors };
    }
    case 'single-user': {
      if (
        env['NODE_ENV'] === 'production' &&
        optional(env, 'IDENTITY_SINGLE_USER_ACKNOWLEDGED') !== 'true'
      ) {
        return {
          ok: false,
          errors: [
            'IDENTITY_PROVIDER=single-user turns sign-in off, so anyone who can reach the app can use it. In production set IDENTITY_SINGLE_USER_ACKNOWLEDGED=true to confirm only one trusted person can reach this server',
          ],
        };
      }
      const name: string | undefined = optional(env, 'SINGLE_USER_NAME');
      return {
        ok: true,
        value: {
          identity: createSingleUserIdentityProvider(
            name === undefined ? {} : { displayName: name }
          ),
          accounts: null,
        },
      };
    }
    default:
      return {
        ok: false,
        errors: [
          `IDENTITY_PROVIDER '${choice}' is not known; use one of: ${IDENTITY_PROVIDERS.join(', ')}`,
        ],
      };
  }
}
