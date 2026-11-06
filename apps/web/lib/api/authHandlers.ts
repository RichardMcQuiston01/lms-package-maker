import {
  clientAddress,
  isSameOriginRequest,
  isSecureRequest,
  readSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from '../auth/http';
import type { AuthResult, AuthService, StartedSession } from '../auth/service';
import { errorResponse, jsonResponse, readJsonBody } from './http';

/** Sign-up, sign-in and sign-out over JSON. */

function authFailure(
  failure: Extract<AuthResult<unknown>, { ok: false }>
): Response {
  const first: string = failure.errors[0] ?? 'unknown error';
  switch (failure.kind) {
    case 'invalid':
      return errorResponse(400, first, failure.errors);
    case 'unauthorized':
      return errorResponse(401, first, failure.errors);
    case 'forbidden':
      return errorResponse(403, first, failure.errors);
    case 'rateLimited': {
      const response: Response = errorResponse(429, first, failure.errors);
      response.headers.set(
        'Retry-After',
        String(failure.retryAfterSeconds ?? 60)
      );
      return response;
    }
    case 'failed':
      return errorResponse(
        500,
        `The server could not complete the request: ${first}`,
        failure.errors
      );
  }
}

function startedResponse(
  started: StartedSession,
  request: Request,
  status: number
): Response {
  const response: Response = jsonResponse({ user: started.user }, status);
  response.headers.append(
    'Set-Cookie',
    serializeSessionCookie(
      started.token,
      started.expiresAt,
      isSecureRequest(request)
    )
  );
  return response;
}

function stringField(
  record: Record<string, unknown>,
  key: string
): string | null {
  const value: unknown = record[key];
  return typeof value === 'string' ? value : null;
}

async function readCredentials(
  request: Request,
  keys: readonly string[]
): Promise<
  | { ok: true; fields: Record<string, string> }
  | { ok: false; response: Response }
> {
  if (!isSameOriginRequest(request)) {
    return {
      ok: false,
      response: errorResponse(
        403,
        'This request came from another site, so it was refused.'
      ),
    };
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    return { ok: false, response: body.response };
  }
  if (
    typeof body.value !== 'object' ||
    body.value === null ||
    Array.isArray(body.value)
  ) {
    return {
      ok: false,
      response: errorResponse(400, 'The request body must be a JSON object'),
    };
  }
  const record = body.value as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const key of keys) {
    const value: string | null = stringField(record, key);
    if (value === null) {
      return {
        ok: false,
        response: errorResponse(
          400,
          `The request body needs a string '${key}'`
        ),
      };
    }
    fields[key] = value;
  }
  return { ok: true, fields };
}

export async function signUpHandler(
  auth: AuthService,
  request: Request
): Promise<Response> {
  const read = await readCredentials(request, [
    'email',
    'password',
    'displayName',
  ]);
  if (!read.ok) {
    return read.response;
  }
  const started = await auth.signUp(
    {
      email: read.fields['email'] ?? '',
      password: read.fields['password'] ?? '',
      displayName: read.fields['displayName'] ?? '',
    },
    clientAddress(request)
  );
  return started.ok
    ? startedResponse(started.value, request, 201)
    : authFailure(started);
}

export async function signInHandler(
  auth: AuthService,
  request: Request
): Promise<Response> {
  const read = await readCredentials(request, ['email', 'password']);
  if (!read.ok) {
    return read.response;
  }
  const started = await auth.signIn(
    {
      email: read.fields['email'] ?? '',
      password: read.fields['password'] ?? '',
    },
    clientAddress(request)
  );
  return started.ok
    ? startedResponse(started.value, request, 200)
    : authFailure(started);
}

export async function signOutHandler(
  auth: AuthService,
  request: Request
): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return errorResponse(
      403,
      'This request came from another site, so it was refused.'
    );
  }
  const token: string | null = readSessionToken(request.headers.get('cookie'));
  if (token !== null) {
    await auth.signOut(token);
  }
  const response: Response = jsonResponse({ signedOut: true });
  response.headers.append(
    'Set-Cookie',
    serializeClearedSessionCookie(isSecureRequest(request))
  );
  return response;
}
