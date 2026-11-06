import {
  validateIdentity,
  type Identity,
  type IdentityProvider,
  type IdentityResult,
} from '@richardmcquiston01/lms-package-maker-identity';
import { isSameOriginRequest } from '../auth/http';
import { errorResponse, jsonResponse } from './http';

export type RequestUser =
  | { readonly ok: true; readonly user: Identity }
  | { readonly ok: false; readonly response: Response };

function signedOutResponse(identity: IdentityProvider): Response {
  return jsonResponse(
    {
      error: 'You need to sign in to do this.',
      details: [],
      signInUrl: identity.signInUrl,
    },
    401
  );
}

/**
 * Works out who is calling by asking the identity provider. Cross-site writes
 * are refused, nobody signed in gets a 401 that says where to sign in, and an
 * identity the app cannot accept is refused with the reason.
 */
export async function authenticateRequest(
  identity: IdentityProvider,
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
  let result: IdentityResult;
  try {
    result = await identity.identify({ headers: request.headers });
  } catch (cause: unknown) {
    // Providers should not throw, but a host's might; never let that become a 500 page.
    const reason: string =
      cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      response: errorResponse(
        401,
        `The '${identity.name}' identity provider failed: ${reason}`
      ),
    };
  }
  if (!result.ok) {
    return {
      ok: false,
      response: errorResponse(
        401,
        `The '${identity.name}' identity provider could not tell who you are: ${result.errors.join('; ')}`,
        result.errors
      ),
    };
  }
  if (result.value === null) {
    return { ok: false, response: signedOutResponse(identity) };
  }
  const checked = validateIdentity(result.value);
  if (!checked.ok) {
    return {
      ok: false,
      response: errorResponse(
        401,
        `The '${identity.name}' identity provider returned an identity the app cannot use: ${checked.errors.join('; ')}`,
        checked.errors
      ),
    };
  }
  return { ok: true, user: checked.value };
}
