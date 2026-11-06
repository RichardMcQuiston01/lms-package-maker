import { describe, expect, test } from 'bun:test';
import { createMemoryRepository } from '../projects/memoryRepository';
import { createMemoryStorage } from '../storage';
import { createRecordingErrorLog, createTestServices } from '../testSupport';
import { bytesStartingWith, TINY_PNG } from './fixtures';
import { createMemoryMediaRepository } from './memoryMediaRepository';
import { createMediaService } from './service';

const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';

async function projectWithOwner() {
  const ctx = createTestServices();
  const created = await ctx.service.create(OWNER, { title: 'Course' });
  if (!created.ok) throw new Error('create failed');
  return { ...ctx, project: created.value };
}

describe('media upload', () => {
  test('stores a file and reads the same bytes back', async () => {
    const { media, project } = await projectWithOwner();
    const uploaded = await media.upload(project.id, OWNER, {
      fileName: 'C:\\pics\\cat.png',
      bytes: TINY_PNG,
    });
    expect(uploaded.ok).toBe(true);
    if (!uploaded.ok) return;
    expect(uploaded.value).toMatchObject({
      fileName: 'cat.png',
      contentType: 'image/png',
      byteSize: TINY_PNG.length,
    });
    const read = await media.read(project.id, OWNER, uploaded.value.id);
    expect(
      read.ok && Buffer.from(read.value.bytes).equals(Buffer.from(TINY_PNG))
    ).toBe(true);
    const listed = await media.list(project.id, OWNER);
    expect(listed.ok && listed.value.map((entry) => entry.id)).toEqual([
      uploaded.value.id,
    ]);
  });

  test('decides the type from the bytes, not from the name', async () => {
    const { media, project } = await projectWithOwner();
    const fake = await media.upload(project.id, OWNER, {
      fileName: 'innocent.png',
      bytes: new TextEncoder().encode('<script>alert(1)</script>'),
    });
    expect(fake).toMatchObject({ ok: false, kind: 'invalid' });
    if (!fake.ok) expect(fake.errors[0]).toContain('PNG, JPEG, GIF, WebP');
    const renamed = await media.upload(project.id, OWNER, {
      fileName: 'video.mp4',
      bytes: TINY_PNG,
    });
    expect(renamed.ok && renamed.value.contentType).toBe('image/png');
  });

  test('rejects empty, oversized and too many files with clear messages', async () => {
    const ctx = createTestServices(createMemoryRepository(), {
      maxMediaBytes: 100,
      maxMediaPerProject: 2,
    });
    const created = await ctx.service.create(OWNER, { title: 'Course' });
    if (!created.ok) throw new Error('create failed');
    const id = created.value.id;
    const empty = await ctx.media.upload(id, OWNER, {
      fileName: 'a.png',
      bytes: new Uint8Array(),
    });
    expect(empty).toMatchObject({
      ok: false,
      kind: 'invalid',
      errors: ['the file is empty'],
    });
    const big = await ctx.media.upload(id, OWNER, {
      fileName: 'a.png',
      bytes: bytesStartingWith(
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        200
      ),
    });
    expect(big).toMatchObject({ ok: false, kind: 'tooLarge' });
    const small = bytesStartingWith([0xff, 0xd8, 0xff], 50);
    expect(
      (await ctx.media.upload(id, OWNER, { fileName: '1.jpg', bytes: small }))
        .ok
    ).toBe(true);
    expect(
      (await ctx.media.upload(id, OWNER, { fileName: '2.jpg', bytes: small }))
        .ok
    ).toBe(true);
    const third = await ctx.media.upload(id, OWNER, {
      fileName: '3.jpg',
      bytes: small,
    });
    expect(third).toMatchObject({ ok: false, kind: 'invalid' });
    if (!third.ok) expect(third.errors[0]).toContain('2 media files');
  });

  test("another person's course answers not found for every call", async () => {
    const { media, project } = await projectWithOwner();
    const uploaded = await media.upload(project.id, OWNER, {
      fileName: 'a.png',
      bytes: TINY_PNG,
    });
    if (!uploaded.ok) throw new Error('upload failed');
    const calls = [
      await media.upload(project.id, STRANGER, {
        fileName: 'a.png',
        bytes: TINY_PNG,
      }),
      await media.list(project.id, STRANGER),
      await media.read(project.id, STRANGER, uploaded.value.id),
      await media.remove(project.id, STRANGER, uploaded.value.id),
    ];
    for (const call of calls)
      expect(call).toMatchObject({ ok: false, kind: 'notFound' });
  });

  test('a file id from another course is not found', async () => {
    const ctx = createTestServices();
    const first = await ctx.service.create(OWNER, { title: 'One' });
    const second = await ctx.service.create(OWNER, { title: 'Two' });
    if (!first.ok || !second.ok) throw new Error('create failed');
    const uploaded = await ctx.media.upload(first.value.id, OWNER, {
      fileName: 'a.png',
      bytes: TINY_PNG,
    });
    if (!uploaded.ok) throw new Error('upload failed');
    expect(
      await ctx.media.read(second.value.id, OWNER, uploaded.value.id)
    ).toMatchObject({ ok: false, kind: 'notFound' });
  });
});

describe('using media in pages', () => {
  async function courseWithImage() {
    const ctx = await projectWithOwner();
    const uploaded = await ctx.media.upload(ctx.project.id, OWNER, {
      fileName: 'cat.png',
      bytes: TINY_PNG,
    });
    if (!uploaded.ok) throw new Error('upload failed');
    const pageId = ctx.project.course.modules[0]?.pages[0]?.id ?? '';
    const withImage = {
      ...ctx.project.course,
      modules: [
        {
          ...ctx.project.course.modules[0],
          pages: [
            {
              id: pageId,
              title: 'Cats',
              html: `<p>Look</p><img src="media:${uploaded.value.id}" alt="A cat">`,
            },
          ],
        },
      ],
    };
    return { ...ctx, mediaId: uploaded.value.id, withImage };
  }

  test('a saved page may use uploaded media, and unknown ids are refused by name', async () => {
    const { service, project, withImage, mediaId } = await courseWithImage();
    const saved = await service.saveCourse(project.id, OWNER, withImage);
    expect(saved.ok && saved.value.course.modules[0]?.pages[0]?.html).toContain(
      `media:${mediaId}`
    );
    const unknown = {
      ...withImage,
      modules: [
        {
          ...withImage.modules[0],
          pages: [
            {
              id: 'p',
              title: 'Broken page',
              html: '<img src="media:99999999-9999-4999-8999-999999999999" alt="">',
            },
          ],
        },
      ],
    };
    const refused = await service.saveCourse(project.id, OWNER, unknown);
    expect(refused).toMatchObject({ ok: false, kind: 'invalid' });
    if (!refused.ok) {
      expect(refused.errors[0]).toContain("page 'Broken page'");
      expect(refused.errors[0]).toContain('upload it first');
    }
  });

  test('media from another course cannot be referenced', async () => {
    const ctx = createTestServices();
    const mine = await ctx.service.create(OWNER, { title: 'Mine' });
    const theirs = await ctx.service.create(STRANGER, { title: 'Theirs' });
    if (!mine.ok || !theirs.ok) throw new Error('create failed');
    const secret = await ctx.media.upload(theirs.value.id, STRANGER, {
      fileName: 's.png',
      bytes: TINY_PNG,
    });
    if (!secret.ok) throw new Error('upload failed');
    const steal = {
      ...mine.value.course,
      modules: [
        {
          ...mine.value.course.modules[0],
          pages: [
            {
              id: 'p',
              title: 'P',
              html: `<img src="media:${secret.value.id}" alt="">`,
            },
          ],
        },
      ],
    };
    expect(
      await ctx.service.saveCourse(mine.value.id, OWNER, steal)
    ).toMatchObject({ ok: false, kind: 'invalid' });
  });

  test('exports carry the media, rewrite the links and list the files in the manifest', async () => {
    const { service, project, withImage, mediaId } = await courseWithImage();
    await service.saveCourse(project.id, OWNER, withImage);
    const { unzipSync } = await import('fflate');
    const scorm = await service.exportProject(project.id, OWNER, 'scorm12');
    expect(scorm.ok).toBe(true);
    if (!scorm.ok) return;
    const files = unzipSync(scorm.value.bytes);
    const path = `media/${mediaId}.png`;
    expect(
      Buffer.from(files[path] ?? new Uint8Array()).equals(Buffer.from(TINY_PNG))
    ).toBe(true);
    const html = new TextDecoder().decode(files['index.html']);
    expect(html).toContain(`<img src="${path}" alt="A cat" />`);
    expect(html).not.toContain('media:');
    expect(new TextDecoder().decode(files['imsmanifest.xml'])).toContain(
      `<file href="${path}"/>`
    );
  });

  test('preview serves the media with its content type', async () => {
    const { service, project, withImage, mediaId } = await courseWithImage();
    await service.saveCourse(project.id, OWNER, withImage);
    const file = await service.preview(
      project.id,
      OWNER,
      `media/${mediaId}.png`
    );
    expect(file.ok && file.value.contentType).toBe('image/png');
  });

  test('a file still used on a page cannot be deleted, and can once it is not', async () => {
    const { service, media, project, withImage, mediaId } =
      await courseWithImage();
    await service.saveCourse(project.id, OWNER, withImage);
    const blocked = await media.remove(project.id, OWNER, mediaId);
    expect(blocked).toMatchObject({ ok: false, kind: 'invalid' });
    if (!blocked.ok)
      expect(blocked.errors[0]).toContain("still used on 'Cats'");
    const cleared = {
      ...withImage,
      modules: [
        {
          ...withImage.modules[0],
          pages: [
            { ...withImage.modules[0]?.pages[0], html: '<p>no image</p>' },
          ],
        },
      ],
    };
    await service.saveCourse(project.id, OWNER, cleared);
    expect((await media.remove(project.id, OWNER, mediaId)).ok).toBe(true);
    expect(await media.read(project.id, OWNER, mediaId)).toMatchObject({
      ok: false,
      kind: 'notFound',
    });
  });
});

describe('damaged storage', () => {
  test('is reported by file name, logged, and never exported', async () => {
    const storage = createMemoryStorage();
    const projects = createMemoryRepository();
    const errorLog = createRecordingErrorLog();
    let counter = 0;
    const media = createMediaService({
      media: createMemoryMediaRepository(),
      projects,
      storage,
      errorLog,
      newId: () =>
        `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    });
    const projectId = '00000000-0000-4000-8000-0000000000aa';
    await projects.create(projectId, OWNER, {
      modelVersion: 1,
      id: projectId,
      title: 'C',
      description: '',
      language: 'en',
      completion: { kind: 'viewAll' },
      modules: [
        { id: 'm', title: 'M', pages: [{ id: 'p', title: 'P', html: '' }] },
      ],
    });
    const uploaded = await media.upload(projectId, OWNER, {
      fileName: 'cat.png',
      bytes: TINY_PNG,
    });
    if (!uploaded.ok) throw new Error('upload failed');
    await storage.set(
      `media:${uploaded.value.id}`,
      Buffer.from('tampered').toString('base64'),
      { signal: new AbortController().signal }
    );
    const read = await media.read(projectId, OWNER, uploaded.value.id);
    expect(read).toMatchObject({ ok: false, kind: 'failed' });
    if (!read.ok) expect(read.errors[0]).toContain("'cat.png' is damaged");
    expect(
      errorLog.entries.some((entry) => entry.message.includes('checksum'))
    ).toBe(true);
    await storage.remove?.(`media:${uploaded.value.id}`, {
      signal: new AbortController().signal,
    });
    const gone = await media.read(projectId, OWNER, uploaded.value.id);
    if (!gone.ok) expect(gone.errors[0]).toContain('missing from storage');
  });
});
