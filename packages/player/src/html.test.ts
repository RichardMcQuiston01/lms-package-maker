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

  test('only a cmi5 player gets an Exit button and a cmi5 runtime hint', () => {
    const text = (options: Parameters<typeof buildPlayerFiles>[1]): string => {
      const result = buildPlayerFiles(sampleCourse, options);
      if (!result.ok) {
        throw new Error(result.errors.join('; '));
      }
      return new TextDecoder().decode(result.value.get('index.html'));
    };
    const plain: string = text({});
    expect(plain).not.toContain('data-action="exit"');
    expect(plain).not.toContain('runtimeApi');
    const cmi5: string = text({ cmi5: true });
    expect(cmi5).toContain('data-action="exit"');
    expect(cmi5).toContain('"runtimeApi":"cmi5"');
    expect(cmi5).toContain('"language":"en"');
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

  test('needs at least one question for pass-the-quiz completion, and says so', () => {
    const result = buildPlayerFiles({
      ...sampleCourse,
      completion: { kind: 'passQuiz', minScorePercent: 80 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toContain('has no questions');
    }
  });
});

const quizCourse: CourseModel = {
  ...sampleCourse,
  completion: { kind: 'passQuiz', minScorePercent: 70 },
  modules: [
    {
      id: 'm1',
      title: 'Intro',
      pages: [
        { id: 'p1', title: 'Welcome', html: '<p>Hello</p>' },
        {
          id: 'p2',
          title: 'Quiz',
          html: '<p>Answer these</p>',
          questions: [
            {
              id: 'q1',
              kind: 'single',
              prompt: 'Is <b>this</b> escaped & safe?',
              choices: [
                { id: 'a', text: 'Yes <i>really</i>' },
                { id: 'b', text: 'No' },
              ],
              correctChoiceIds: ['a'],
              points: 2,
              explanation: 'Because "escaping" works.',
            },
            {
              id: 'q2',
              kind: 'multiple',
              prompt: 'Pick two',
              choices: [
                { id: 'a', text: 'One' },
                { id: 'b', text: 'Two' },
                { id: 'c', text: 'Three' },
              ],
              correctChoiceIds: ['a', 'c'],
              points: 3,
            },
          ],
        },
      ],
    },
  ],
};

function pageHtml(course: CourseModel): string {
  const result = buildPlayerFiles(course);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return new TextDecoder().decode(result.value.get('index.html'));
}

describe('quiz pages', () => {
  test('render a group with radio and checkbox inputs numbered across the course', () => {
    const html: string = pageHtml(quizCourse);
    expect(html).toContain(
      'class="lpm-quiz" role="group" aria-label="Quiz questions" data-quiz-first="0" data-quiz-count="2"'
    );
    expect(html).toContain('type="radio" name="q0" value="0"');
    expect(html).toContain('type="checkbox" name="q1" value="2"');
    expect(html).toContain('(2 points)');
    expect(html).toContain('Select all that apply.');
  });

  test('never use a form, so hosts that block form submission still work', () => {
    const html: string = pageHtml(quizCourse);
    expect(html).not.toContain('<form');
    expect(html).toContain('data-action="submit"');
  });

  test('escape every piece of question text', () => {
    const html: string = pageHtml(quizCourse);
    expect(html).toContain('Is &lt;b&gt;this&lt;/b&gt; escaped &amp; safe?');
    expect(html).toContain('Yes &lt;i&gt;really&lt;/i&gt;');
    expect(html).toContain('Because &quot;escaping&quot; works.');
    expect(html).not.toContain('<b>this</b>');
  });

  test('keep the right answers out of the page markup', () => {
    const html: string = pageHtml(quizCourse);
    expect(html).not.toContain('checked');
    expect(html).not.toContain('data-correct');
  });

  test('give the script the answer key, pass mark and completion rule', () => {
    const html: string = pageHtml(quizCourse);
    const json: string =
      html.match(
        /<script type="application\/json" id="lpm-config">(.*?)<\/script>/s
      )?.[1] ?? '';
    const config = JSON.parse(json);
    expect(config.completion).toBe('passQuiz');
    expect(config.quiz.passPercent).toBe(70);
    expect(config.quiz.questions).toEqual([
      { pageIndex: 1, kind: 'single', points: 2, choiceCount: 2, correct: [0] },
      {
        pageIndex: 1,
        kind: 'multiple',
        points: 3,
        choiceCount: 3,
        correct: [0, 2],
      },
    ]);
  });

  test('a view-all course with questions is practice: no pass mark', () => {
    const html: string = pageHtml({
      ...quizCourse,
      completion: { kind: 'viewAll' },
    });
    const config = JSON.parse(
      html.match(/id="lpm-config">(.*?)<\/script>/s)?.[1] ?? ''
    );
    expect(config.completion).toBe('viewAll');
    expect(config.quiz.passPercent).toBeNull();
  });

  test('a course without questions has no quiz data and no quiz markup', () => {
    const html: string = pageHtml(sampleCourse);
    expect(html).not.toContain('lpm-quiz"');
    expect(
      JSON.parse(html.match(/id="lpm-config">(.*?)<\/script>/s)?.[1] ?? '').quiz
    ).toBeNull();
  });
});
