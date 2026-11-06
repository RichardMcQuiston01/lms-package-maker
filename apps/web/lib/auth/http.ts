/** Cookie and same-origin helpers for the session. */

export const SESSION_COOKIE_NAME = 'lpm_session';

/** True when the request reached us over HTTPS, directly or through a proxy. */
export function isSecureRequest(request: Request): boolean {
  const forwarded: string | null = request.headers.get('x-forwarded-proto');
  if (forwarded !== null) {
    return forwarded.split(',')[0]?.trim() === 'https';
  }
  return new URL(request.url).protocol === 'https:';
}

export function serializeSessionCookie(
  token: string,
  expiresAt: Date,
  secure: boolean
): string {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function serializeClearedSessionCookie(secure: boolean): string {
  return serializeSessionCookie('', new Date(0), secure);
}

/** The session token from a Cookie header, or null. */
export function readSessionToken(cookieHeader: string | null): string | null {
  if (cookieHeader === null) {
    return null;
  }
  for (const part of cookieHeader.split(';')) {
    const separator: number = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === SESSION_COOKIE_NAME) {
      const value: string = part.slice(separator + 1).trim();
      return value === '' ? null : value;
    }
  }
  return null;
}

const SAFE_METHODS: readonly string[] = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Rejects a state-changing request that a browser says came from another
 * site. This backs up the SameSite=Lax cookie. Requests with neither header
 * (scripts, tests) are allowed, since a cross-site browser request always
 * carries one of them.
 */
export function isSameOriginRequest(request: Request): boolean {
  if (SAFE_METHODS.includes(request.method.toUpperCase())) {
    return true;
  }
  const fetchSite: string | null = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') {
    return false;
  }
  const origin: string | null = request.headers.get('origin');
  if (origin === null) {
    return true;
  }
  const host: string | null =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Best-effort client address for rate limiting; empty values become 'unknown'. */
export function clientAddress(request: Request): string {
  const forwarded: string | null = request.headers.get('x-forwarded-for');
  const first: string = forwarded?.split(',')[0]?.trim() ?? '';
  return first === '' ? 'unknown' : first;
}
