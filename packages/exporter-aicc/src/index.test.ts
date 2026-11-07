import { describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { zipPackage } from '@richardmcquiston01/lms-package-maker-exporters';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import {
  AICC_AU_ID,
  aiccCourseId,
  aiccExporter,
  buildAiccFiles,
} from './index.js';

const course: CourseModel = {
  modelVersion: 1,
  id: '1 weird/id & more',
  title: 'Safety "101"\nPart 1',
  description: '[About] safety,\nin two lines',
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

/** Reads one CSV line the way an AICC LMS does: quoted fields, "" inside. */
function csvRow(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line.charAt(i);
    if (inQuotes) {
      if (char === '"' && line.charAt(i + 1) === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

const rows = (text: string): string[][] =>
  text
    .split('\r\n')
    .filter((line) => line !== '')
    .map(csvRow);

/** Reads the .crs file as key/value pairs per section. */
function iniSections(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string[] = [];
  for (const line of text.split('\r\n')) {
    const header = line.match(/^\[(.+)\]$/);
    if (header !== null) {
      current = [];
      sections.set(header[1] ?? '', current);
    } else if (line !== '') {
      current.push(line);
    }
  }
  return sections;
}

describe('AICC course description files', () => {
  test('use CRLF line ends and have the four files agree with each other', () => {
    const files = buildAiccFiles(course);
    for (const text of Object.values(files)) {
      expect(text.endsWith('\r\n')).toBe(true);
      expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    }
    const crs = iniSections(files.course);
    expect([...crs.keys()]).toEqual([
      'Course',
      'Course_Behavior',
      'Course_Description',
    ]);
    const au = rows(files.assignableUnits);
    const des = rows(files.descriptors);
    const cst = rows(files.structure);
    // one AU, described, and a member of ROOT
    expect(crs.get('Course')).toContain('Total_AUs=1');
    expect(crs.get('Course')).toContain('Total_Blocks=0');
    expect(au).toHaveLength(2);
    expect(des).toHaveLength(2);
    expect(cst).toHaveLength(2);
    expect(au[1]?.[0]).toBe(AICC_AU_ID);
    expect(des[1]?.[0]).toBe(AICC_AU_ID);
    expect(cst[1]).toEqual(['ROOT', AICC_AU_ID]);
  });

  test('every row has as many fields as its header', () => {
    const files = buildAiccFiles(course);
    for (const text of [
      files.assignableUnits,
      files.descriptors,
      files.structure,
    ]) {
      const [header, ...body] = rows(text);
      for (const row of body) {
        expect(row).toHaveLength(header?.length ?? -1);
      }
    }
    expect(rows(files.assignableUnits)[0]).toEqual([
      'system_id',
      'type',
      'command_line',
      'max_time_allowed',
      'time_limit_action',
      'file_name',
      'max_score',
      'mastery_score',
      'system_vendor',
      'core_vendor',
      'web_launch',
      'au_password',
    ]);
    expect(rows(files.descriptors)[0]).toEqual([
      'system_id',
      'developer_id',
      'title',
      'description',
    ]);
    expect(rows(files.structure)[0]).toEqual(['block', 'member']);
  });

  test('the AU launches the player and has no mastery score for a view-all course', () => {
    const [, au] = rows(buildAiccFiles(course).assignableUnits);
    expect(au?.[5]).toBe('index.html');
    expect(au?.[6]).toBe('100');
    expect(au?.[7]).toBe('');
  });

  test('a quiz course carries its pass mark (0 to 100) as the mastery score', () => {
    const [, au] = rows(buildAiccFiles(quizCourse).assignableUnits);
    expect(au?.[7]).toBe('75');
  });

  test('text with quotes, line breaks and brackets stays one line and one field', () => {
    const files = buildAiccFiles(course);
    const [, des] = rows(files.descriptors);
    expect(des?.[2]).toBe('Safety "101" Part 1');
    expect(des?.[3]).toBe('[About] safety, in two lines');
    expect(files.course).toContain('Course_Title=Safety "101" Part 1\r\n');
    // the description line must not read as a new [section]
    const description = iniSections(files.course).get('Course_Description');
    expect(description).toEqual(['(About] safety, in two lines']);
  });

  test('the course id is a short identifier', () => {
    expect(aiccCourseId(course)).toBe('1_weird_id___more');
    expect(aiccCourseId({ ...course, id: 'x'.repeat(200) })).toHaveLength(64);
    expect(iniSections(buildAiccFiles(course).course).get('Course')).toContain(
      'Course_ID=1_weird_id___more'
    );
  });
});

describe('aiccExporter', () => {
  test('writes the four course files beside the player, and no other manifest', () => {
    const result = aiccExporter.export(course);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect([...result.value.keys()].sort()).toEqual(
      [
        'assets/player.css',
        'assets/player.js',
        'assets/runtime.js',
        'course.au',
        'course.cst',
        'course.crs',
        'course.des',
        'index.html',
      ].sort()
    );
  });

  test('tells the runtime it is an AICC AU', () => {
    const result = aiccExporter.export(course);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const html = new TextDecoder().decode(result.value.get('index.html'));
      expect(html).toContain('"runtimeApi":"aicc"');
      expect(html).not.toContain('data-action="exit"');
    }
  });

  test('the file the AU names is in the package', () => {
    const result = aiccExporter.export(course);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const [, au] = rows(
        new TextDecoder().decode(result.value.get('course.au'))
      );
      expect(result.value.has(au?.[5] ?? '')).toBe(true);
    }
  });

  test('zips deterministically with the files at the root', () => {
    const result = aiccExporter.export(course);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const first = zipPackage(result.value);
    expect(first).toEqual(zipPackage(result.value));
    if (first.ok) {
      expect(Object.keys(unzipSync(first.value))).toContain('course.crs');
    }
  });

  test('passes the player errors through and refuses unsafe media paths', () => {
    expect(
      aiccExporter.export({
        ...course,
        completion: { kind: 'passQuiz', minScorePercent: 80 },
      }).ok
    ).toBe(false);
    expect(
      aiccExporter.export(course, {
        assets: new Map([['../evil.png', new Uint8Array([1])]]),
      }).ok
    ).toBe(false);
    const withMedia = aiccExporter.export(course, {
      assets: new Map([['media/a.png', new Uint8Array([1, 2, 3])]]),
    });
    expect(withMedia.ok && withMedia.value.has('media/a.png')).toBe(true);
  });
});
