import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { validateXML } from 'xmllint-wasm';
import { zipPackage } from '@richardmcquiston01/lms-package-maker-exporters';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import {
  buildCmi5CourseStructure,
  cmi5AuId,
  cmi5CourseId,
  cmi5Exporter,
} from './index.js';

const course: CourseModel = {
  modelVersion: 1,
  id: '1 weird/id & more',
  title: 'Safety <101> & "Health"',
  description: 'About <safety>',
  language: 'en',
  completion: { kind: 'viewAll' },
  modules: [
    {
      id: 'm1',
      title: 'Intro',
      pages: [{ id: 'p1', title: 'Hi', html: '<p>Hi</p>' }],
    },
  ],
};

const quizCourse: CourseModel = {
  ...course,
  completion: { kind: 'passQuiz', minScorePercent: 75 },
  modules: [
    {
      id: 'm1',
      title: 'Intro',
      pages: [
        {
          id: 'p1',
          title: 'Quiz',
          html: '<p>Quiz</p>',
          questions: [
            {
              id: 'q1',
              kind: 'single',
              prompt: 'Pick one',
              choices: [
                { id: 'a', text: 'A' },
                { id: 'b', text: 'B' },
              ],
              correctChoiceIds: ['a'],
              points: 1,
            },
          ],
        },
      ],
    },
  ],
};

const schemaDirectory: string = path.join(import.meta.dir, '..', 'schemas');
const schemaText: string = await readFile(
  path.join(schemaDirectory, 'CourseStructure.xsd'),
  'utf8'
);

async function validate(xml: string): Promise<readonly string[]> {
  const result = await validateXML({
    xml: [{ fileName: 'cmi5.xml', contents: xml }],
    schema: [{ fileName: 'CourseStructure.xsd', contents: schemaText }],
  });
  return result.valid ? [] : result.errors.map((error) => error.message);
}

const decode = (bytes: Uint8Array | undefined): string =>
  new TextDecoder().decode(bytes);

describe('cmi5.xml', () => {
  test('is valid against the cmi5 course structure schema', async () => {
    expect(await validate(buildCmi5CourseStructure(course))).toEqual([]);
    expect(await validate(buildCmi5CourseStructure(quizCourse))).toEqual([]);
  });

  test('describes one course and one launchable AU, with escaped text', () => {
    const xml: string = buildCmi5CourseStructure(course);
    expect(xml).toContain(`<course id="${cmi5CourseId(course)}">`);
    expect(xml).toContain(`<au id="${cmi5AuId(course)}"`);
    expect(xml).toContain('<url>index.html</url>');
    expect(xml).toContain(
      '<langstring lang="en">Safety &lt;101&gt; &amp; &quot;Health&quot;</langstring>'
    );
    expect(xml).toContain(
      '<langstring lang="en">About &lt;safety&gt;</langstring>'
    );
    expect(cmi5CourseId(course)).not.toBe(cmi5AuId(course));
  });

  test('a view-all course moves on when completed', () => {
    const xml: string = buildCmi5CourseStructure(course);
    expect(xml).toContain('moveOn="Completed"');
    expect(xml).not.toContain('masteryScore');
  });

  test('a quiz course moves on when passed, with its pass mark as the mastery score', () => {
    const xml: string = buildCmi5CourseStructure(quizCourse);
    expect(xml).toContain('moveOn="Passed" masteryScore="0.75"');
  });

  test('falls back to the title when the course has no description', () => {
    expect(buildCmi5CourseStructure({ ...course, description: '' })).toContain(
      '<description>\n      <langstring lang="en">Safety &lt;101&gt; &amp; &quot;Health&quot;</langstring>'
    );
  });

  test('the check is real: a mastery score above 1 and a missing url are rejected', async () => {
    const tooHigh: string = buildCmi5CourseStructure(quizCourse).replace(
      'masteryScore="0.75"',
      'masteryScore="1.5"'
    );
    expect((await validate(tooHigh)).join('\n')).toContain('masteryScore');
    const noUrl: string = buildCmi5CourseStructure(course).replace(
      /<url>[\s\S]*<\/url>/,
      ''
    );
    expect((await validate(noUrl)).length).toBeGreaterThan(0);
  });
});

describe('cmi5Exporter', () => {
  test('writes cmi5.xml and the player, and no SCORM or TinCan manifest', () => {
    const result = cmi5Exporter.export(course);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect([...result.value.keys()].sort()).toEqual([
      'assets/player.css',
      'assets/player.js',
      'assets/runtime.js',
      'cmi5.xml',
      'index.html',
    ]);
  });

  test('tells the runtime it is a cmi5 AU and adds the Exit button', () => {
    const result = cmi5Exporter.export(course);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const html: string = decode(result.value.get('index.html'));
      expect(html).toContain('"runtimeApi":"cmi5"');
      expect(html).toContain('"language":"en"');
      expect(html).toContain('data-action="exit"');
    }
  });

  test('zips deterministically with cmi5.xml at the root', () => {
    const result = cmi5Exporter.export(course);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const first = zipPackage(result.value);
    expect(first).toEqual(zipPackage(result.value));
    if (first.ok) {
      expect(Object.keys(unzipSync(first.value))).toContain('cmi5.xml');
    }
  });

  test('passes the player errors through and refuses unsafe media paths', () => {
    expect(
      cmi5Exporter.export({
        ...course,
        completion: { kind: 'passQuiz', minScorePercent: 80 },
      }).ok
    ).toBe(false);
    expect(
      cmi5Exporter.export(course, {
        assets: new Map([['../evil.png', new Uint8Array([1])]]),
      }).ok
    ).toBe(false);
    const withMedia = cmi5Exporter.export(course, {
      assets: new Map([['media/a.png', new Uint8Array([1, 2, 3])]]),
    });
    expect(withMedia.ok && withMedia.value.has('media/a.png')).toBe(true);
  });
});

describe('vendored schema', () => {
  test('matches the checksums in the NOTICE', async () => {
    const notice: string = await readFile(
      path.join(schemaDirectory, 'NOTICE.md'),
      'utf8'
    );
    for (const name of ['CourseStructure.xsd', 'LICENSE-cmi5-spec']) {
      const bytes: Buffer = await readFile(path.join(schemaDirectory, name));
      const checksum: string = createHash('sha256').update(bytes).digest('hex');
      const tick = '`';
      expect(notice).toMatch(
        new RegExp(`${tick}${name}${tick}\\s*\\|\\s*${tick}${checksum}${tick}`)
      );
    }
  });
});
