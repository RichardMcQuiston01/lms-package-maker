import { isSameOriginRequest, readSessionToken } from '../auth/http';
import type { AuthService } from '../auth/service';
import type { AuthUser } from '../auth/types';
import { errorResponse } from './http';

export type RequestUser =
  | { readonly ok: true; readonly user: AuthUser }
  | { readonly ok: false; readonly response: Response };

/**
 * Works out who is calling. Cross-site writes are refused, and a missing or
 * expired session gets a 401 that says how to fix it.
 */
export async function authenticateRequest(
  auth: AuthService,
  request: Request
): Promise<RequestUser> {
  if (!isSameOriginRequest(request)) {
    return {
      ok: false,
      response: errorResponse(
        403,
        'This request came from another site, so it was refused.'
      ),
    };
  }
  const user: AuthUser | null = await auth.authenticate(
    readSessionToken(request.headers.get('cookie'))
  );
  if (user === null) {
    return {
      ok: false,
      response: errorResponse(401, 'You need to sign in to do this.'),
    };
  }
  return { ok: true, user };
}
