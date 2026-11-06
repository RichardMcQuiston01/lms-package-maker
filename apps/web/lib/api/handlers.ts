import type { PreviewAccess } from '../auth/tokens';
import {
  isSupportedStandard,
  SUPPORTED_STANDARDS,
  type ProjectService,
} from '../projects/service';
import {
  errorResponse,
  failureResponse,
  isProjectId,
  jsonResponse,
  readJsonBody,
} from './http';

/**
 * The project HTTP layer, written as plain functions so it can be tested
 * without running Next.js. Every function takes the signed-in owner's id;
 * the route files get it from the session cookie before calling these.
 */

const PREVIEW_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  'img-src * data:',
  "frame-ancestors 'self'",
].join('; ');

function badId(id: string): Response {
  return errorResponse(
    400,
    `'${id}' is not a valid project id; expected a UUID`
  );
}

export async function listProjects(
  service: ProjectService,
  ownerId: string
): Promise<Response> {
  const listed = await service.list(ownerId);
  return listed.ok
    ? jsonResponse({ projects: listed.value })
    : failureResponse(listed);
}

export async function createProject(
  service: ProjectService,
  ownerId: string,
  request: Request
): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return body.response;
  }
  const input = body.value;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return errorResponse(
      400,
      'The request body must be a JSON object with a title'
    );
  }
  const record = input as Record<string, unknown>;
  if (typeof record['title'] !== 'string') {
    return errorResponse(400, "The request body needs a string 'title'");
  }
  const created = await service.create(ownerId, {
    title: record['title'],
    ...(typeof record['description'] === 'string'
      ? { description: record['description'] }
      : {}),
    ...(typeof record['language'] === 'string'
      ? { language: record['language'] }
      : {}),
  });
  return created.ok
    ? jsonResponse({ project: created.value }, 201)
    : failureResponse(created);
}

export async function getProject(
  service: ProjectService,
  ownerId: string,
  id: string
): Promise<Response> {
  if (!isProjectId(id)) {
    return badId(id);
  }
  const found = await service.get(id, ownerId);
  return found.ok
    ? jsonResponse({ project: found.value })
    : failureResponse(found);
}

export async function saveProject(
  service: ProjectService,
  ownerId: string,
  id: string,
  request: Request
): Promise<Response> {
  if (!isProjectId(id)) {
    return badId(id);
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    return body.response;
  }
  const saved = await service.saveCourse(id, ownerId, body.value);
  return saved.ok
    ? jsonResponse({ project: saved.value })
    : failureResponse(saved);
}

export async function exportProject(
  service: ProjectService,
  ownerId: string,
  id: string,
  standard: string | null
): Promise<Response> {
  if (!isProjectId(id)) {
    return badId(id);
  }
  if (standard === null || !isSupportedStandard(standard)) {
    return errorResponse(
      400,
      `The 'standard' query parameter must be one of ${SUPPORTED_STANDARDS.join(', ')}; got '${standard ?? ''}'`
    );
  }
  const exported = await service.exportProject(id, ownerId, standard);
  if (!exported.ok) {
    return failureResponse(exported);
  }
  return new Response(Buffer.from(exported.value.bytes), {
    status: 200,
    headers: {
      'Content-Type': exported.value.contentType,
      'Content-Disposition': `attachment; filename="${exported.value.fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Gives the editor a fresh signed link to the preview of a project it owns. */
export async function previewLink(
  service: ProjectService,
  access: PreviewAccess,
  ownerId: string,
  id: string
): Promise<Response> {
  if (!isProjectId(id)) {
    return badId(id);
  }
  const found = await service.get(id, ownerId);
  if (!found.ok) {
    return failureResponse(found);
  }
  return jsonResponse({ url: access.urlFor(id, ownerId) });
}

/**
 * Serves a preview file. The sandboxed preview frame cannot send the session
 * cookie, so this route is opened with the signed token from `previewLink`.
 */
export async function previewProject(
  service: ProjectService,
  access: PreviewAccess,
  id: string,
  token: string,
  pathSegments: readonly string[]
): Promise<Response> {
  if (!isProjectId(id)) {
    return badId(id);
  }
  const verified = access.verify(id, token);
  if (!verified.ok) {
    return errorResponse(
      403,
      `The preview link was refused: ${verified.errors[0] ?? 'invalid'}`
    );
  }
  const file = await service.preview(
    id,
    verified.value.userId,
    pathSegments.join('/')
  );
  if (!file.ok) {
    return failureResponse(file);
  }
  return new Response(Buffer.from(file.value.bytes), {
    status: 200,
    headers: {
      'Content-Type': file.value.contentType,
      'Content-Security-Policy': PREVIEW_CONTENT_SECURITY_POLICY,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}
