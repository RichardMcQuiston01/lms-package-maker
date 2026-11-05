import { describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { zipPackage } from '@richardmcquiston01/lms-package-maker-exporters';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import { scorm12Exporter } from './index.js';

const course: CourseModel = {
  modelVersion: 1,
  id: 'safety 101',
  title: 'Safety & Health',
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

describe('scorm12Exporter', () => {
  test('writes a SCORM 1.2 manifest listing every file', () => {
    const result = scorm12Exporter.export(course);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const manifest: string = new TextDecoder().decode(
      result.value.get('imsmanifest.xml')
    );
    expect(manifest).toContain('<schemaversion>1.2</schemaversion>');
    expect(manifest).toContain('adlcp:scormtype="sco"');
    expect(manifest).toContain('href="index.html"');
    expect(manifest).toContain('<title>Safety &amp; Health</title>');
    expect(manifest).toContain('identifier="MANIFEST-safety_101"');
    for (const path of result.value.keys()) {
      // The manifest and the schema files are not resource files.
      if (path !== 'imsmanifest.xml' && !path.endsWith('.xsd')) {
        expect(manifest).toContain(`<file href="${path}"/>`);
      }
    }
  });

  test('zips deterministically with the manifest at the root', () => {
    const result = scorm12Exporter.export(course);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const first = zipPackage(result.value);
    const second = zipPackage(result.value);
    expect(first).toEqual(second);
    if (first.ok) {
      expect(Object.keys(unzipSync(first.value))).toContain('imsmanifest.xml');
    }
  });

  test('passes the player errors through', () => {
    const result = scorm12Exporter.export({
      ...course,
      completion: { kind: 'passQuiz', minScorePercent: 80 },
    });
    expect(result.ok).toBe(false);
  });
});
