import { describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { createTestServices } from '../testSupport';
import {
  createProject,
  exportProject,
  getProject,
  listProjects,
  previewProject,
  saveProject,
} from './handlers';

function jsonRequest(body: unknown): Request {
  return new Request('http://app.test/api/projects', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function createOne(): Promise<{
  id: string;
  ctx: ReturnType<typeof createTestServices>;
}> {
  const ctx = createTestServices();
  const response: Response = await createProject(
    ctx.service,
    jsonRequest({ title: 'Course' })
  );
  const body = (await response.json()) as { project: { id: string } };
  return { id: body.project.id, ctx };
}

describe('API handlers', () => {
  test('create returns 201 and list shows the project', async () => {
    const { ctx } = await createOne();
    const listed = await listProjects(ctx.service);
    const body = (await listed.json()) as { projects: { name: string }[] };
    expect(listed.status).toBe(200);
    expect(body.projects.map((project) => project.name)).toEqual(['Course']);
  });

  test('create explains a missing title and bad JSON', async () => {
    const { service } = createTestServices();
    const missing = await createProject(service, jsonRequest({}));
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: string }).error).toContain(
      "'title'"
    );
    const broken = await createProject(service, jsonRequest('{nope'));
    expect(broken.status).toBe(400);
    expect(((await broken.json()) as { error: string }).error).toContain(
      'valid JSON'
    );
  });

  test('rejects ids that are not UUIDs before touching storage', async () => {
    const { service } = createTestServices();
    const response = await getProject(service, '../etc/passwd');
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain(
      'UUID'
    );
  });

  test('get returns 404 for an unknown project', async () => {
    const { service } = createTestServices();
    const response = await getProject(
      service,
      '00000000-0000-4000-8000-0000000000ff'
    );
    expect(response.status).toBe(404);
  });

  test('save returns 400 with every error for an invalid course', async () => {
    const { id, ctx } = await createOne();
    const response = await saveProject(
      ctx.service,
      id,
      jsonRequest({ modelVersion: 3 })
    );
    const body = (await response.json()) as { details: string[] };
    expect(response.status).toBe(400);
    expect(body.details.length).toBeGreaterThan(1);
  });

  test('export streams a zip with a download name; bad standard is 400', async () => {
    const { id, ctx } = await createOne();
    const response = await exportProject(ctx.service, id, 'scorm12');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="course-scorm12.zip"'
    );
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(files)).toContain('imsmanifest.xml');
    const bad = await exportProject(ctx.service, id, 'aicc');
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toContain(
      'html5, scorm12'
    );
  });

  test('preview sets a locked-down content security policy', async () => {
    const { id, ctx } = await createOne();
    const response = await previewProject(ctx.service, id, []);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "script-src 'self'"
    );
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const missing = await previewProject(ctx.service, id, ['..', 'secret']);
    expect(missing.status).toBe(404);
  });
});
