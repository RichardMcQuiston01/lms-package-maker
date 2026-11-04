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
