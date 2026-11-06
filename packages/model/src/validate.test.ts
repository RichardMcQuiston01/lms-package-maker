import { describe, expect, test } from 'bun:test';
import { validateCourseModel } from './validate.js';

const validCourse: unknown = {
  modelVersion: 1,
  id: 'course-1',
  title: 'Safety 101',
  description: 'Basics',
  language: 'en',
  completion: { kind: 'viewAll' },
  modules: [
    {
      id: 'm1',
      title: 'Intro',
      pages: [{ id: 'p1', title: 'Welcome', html: '<p>Hi</p>' }],
    },
  ],
};

describe('validateCourseModel', () => {
  test('accepts a valid course', () => {
    expect(validateCourseModel(validCourse).ok).toBe(true);
  });

  test('rejects a non-object with a descriptive error', () => {
    const result = validateCourseModel('nope');
    expect(result).toEqual({ ok: false, errors: ['course must be an object'] });
  });

  test('reports every problem, naming the path', () => {
    const result = validateCourseModel({
      modelVersion: 2,
      completion: { kind: 'passQuiz', minScorePercent: 150 },
      modules: [{ id: 'm1', title: '', pages: [] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('course.modelVersion must be 1, got 2');
      expect(result.errors).toContain(
        'course.completion.minScorePercent must be a number 0-100'
      );
      expect(result.errors).toContain(
        'course.modules[0].pages must be a non-empty array'
      );
    }
  });
});

const single = {
  id: 'q1',
  kind: 'single',
  prompt: 'Which is right?',
  choices: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ],
  correctChoiceIds: ['a'],
  points: 2,
  explanation: 'Because A.',
};

function courseWith(
  questions: unknown,
  completion: unknown = { kind: 'viewAll' }
): unknown {
  const base = validCourse as {
    modules: { pages: Record<string, unknown>[] }[];
  };
  return {
    ...(validCourse as object),
    completion,
    modules: [
      {
        ...base.modules[0],
        pages: [{ ...base.modules[0]?.pages[0], questions }],
      },
    ],
  };
}

describe('questions', () => {
  test('accepts a valid single and multiple choice question', () => {
    const multiple = {
      ...single,
      id: 'q2',
      kind: 'multiple',
      choices: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
        { id: 'c', text: 'C' },
      ],
      correctChoiceIds: ['a', 'c'],
    };
    expect(validateCourseModel(courseWith([single, multiple])).ok).toBe(true);
  });

  test('a page without questions is still fine', () => {
    expect(validateCourseModel(courseWith(undefined)).ok).toBe(true);
    expect(validateCourseModel(courseWith([])).ok).toBe(true);
  });

  test('reports each problem with its path', () => {
    const broken = {
      id: 'q1',
      kind: 'essay',
      prompt: '',
      choices: [{ id: 'a', text: 'A' }],
      correctChoiceIds: ['zzz'],
      points: 0,
    };
    const result = validateCourseModel(courseWith([broken]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text: string = result.errors.join('\n');
      expect(text).toContain(
        "questions[0].kind must be 'single' or 'multiple', got essay"
      );
      expect(text).toContain('questions[0].prompt must be a non-empty string');
      expect(text).toContain(
        'questions[0].choices must be an array of 2 to 10 choices'
      );
      expect(text).toContain(
        'questions[0].points must be a whole number from 1 to 100'
      );
    }
  });

  test('checks the correct answers against the choices and the kind', () => {
    const unknownChoice = { ...single, correctChoiceIds: ['nope'] };
    const twoForSingle = { ...single, correctChoiceIds: ['a', 'b'] };
    const allCorrect = {
      ...single,
      kind: 'multiple',
      correctChoiceIds: ['a', 'b'],
    };
    for (const [question, expected] of [
      [unknownChoice, 'names choices that do not exist: nope'],
      [twoForSingle, "exactly one choice for a 'single' question, got 2"],
      [allCorrect, 'cannot have every choice correct'],
    ] as const) {
      const result = validateCourseModel(courseWith([question]));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.join('\n')).toContain(expected);
    }
  });

  test('ids stay unique across the course and within a question', () => {
    const duplicate = {
      ...single,
      choices: [
        { id: 'a', text: 'A' },
        { id: 'a', text: 'B' },
      ],
    };
    const result = validateCourseModel(
      courseWith([single, { ...single, ...{ id: 'q1' } }, duplicate])
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text: string = result.errors.join('\n');
      expect(text).toContain("'q1' is used more than once");
      expect(text).toContain("'a' is used twice in this question");
    }
  });

  test('limits the length of text and the number of questions', () => {
    const long = { ...single, prompt: 'x'.repeat(501) };
    expect(validateCourseModel(courseWith([long])).ok).toBe(false);
    const many = Array.from({ length: 51 }, (_, index) => ({
      ...single,
      id: `q${index}`,
    }));
    const result = validateCourseModel(courseWith(many));
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.join('\n')).toContain(
        'the most a page can hold is 50'
      );
  });

  test('pass-the-quiz completion needs at least one question', () => {
    const rule = { kind: 'passQuiz', minScorePercent: 80 };
    const without = validateCourseModel(courseWith(undefined, rule));
    expect(without.ok).toBe(false);
    if (!without.ok)
      expect(without.errors.join('\n')).toContain('has no questions');
    expect(validateCourseModel(courseWith([single], rule)).ok).toBe(true);
  });
});
