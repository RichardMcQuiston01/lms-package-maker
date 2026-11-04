import { describe, expect, test } from 'bun:test';
import type { CourseModel } from '@richardmcquiston01/lms-package-maker-model';
import { buildPlayerFiles } from './html.js';

export const sampleCourse: CourseModel = {
  modelVersion: 1,
  id: 'course 1',
  title: 'Safety <101> & "more"',
  description: 'Basics',
  language: 'en',
  completion: { kind: 'viewAll' },
  modules: [
    {
      id: 'm1',
      title: 'Intro',
      pages: [
        { id: 'p1', title: 'Welcome', html: '<p>Hello</p>' },
        { id: 'p2', title: 'Wrap up', html: '<p>Bye</p>' },
      ],
    },
  ],
};

describe('buildPlayerFiles', () => {
  test('emits the entry page and assets', () => {
    const result = buildPlayerFiles(sampleCourse);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.value.keys()].sort()).toEqual([
        'assets/player.css',
        'assets/player.js',
        'assets/runtime.js',
        'index.html',
      ]);
      const html: string = new TextDecoder().decode(
        result.value.get('index.html')
      );
      expect(html).toContain(
        '<title>Safety &lt;101&gt; &amp; &quot;more&quot;</title>'
      );
      expect(html).toContain('<p>Hello</p>');
      expect(html.match(/class="lpm-page"/g)?.length).toBe(2);
    }
  });

  test('keeps page ids from closing the config script block', () => {
    const result = buildPlayerFiles({
      ...sampleCourse,
      modules: [
        {
          id: 'm1',
          title: 'Intro',
          pages: [{ id: '</script><b>', title: 'x', html: '' }],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const html: string = new TextDecoder().decode(
        result.value.get('index.html')
      );
      expect(html).toContain('\\u003c/script>');
    }
  });

  test('explains why quiz completion is not supported yet', () => {
    const result = buildPlayerFiles({
      ...sampleCourse,
      completion: { kind: 'passQuiz', minScorePercent: 80 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("'passQuiz' needs quiz content");
    }
  });

  test('rejects duplicate page ids', () => {
    const result = buildPlayerFiles({
      ...sampleCourse,
      modules: [
        {
          id: 'm1',
          title: 'Intro',
          pages: [
            { id: 'p1', title: 'a', html: '' },
            { id: 'p1', title: 'b', html: '' },
          ],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });
});
