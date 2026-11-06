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
 * The HTTP layer, written as plain functions of (service, request) so it can
 * be tested without running Next.js. The route files only wire these up.
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

export async function listProjects(service: ProjectService): Promise<Response> {
  const listed = await service.list();
  return listed.ok
    ? jsonResponse({ projects: listed.value })
    : failureResponse(listed);
}

export async function createProject(
  service: ProjectService,
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
  const created = await service.create({
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
  id: string
): Promise<Response> {
  if (!isProjectId(id)) {
    return badId(id);
  }
  const found = await service.get(id);
  return found.ok
    ? jsonResponse({ project: found.value })
    : failureResponse(found);
}

export async function saveProject(
  service: ProjectService,
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
  const saved = await service.saveCourse(id, body.value);
  return saved.ok
    ? jsonResponse({ project: saved.value })
    : failureResponse(saved);
}

export async function exportProject(
  service: ProjectService,
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
  const exported = await service.exportProject(id, standard);
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

export async function previewProject(
  service: ProjectService,
  id: string,
  pathSegments: readonly string[]
): Promise<Response> {
  if (!isProjectId(id)) {
    return badId(id);
  }
  const filePath: string = pathSegments.join('/');
  const file = await service.preview(id, filePath);
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
