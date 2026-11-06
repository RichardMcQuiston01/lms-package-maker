import type {
  Identity,
  IdentityProvider,
  IdentityRequest,
  IdentityResult,
  Result,
} from './types.js';
import {
  cleanText,
  constantTimeEqual,
  hasNoControlCharacters,
  IDENTITY_LIMITS,
  validateIdentity,
} from './validate.js';

export interface TrustedHeaderOptions {
  /** Header the login proxy sets to the person's stable id, such as `x-forwarded-user`. */
  readonly userHeader: string;
  readonly nameHeader?: string;
  readonly emailHeader?: string;
  /** Header the proxy sets to the shared secret on every request it forwards. */
  readonly secretHeader: string;
  /** The shared secret, at least 16 characters. */
  readonly secret: string;
  /** Put in front of every id so ids from different sources never collide. Default `header`. */
  readonly idPrefix?: string;
  readonly signInUrl?: string | null;
  readonly signOutUrl?: string | null;
}

export const MIN_SECRET_LENGTH = 16;
const HEADER_NAME: RegExp = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

/**
 * For apps that sit behind a login proxy (oauth2-proxy, Authelia, an ingress
 * with SSO, ...). The proxy authenticates people and tells the app who they are
 * in a header. Because anyone who can reach the app directly could forge that
 * header, the proxy must also send a shared secret; a request without the
 * right secret is treated as not signed in. Keep the app reachable only
 * through the proxy as well.
 */
export function createTrustedHeaderIdentityProvider(
  options: TrustedHeaderOptions
): Result<IdentityProvider> {
  const errors: string[] = [];
  for (const [label, name] of [
    ['userHeader', options.userHeader],
    ['secretHeader', options.secretHeader],
    ['nameHeader', options.nameHeader],
    ['emailHeader', options.emailHeader],
  ] as const) {
    if (name !== undefined && !HEADER_NAME.test(name)) {
      errors.push(`${label} '${name}' is not a valid HTTP header name`);
    }
  }
  if (options.secret.length < MIN_SECRET_LENGTH) {
    errors.push(
      `secret must be at least ${MIN_SECRET_LENGTH} characters, got ${options.secret.length}`
    );
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const prefix: string = options.idPrefix ?? 'header';

  async function identify(request: IdentityRequest): Promise<IdentityResult> {
    const presented: string | null = request.headers.get(options.secretHeader);
    if (presented === null || !constantTimeEqual(presented, options.secret)) {
      // Not from the proxy: treat as signed out, whatever else the request claims.
      return { ok: true, value: null };
    }
    const rawId: string = (
      request.headers.get(options.userHeader) ?? ''
    ).trim();
    if (rawId === '') {
      return { ok: true, value: null };
    }
    if (
      !hasNoControlCharacters(rawId) ||
      rawId.length > IDENTITY_LIMITS.maxIdLength - prefix.length - 1
    ) {
      return {
        ok: false,
        errors: [
          `the '${options.userHeader}' header is not a usable id: it must be at most ${IDENTITY_LIMITS.maxIdLength - prefix.length - 1} characters without control characters`,
        ],
      };
    }
    const name: string = cleanText(
      options.nameHeader === undefined
        ? ''
        : (request.headers.get(options.nameHeader) ?? '')
    );
    const email: string = cleanText(
      options.emailHeader === undefined
        ? ''
        : (request.headers.get(options.emailHeader) ?? '')
    );
    const identity: Identity = {
      id: `${prefix}:${rawId}`,
      displayName: (name === '' ? rawId : name).slice(
        0,
        IDENTITY_LIMITS.maxDisplayNameLength
      ),
      ...(email === '' ? {} : { email }),
    };
    const checked: Result<Identity> = validateIdentity(identity);
    return checked.ok
      ? { ok: true, value: checked.value }
      : { ok: false, errors: checked.errors };
  }

  return {
    ok: true,
    value: {
      name: 'header',
      identify,
      signInUrl: options.signInUrl ?? null,
      signOutUrl: options.signOutUrl ?? null,
    },
  };
}
