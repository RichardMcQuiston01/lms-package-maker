import { describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { createTestServices } from '../testSupport';
import { createMemoryRepository } from './memoryRepository';
import { downloadFileName } from './service';

const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';

describe('project service', () => {
  test('creates a project with a starter course', async () => {
    const { service } = createTestServices();
    const created = await service.create(OWNER, { title: '  Safety 101 ' });
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.name).toBe('Safety 101');
      expect(created.value.course.id).toBe(created.value.id);
      expect(created.value.course.modules[0]?.pages.length).toBe(1);
    }
  });

  test('rejects an empty title with a descriptive error', async () => {
    const { service } = createTestServices();
    const created = await service.create(OWNER, { title: '   ' });
    expect(created).toMatchObject({ ok: false, kind: 'invalid' });
    if (!created.ok) {
      expect(created.errors[0]).toContain('title must be 1 to 200 characters');
    }
  });

  test('saves a course, sanitising page html and fixing the course id', async () => {
    const { service } = createTestServices();
    const created = await service.create(OWNER, { title: 'Course' });
    if (!created.ok) throw new Error('create failed');
    const edited = {
      ...created.value.course,
      id: 'someone-elses-id',
      title: 'Renamed',
      modules: [
        {
          ...created.value.course.modules[0],
          pages: [
            {
              id: 'p1',
              title: 'Page',
              html: '<p>ok</p><script>alert(1)</script>',
            },
          ],
        },
      ],
    };
    const saved = await service.saveCourse(created.value.id, OWNER, edited);
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.value.course.id).toBe(created.value.id);
      expect(saved.value.name).toBe('Renamed');
      expect(saved.value.course.modules[0]?.pages[0]?.html).toBe('<p>ok</p>');
    }
  });

  test('reports every problem of an invalid course', async () => {
    const { service } = createTestServices();
    const created = await service.create(OWNER, { title: 'Course' });
    if (!created.ok) throw new Error('create failed');
    const saved = await service.saveCourse(created.value.id, OWNER, {
      modelVersion: 9,
    });
    expect(saved).toMatchObject({ ok: false, kind: 'invalid' });
    if (!saved.ok) {
      expect(saved.errors.length).toBeGreaterThan(1);
    }
  });

  test('says when the project does not exist', async () => {
    const { service } = createTestServices();
    const found = await service.get(
      '00000000-0000-4000-8000-0000000000ff',
      OWNER
    );
    expect(found).toMatchObject({ ok: false, kind: 'notFound' });
  });

  test('exports SCORM 1.2 and HTML5 zips and records them', async () => {
    const { service, repository } = createTestServices();
    const created = await service.create(OWNER, { title: 'Safety 101' });
    if (!created.ok) throw new Error('create failed');
    const scorm = await service.exportProject(
      created.value.id,
      OWNER,
      'scorm12'
    );
    expect(scorm.ok).toBe(true);
    if (scorm.ok) {
      expect(scorm.value.fileName).toBe('safety-101-scorm12.zip');
      expect(Object.keys(unzipSync(scorm.value.bytes))).toContain(
        'imsmanifest.xml'
      );
    }
    const html5 = await service.exportProject(created.value.id, OWNER, 'html5');
    expect(html5.ok).toBe(true);
    if (html5.ok) {
      expect(Object.keys(unzipSync(html5.value.bytes))).not.toContain(
        'imsmanifest.xml'
      );
    }
    const kept = await repository.listExports(created.value.id);
    expect(kept.ok && kept.value.map((entry) => entry.standard).sort()).toEqual(
      ['html5', 'scorm12']
    );
  });

  test('exports a SCORM 2004 zip with its schema files and records it', async () => {
    const { service, repository } = createTestServices();
    const created = await service.create(OWNER, { title: 'Safety 101' });
    if (!created.ok) throw new Error('create failed');
    const exported = await service.exportProject(
      created.value.id,
      OWNER,
      'scorm2004'
    );
    expect(exported.ok).toBe(true);
    if (exported.ok) {
      expect(exported.value.fileName).toBe('safety-101-scorm2004.zip');
      const names: string[] = Object.keys(unzipSync(exported.value.bytes));
      expect(names).toContain('imsmanifest.xml');
      expect(names).toContain('adlcp_v1p3.xsd');
    }
    const kept = await repository.listExports(created.value.id);
    expect(kept.ok && kept.value.map((entry) => entry.standard)).toEqual([
      'scorm2004',
    ]);
  });

  test('hides projects from everyone but their owner', async () => {
    const { service } = createTestServices();
    const created = await service.create(OWNER, { title: 'Private' });
    if (!created.ok) throw new Error('create failed');
    const id: string = created.value.id;

    expect(await service.get(id, STRANGER)).toMatchObject({
      ok: false,
      kind: 'notFound',
    });
    expect(
      await service.saveCourse(id, STRANGER, created.value.course)
    ).toMatchObject({ ok: false, kind: 'notFound' });
    expect(await service.exportProject(id, STRANGER, 'html5')).toMatchObject({
      ok: false,
      kind: 'notFound',
    });
    expect(await service.preview(id, STRANGER, '')).toMatchObject({
      ok: false,
      kind: 'notFound',
    });
    const listed = await service.list(STRANGER);
    expect(listed.ok && listed.value).toEqual([]);
    const ownList = await service.list(OWNER);
    expect(ownList.ok && ownList.value.length).toBe(1);
  });

  test('serves preview files and 404s unknown ones', async () => {
    const { service } = createTestServices();
    const created = await service.create(OWNER, { title: 'Course' });
    if (!created.ok) throw new Error('create failed');
    const index = await service.preview(created.value.id, OWNER, '');
    expect(index.ok && index.value.contentType).toBe(
      'text/html; charset=utf-8'
    );
    const script = await service.preview(
      created.value.id,
      OWNER,
      'assets/runtime.js'
    );
    expect(script.ok && script.value.contentType).toContain('javascript');
    const missing = await service.preview(created.value.id, OWNER, 'nope.txt');
    expect(missing).toMatchObject({ ok: false, kind: 'notFound' });
  });

  test('logs a storage failure and still returns the download', async () => {
    const failing = createTestServices({
      ...createMemoryRepository(),
      recordExport: async () => ({ ok: false, errors: ['disk full'] }),
    });
    const created = await failing.service.create(OWNER, { title: 'Course' });
    if (!created.ok) throw new Error('create failed');
    const exported = await failing.service.exportProject(
      created.value.id,
      OWNER,
      'html5'
    );
    expect(exported.ok).toBe(true);
    expect(failing.errorLog.entries.map((entry) => entry.message)).toContain(
      'disk full'
    );
  });
});

describe('downloadFileName', () => {
  test('makes a safe file name', () => {
    expect(downloadFileName('Hello, World! / ..', 'scorm12')).toBe(
      'hello-world-scorm12.zip'
    );
    expect(downloadFileName('???', 'html5')).toBe('course-html5.zip');
  });
});

describe('quiz courses', () => {
  const question = {
    id: 'q1',
    kind: 'single',
    prompt: 'Is <b>this</b> safe?',
    choices: [
      { id: 'a', text: 'Yes' },
      { id: 'b', text: 'No' },
    ],
    correctChoiceIds: ['a'],
    points: 2,
    explanation: 'It is escaped.',
  };

  async function quizCourse(completion: unknown) {
    const ctx = createTestServices();
    const created = await ctx.service.create(OWNER, { title: 'Quiz' });
    if (!created.ok) throw new Error('create failed');
    const page = created.value.course.modules[0]?.pages[0];
    return {
      ...ctx,
      id: created.value.id,
      course: {
        ...created.value.course,
        completion,
        modules: [
          {
            ...created.value.course.modules[0],
            pages: [{ ...page, questions: [question] }],
          },
        ],
      },
    };
  }

  test('saves questions and a pass mark and exports them', async () => {
    const { service, id, course } = await quizCourse({
      kind: 'passQuiz',
      minScorePercent: 80,
    });
    const saved = await service.saveCourse(id, OWNER, course);
    expect(saved.ok && saved.value.course.completion).toEqual({
      kind: 'passQuiz',
      minScorePercent: 80,
    });
    expect(
      saved.ok && saved.value.course.modules[0]?.pages[0]?.questions?.length
    ).toBe(1);

    const { unzipSync } = await import('fflate');
    const scorm = await service.exportProject(id, OWNER, 'scorm12');
    if (!scorm.ok) throw new Error(scorm.errors.join('; '));
    const files = unzipSync(scorm.value.bytes);
    expect(new TextDecoder().decode(files['imsmanifest.xml'])).toContain(
      '<adlcp:masteryscore>80</adlcp:masteryscore>'
    );
    const html = new TextDecoder().decode(files['index.html']);
    expect(html).toContain('Is &lt;b&gt;this&lt;/b&gt; safe?');
    expect(html).toContain('class="lpm-quiz"');
    expect(html).not.toContain('<b>this</b>');
  });

  test('refuses a pass mark without questions, naming the rule', async () => {
    const { service, id, course } = await quizCourse({
      kind: 'passQuiz',
      minScorePercent: 80,
    });
    const noQuestions = {
      ...course,
      modules: [
        {
          ...course.modules[0],
          pages: [{ ...course.modules[0]?.pages[0], questions: undefined }],
        },
      ],
    };
    const result = await service.saveCourse(id, OWNER, noQuestions);
    expect(result).toMatchObject({ ok: false, kind: 'invalid' });
    if (!result.ok)
      expect(result.errors.join(' ')).toContain(
        "'passQuiz' but the course has no questions"
      );
  });

  test('refuses a broken question with its path', async () => {
    const { service, id, course } = await quizCourse({ kind: 'viewAll' });
    const broken = {
      ...course,
      modules: [
        {
          ...course.modules[0],
          pages: [
            {
              ...course.modules[0]?.pages[0],
              questions: [{ ...question, correctChoiceIds: ['zzz'] }],
            },
          ],
        },
      ],
    };
    const result = await service.saveCourse(id, OWNER, broken);
    expect(result).toMatchObject({ ok: false, kind: 'invalid' });
    if (!result.ok)
      expect(result.errors.join(' ')).toContain(
        'questions[0].correctChoiceIds names choices that do not exist: zzz'
      );
  });
});
