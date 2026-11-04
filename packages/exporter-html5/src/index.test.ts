import { describe, expect, test } from 'bun:test';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import { html5Exporter } from './index.js';

const course: CourseModel = {
  modelVersion: 1,
  id: 'c1',
  title: 'Course',
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

describe('html5Exporter', () => {
  test('has an index.html entry and no SCORM manifest', () => {
    const result = html5Exporter.export(course);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.has('index.html')).toBe(true);
      expect(result.value.has('imsmanifest.xml')).toBe(false);
    }
  });
});
