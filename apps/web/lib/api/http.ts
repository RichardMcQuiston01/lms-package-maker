import type { ServiceResult } from '../serviceResult';

export interface ApiError {
  readonly error: string;
  readonly details: readonly string[];
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function errorResponse(
  status: number,
  error: string,
  details: readonly string[] = []
): Response {
  const body: ApiError = { error, details };
  return jsonResponse(body, status);
}

const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProjectId(value: string): boolean {
  return PROJECT_ID_PATTERN.test(value);
}

/** Turns a failed service call into an HTTP error response. */
export function failureResponse(
  failure: Extract<ServiceResult<unknown>, { ok: false }>
): Response {
  const first: string = failure.errors[0] ?? 'unknown error';
  switch (failure.kind) {
    case 'invalid':
      return errorResponse(
        400,
        `The request was not valid: ${first}`,
        failure.errors
      );
    case 'notFound':
      return errorResponse(404, first, failure.errors);
    case 'tooLarge':
      return errorResponse(413, first, failure.errors);
    case 'failed':
      return errorResponse(
        500,
        `The server could not complete the request: ${first}`,
        failure.errors
      );
  }
}

/** Reads a JSON body, or returns an explanation of why it could not. */
export async function readJsonBody(
  request: Request
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: await request.json() };
  } catch (cause: unknown) {
    const reason: string =
      cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      response: errorResponse(
        400,
        `The request body must be valid JSON: ${reason}`
      ),
    };
  }
}

/** Answer for the built-in sign-in routes when another identity provider is in use. */
export function builtInSignInOff(providerName: string): Response {
  return errorResponse(
    404,
    `Built-in sign-in is turned off because the '${providerName}' identity provider is in use. Sign in through that provider instead.`
  );
}
