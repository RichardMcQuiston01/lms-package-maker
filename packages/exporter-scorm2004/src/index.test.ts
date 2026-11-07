import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { validateXML } from 'xmllint-wasm';
import { zipPackage } from '@richardmcquiston01/lms-package-maker-exporters';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import {
  buildScorm2004Manifest,
  scorm2004Exporter,
  scorm2004SchemaFiles,
} from './index.js';

const course: CourseModel = {
  modelVersion: 1,
  id: '1 weird/id & more',
  title: 'Safety <101> & "Health"',
  description: '',
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

/**
 * Imports every namespace the manifest uses, so the ADL and sequencing
 * elements are checked rather than skipped.
 */
const COMBINED_SCHEMA = `<?xml version="1.0"?>
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <xsd:import namespace="http://www.imsglobal.org/xsd/imscp_v1p1" schemaLocation="imscp_v1p1.xsd"/>
  <xsd:import namespace="http://www.adlnet.org/xsd/adlcp_v1p3" schemaLocation="adlcp_v1p3.xsd"/>
  <xsd:import namespace="http://www.adlnet.org/xsd/adlseq_v1p3" schemaLocation="adlseq_v1p3.xsd"/>
  <xsd:import namespace="http://www.adlnet.org/xsd/adlnav_v1p3" schemaLocation="adlnav_v1p3.xsd"/>
  <xsd:import namespace="http://www.imsglobal.org/xsd/imsss" schemaLocation="imsss_v1p0.xsd"/>
</xsd:schema>`;

async function validate(manifest: string): Promise<readonly string[]> {
  const result = await validateXML({
    xml: [{ fileName: 'imsmanifest.xml', contents: manifest }],
    schema: [{ fileName: 'combined.xsd', contents: COMBINED_SCHEMA }],
    preload: Object.entries(scorm2004SchemaFiles).map(
      ([fileName, contents]) => ({ fileName, contents })
    ),
  });
  return result.valid ? [] : result.errors.map((error) => error.message);
}

describe('scorm2004Exporter', () => {
  test('writes a SCORM 2004 4th Edition manifest listing every file', () => {
    const result = scorm2004Exporter.export(course);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const manifest: string = new TextDecoder().decode(
      result.value.get('imsmanifest.xml')
    );
    expect(manifest).toContain(
      '<schemaversion>2004 4th Edition</schemaversion>'
    );
    expect(manifest).toContain('adlcp:scormType="sco"');
    expect(manifest).toContain('href="index.html"');
    expect(manifest).toContain(
      '<title>Safety &lt;101&gt; &amp; &quot;Health&quot;</title>'
    );
    expect(manifest).toContain('identifier="MANIFEST-1_weird_id___more"');
    for (const name of result.value.keys()) {
      // The manifest and the schema files are not resource files.
      if (
        name !== 'imsmanifest.xml' &&
        !name.endsWith('.xsd') &&
        !name.endsWith('.dtd')
      ) {
        expect(manifest).toContain(`<file href="${name}"/>`);
      }
    }
  });

  test('tells the runtime to use the SCORM 2004 API first', () => {
    const result = scorm2004Exporter.export(course);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const html: string = new TextDecoder().decode(
        result.value.get('index.html')
      );
      expect(html).toContain('"runtimeApi":"scorm2004"');
    }
  });

  test('exports a quiz course with its pass mark in the manifest', () => {
    const result = scorm2004Exporter.export(quizCourse);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        new TextDecoder().decode(result.value.get('imsmanifest.xml'))
      ).toContain('minNormalizedMeasure>0.75<');
      expect(
        new TextDecoder().decode(result.value.get('index.html'))
      ).toContain('"passPercent":75');
    }
  });

  test('zips deterministically with the manifest at the root', () => {
    const result = scorm2004Exporter.export(course);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const first = zipPackage(result.value);
    expect(first).toEqual(zipPackage(result.value));
    if (first.ok) {
      expect(Object.keys(unzipSync(first.value))).toContain('imsmanifest.xml');
    }
  });

  test('passes the player errors through', () => {
    const result = scorm2004Exporter.export({
      ...course,
      completion: { kind: 'passQuiz', minScorePercent: 80 },
    });
    expect(result.ok).toBe(false);
  });

  test('puts media in the package and refuses unsafe paths', () => {
    const withMedia = scorm2004Exporter.export(course, {
      assets: new Map([['media/a.png', new Uint8Array([1, 2, 3])]]),
    });
    expect(withMedia.ok).toBe(true);
    if (withMedia.ok) {
      expect(withMedia.value.get('media/a.png')).toEqual(
        new Uint8Array([1, 2, 3])
      );
      expect(
        new TextDecoder().decode(withMedia.value.get('imsmanifest.xml'))
      ).toContain('<file href="media/a.png"/>');
    }
    const escaping = scorm2004Exporter.export(course, {
      assets: new Map([['../evil.png', new Uint8Array([1])]]),
    });
    expect(escaping.ok).toBe(false);
  });
});

describe('SCORM 2004 manifest schema validation', () => {
  test('the generated manifest is valid', async () => {
    expect(await validate(buildScorm2004Manifest(course))).toEqual([]);
  });

  test('a manifest with a pass mark and media is valid', async () => {
    const manifest: string = buildScorm2004Manifest(quizCourse, [
      'media/a.png',
    ]);
    expect(manifest).toContain(
      '<imsss:minNormalizedMeasure>0.75</imsss:minNormalizedMeasure>'
    );
    expect(manifest).toContain('satisfiedByMeasure="true"');
    expect(await validate(manifest)).toEqual([]);
  });

  test('has no sequencing for a view-all course', () => {
    expect(buildScorm2004Manifest(course)).not.toContain('imsss:sequencing');
  });

  test('the check is real: a bad scormType is rejected', async () => {
    const broken: string = buildScorm2004Manifest(course).replace(
      'adlcp:scormType="sco"',
      'adlcp:scormType="bogus"'
    );
    const errors: readonly string[] = await validate(broken);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain('scormType');
  });

  test('the check is real: a pass mark outside 0 to 1 is rejected', async () => {
    const broken: string = buildScorm2004Manifest(quizCourse).replace(
      '0.75',
      '1.5'
    );
    expect((await validate(broken)).length).toBeGreaterThan(0);
  });

  test('the check is real: a missing organizations element is rejected', async () => {
    const broken: string = buildScorm2004Manifest(course).replace(
      /<organizations[\s\S]*<\/organizations>/,
      ''
    );
    expect((await validate(broken)).length).toBeGreaterThan(0);
  });
});

describe('schema files in the package', () => {
  test('every vendored file is written at the package root', () => {
    const result = scorm2004Exporter.export(course);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(scorm2004SchemaFiles)).toHaveLength(17);
      for (const name of Object.keys(scorm2004SchemaFiles)) {
        expect(result.value.has(name)).toBe(true);
      }
    }
  });

  test('exported bytes match the vendored files and the NOTICE checksums', async () => {
    const result = scorm2004Exporter.export(course);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const directory: string = path.join(import.meta.dir, '..', 'schemas');
    const notice: string = await readFile(
      path.join(directory, 'NOTICE.md'),
      'utf8'
    );
    for (const name of Object.keys(scorm2004SchemaFiles)) {
      const onDisk: Buffer = await readFile(path.join(directory, name));
      const exported: Uint8Array | undefined = result.value.get(name);
      expect(Buffer.from(exported ?? new Uint8Array()).equals(onDisk)).toBe(
        true
      );
      const checksum: string = createHash('sha256')
        .update(onDisk)
        .digest('hex');
      // Prettier pads Markdown tables, so match the row loosely.
      const tick = '`';
      expect(notice).toMatch(
        new RegExp(`${tick}${name}${tick}\\s*\\|\\s*${tick}${checksum}${tick}`)
      );
    }
  });
});
