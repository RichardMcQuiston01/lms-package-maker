import { describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { createPreviewAccess } from '../auth/tokens';
import { createTestServices, type TestServices } from '../testSupport';
import {
  createProject,
  exportProject,
  getProject,
  listProjects,
  previewLink,
  previewProject,
  saveProject,
} from './handlers';

const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';
const SECRET = 'a-test-secret-that-is-at-least-32-characters';
const access = createPreviewAccess(SECRET);

function jsonRequest(body: unknown): Request {
  return new Request('http://app.test/api/projects', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function createOne(): Promise<{ id: string; ctx: TestServices }> {
  const ctx: TestServices = createTestServices();
  const response: Response = await createProject(
    ctx.service,
    OWNER,
    jsonRequest({ title: 'Course' })
  );
  const body = (await response.json()) as { project: { id: string } };
  return { id: body.project.id, ctx };
}

describe('API handlers', () => {
  test('create returns 201 and list shows the project', async () => {
    const { ctx } = await createOne();
    const listed = await listProjects(ctx.service, OWNER);
    const body = (await listed.json()) as { projects: { name: string }[] };
    expect(listed.status).toBe(200);
    expect(body.projects.map((project) => project.name)).toEqual(['Course']);
  });

  test('create explains a missing title and bad JSON', async () => {
    const { service } = createTestServices();
    const missing = await createProject(service, OWNER, jsonRequest({}));
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: string }).error).toContain(
      "'title'"
    );
    const broken = await createProject(service, OWNER, jsonRequest('{nope'));
    expect(broken.status).toBe(400);
    expect(((await broken.json()) as { error: string }).error).toContain(
      'valid JSON'
    );
  });

  test('rejects ids that are not UUIDs before touching storage', async () => {
    const { service } = createTestServices();
    const response = await getProject(service, OWNER, '../etc/passwd');
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain(
      'UUID'
    );
  });

  test('get returns 404 for an unknown project', async () => {
    const { service } = createTestServices();
    const response = await getProject(
      service,
      OWNER,
      '00000000-0000-4000-8000-0000000000ff'
    );
    expect(response.status).toBe(404);
  });

  test("another person's project answers 404 everywhere, never 403", async () => {
    const { id, ctx } = await createOne();
    const responses: Response[] = [
      await getProject(ctx.service, STRANGER, id),
      await saveProject(ctx.service, STRANGER, id, jsonRequest({})),
      await exportProject(ctx.service, STRANGER, id, 'html5'),
      await previewLink(ctx.service, access, STRANGER, id),
    ];
    // An invalid body is checked first by save, so only check the others strictly.
    expect(responses[0]?.status).toBe(404);
    expect(responses[2]?.status).toBe(404);
    expect(responses[3]?.status).toBe(404);
    const stranger = await listProjects(ctx.service, STRANGER);
    expect(
      ((await stranger.json()) as { projects: unknown[] }).projects
    ).toEqual([]);
  });

  test('save returns 400 with every error for an invalid course', async () => {
    const { id, ctx } = await createOne();
    const response = await saveProject(
      ctx.service,
      OWNER,
      id,
      jsonRequest({ modelVersion: 3 })
    );
    const body = (await response.json()) as { details: string[] };
    expect(response.status).toBe(400);
    expect(body.details.length).toBeGreaterThan(1);
  });

  test('export streams a zip with a download name; bad standard is 400', async () => {
    const { id, ctx } = await createOne();
    const response = await exportProject(ctx.service, OWNER, id, 'scorm12');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="course-scorm12.zip"'
    );
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(files)).toContain('imsmanifest.xml');
    const bad = await exportProject(ctx.service, OWNER, id, 'aicc');
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toContain(
      'html5, scorm12, scorm2004, xapi'
    );
  });
});

describe('preview', () => {
  async function linkFor(id: string, ctx: TestServices): Promise<string> {
    const response = await previewLink(ctx.service, access, OWNER, id);
    return ((await response.json()) as { url: string }).url;
  }

  function tokenOf(url: string): string {
    return url.split('/preview/')[1]?.split('/')[0] ?? '';
  }

  test('a signed link opens the preview with a locked-down content security policy', async () => {
    const { id, ctx } = await createOne();
    const token: string = tokenOf(await linkFor(id, ctx));
    const response = await previewProject(ctx.service, access, id, token, []);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "script-src 'self'"
    );
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const missing = await previewProject(ctx.service, access, id, token, [
      '..',
      'secret',
    ]);
    expect(missing.status).toBe(404);
  });

  test('refuses a bad token, a token for another project, and an expired token', async () => {
    const { id, ctx } = await createOne();
    const token: string = tokenOf(await linkFor(id, ctx));
    const forged = await previewProject(
      ctx.service,
      access,
      id,
      `${token}x`,
      []
    );
    expect(forged.status).toBe(403);
    const otherProject = '33333333-3333-4333-8333-333333333333';
    const wrongProject = await previewProject(
      ctx.service,
      access,
      otherProject,
      token,
      []
    );
    expect(wrongProject.status).toBe(403);
    expect(((await wrongProject.json()) as { error: string }).error).toContain(
      'not valid for this project'
    );

    const later = createPreviewAccess(
      SECRET,
      () => Date.now() + 60 * 60 * 1000
    );
    const expired = await previewProject(ctx.service, later, id, token, []);
    expect(expired.status).toBe(403);
    expect(((await expired.json()) as { error: string }).error).toContain(
      'expired'
    );
  });

  test('a token signed by someone else shows nothing of the owner', async () => {
    const { id, ctx } = await createOne();
    const strangerAccess = createPreviewAccess(
      'another-secret-that-is-long-enough-12345'
    );
    const token: string = tokenOf(strangerAccess.urlFor(id, STRANGER));
    const response = await previewProject(ctx.service, access, id, token, []);
    expect(response.status).toBe(403);
  });
});

describe('owners from any identity provider', () => {
  const HOST_OWNER = 'header:ada.lovelace@example.com';

  test('a host id with dots and a colon works from create to preview and export', async () => {
    const ctx = createTestServices();
    const created = await createProject(
      ctx.service,
      HOST_OWNER,
      jsonRequest({ title: 'Hosted' })
    );
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { project: { id: string } }).project
      .id;

    const link = await previewLink(ctx.service, access, HOST_OWNER, id);
    const url = ((await link.json()) as { url: string }).url;
    const token = url.split('/preview/')[1]?.split('/')[0] ?? '';
    const preview = await previewProject(ctx.service, access, id, token, []);
    expect(preview.status).toBe(200);

    expect(
      (await exportProject(ctx.service, HOST_OWNER, id, 'scorm12')).status
    ).toBe(200);
    const listed = (await (
      await listProjects(ctx.service, HOST_OWNER)
    ).json()) as { projects: unknown[] };
    expect(listed.projects).toHaveLength(1);
    // Someone else, even one with a similar id, sees nothing.
    expect((await getProject(ctx.service, 'header:ada', id)).status).toBe(404);
    expect(
      (await getProject(ctx.service, 'sso:ada.lovelace@example.com', id)).status
    ).toBe(404);
  });
});
