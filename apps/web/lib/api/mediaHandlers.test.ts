import { describe, expect, test } from 'bun:test';
import { TINY_PNG } from '../media/fixtures';
import { createTestServices } from '../testSupport';
import {
  deleteMedia,
  listMedia,
  readMedia,
  uploadMedia,
} from './mediaHandlers';

const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';

function uploadRequest(
  file: Blob | string | null,
  name = 'cat.png',
  fieldName = 'file'
): Request {
  const form = new FormData();
  if (file instanceof Blob) form.append(fieldName, file, name);
  else if (file !== null) form.append(fieldName, file);
  return new Request('http://app.test/api/projects/x/media', {
    method: 'POST',
    body: form,
  });
}

async function setup() {
  const ctx = createTestServices();
  const created = await ctx.service.create(OWNER, { title: 'Course' });
  if (!created.ok) throw new Error('create failed');
  return { ...ctx, projectId: created.value.id };
}

async function uploadOne(
  ctx: Awaited<ReturnType<typeof setup>>
): Promise<{ id: string; url: string }> {
  const response = await uploadMedia(
    ctx.media,
    OWNER,
    ctx.projectId,
    uploadRequest(new Blob([TINY_PNG]), 'cat.png')
  );
  return ((await response.json()) as { media: { id: string; url: string } })
    .media;
}

describe('media HTTP handlers', () => {
  test('upload answers 201 with the file facts and a url, and the list shows it', async () => {
    const ctx = await setup();
    const response = await uploadMedia(
      ctx.media,
      OWNER,
      ctx.projectId,
      uploadRequest(new Blob([TINY_PNG]), 'cat.png')
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { media: Record<string, unknown> };
    expect(body.media).toMatchObject({
      fileName: 'cat.png',
      contentType: 'image/png',
      kind: 'image',
      byteSize: TINY_PNG.length,
    });
    expect(body.media['url']).toBe(
      `/api/projects/${ctx.projectId}/media/${body.media['id']}`
    );
    const listed = (await (
      await listMedia(ctx.media, OWNER, ctx.projectId)
    ).json()) as { media: unknown[] };
    expect(listed.media.length).toBe(1);
  });

  test('upload explains a missing file, a non-multipart body and an unsupported type', async () => {
    const ctx = await setup();
    const missing = await uploadMedia(
      ctx.media,
      OWNER,
      ctx.projectId,
      uploadRequest(null)
    );
    expect(missing.status).toBe(400);
    const textField = await uploadMedia(
      ctx.media,
      OWNER,
      ctx.projectId,
      uploadRequest('not a file')
    );
    expect(((await textField.json()) as { error: string }).error).toContain(
      "field named 'file'"
    );
    const json = await uploadMedia(
      ctx.media,
      OWNER,
      ctx.projectId,
      new Request('http://app.test/x', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      })
    );
    expect(((await json.json()) as { error: string }).error).toContain(
      'multipart/form-data'
    );
    const text = await uploadMedia(
      ctx.media,
      OWNER,
      ctx.projectId,
      uploadRequest(new Blob(['<script>1</script>']), 'x.png')
    );
    expect(text.status).toBe(400);
    expect(((await text.json()) as { error: string }).error).toContain(
      'not supported'
    );
  });

  test('a declared size over the limit is refused with 413 before reading the body', async () => {
    const ctx = await setup();
    const request = new Request('http://app.test/x', {
      method: 'POST',
      body: '{}',
      headers: { 'content-length': String(500 * 1024 * 1024) },
    });
    const response = await uploadMedia(
      ctx.media,
      OWNER,
      ctx.projectId,
      request
    );
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: string }).error).toContain(
      'over the 25 MB limit'
    );
  });

  test('the file is sent with headers that stop it being treated as anything else', async () => {
    const ctx = await setup();
    const media = await uploadOne(ctx);
    const response = await readMedia(ctx.media, OWNER, ctx.projectId, media.id);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toContain(
      'sandbox'
    );
    expect(
      Buffer.from(await response.arrayBuffer()).equals(Buffer.from(TINY_PNG))
    ).toBe(true);
  });

  test('other people get 404, bad ids get 400, and delete works for the owner', async () => {
    const ctx = await setup();
    const media = await uploadOne(ctx);
    expect(
      (await readMedia(ctx.media, STRANGER, ctx.projectId, media.id)).status
    ).toBe(404);
    expect((await listMedia(ctx.media, STRANGER, ctx.projectId)).status).toBe(
      404
    );
    expect(
      (await deleteMedia(ctx.media, STRANGER, ctx.projectId, media.id)).status
    ).toBe(404);
    expect(
      (await readMedia(ctx.media, OWNER, ctx.projectId, '../secret')).status
    ).toBe(400);
    expect((await listMedia(ctx.media, OWNER, 'nope')).status).toBe(400);
    expect(
      (await deleteMedia(ctx.media, OWNER, ctx.projectId, media.id)).status
    ).toBe(200);
    expect(
      (await readMedia(ctx.media, OWNER, ctx.projectId, media.id)).status
    ).toBe(404);
  });
});
