import { QUESTION_LIMITS, validateQuestions } from './questions.js';
import {
  COURSE_MODEL_VERSION,
  type CourseModel,
  type Result,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[]
): void {
  const value: unknown = source[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(
      `${path}.${key} must be a non-empty string, got ${typeof value}`
    );
  }
}

/**
 * Validates untrusted input as a CourseModel. Collects every problem so the
 * caller can show them all at once instead of one per attempt.
 */
export function validateCourseModel(input: unknown): Result<CourseModel> {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ['course must be an object'] };
  }
  if (input['modelVersion'] !== COURSE_MODEL_VERSION) {
    errors.push(
      `course.modelVersion must be ${COURSE_MODEL_VERSION}, got ${String(input['modelVersion'])}`
    );
  }
  for (const key of ['id', 'title', 'language']) {
    requireString(input, key, 'course', errors);
  }
  const completion: unknown = input['completion'];
  if (!isRecord(completion)) {
    errors.push('course.completion must be an object');
  } else if (completion['kind'] === 'passQuiz') {
    const score: unknown = completion['minScorePercent'];
    if (typeof score !== 'number' || score < 0 || score > 100) {
      errors.push('course.completion.minScorePercent must be a number 0-100');
    }
  } else if (completion['kind'] !== 'viewAll') {
    errors.push(
      `course.completion.kind must be 'viewAll' or 'passQuiz', got ${String(completion['kind'])}`
    );
  }
  const seenQuestionIds = new Set<string>();
  let questionCount = 0;
  const modules: unknown = input['modules'];
  if (!Array.isArray(modules) || modules.length === 0) {
    errors.push('course.modules must be a non-empty array');
  } else {
    modules.forEach((moduleValue: unknown, moduleIndex: number): void => {
      const modulePath = `course.modules[${moduleIndex}]`;
      if (!isRecord(moduleValue)) {
        errors.push(`${modulePath} must be an object`);
        return;
      }
      requireString(moduleValue, 'id', modulePath, errors);
      requireString(moduleValue, 'title', modulePath, errors);
      const pages: unknown = moduleValue['pages'];
      if (!Array.isArray(pages) || pages.length === 0) {
        errors.push(`${modulePath}.pages must be a non-empty array`);
        return;
      }
      pages.forEach((pageValue: unknown, pageIndex: number): void => {
        const pagePath = `${modulePath}.pages[${pageIndex}]`;
        if (!isRecord(pageValue)) {
          errors.push(`${pagePath} must be an object`);
          return;
        }
        requireString(pageValue, 'id', pagePath, errors);
        requireString(pageValue, 'title', pagePath, errors);
        if (typeof pageValue['html'] !== 'string') {
          errors.push(`${pagePath}.html must be a string`);
        }
        questionCount += validateQuestions(
          pageValue['questions'],
          pagePath,
          seenQuestionIds,
          errors
        );
      });
    });
  }
  if (questionCount > QUESTION_LIMITS.maxQuestionsPerCourse) {
    errors.push(
      `course holds ${questionCount} questions; the most a course can hold is ${QUESTION_LIMITS.maxQuestionsPerCourse}`
    );
  }
  if (
    isRecord(completion) &&
    completion['kind'] === 'passQuiz' &&
    questionCount === 0 &&
    Array.isArray(modules)
  ) {
    errors.push(
      "course.completion is 'passQuiz' but the course has no questions; add a question or use 'viewAll'"
    );
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: input as unknown as CourseModel };
}
