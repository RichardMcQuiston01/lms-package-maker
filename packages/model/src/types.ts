/** Current version of the Course Model schema. */
export const COURSE_MODEL_VERSION = 1;

/** A successful or failed result that callers must check. */
export type Result<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly errors: readonly string[] };

export type CompletionRule =
  | { readonly kind: 'viewAll' }
  | { readonly kind: 'passQuiz'; readonly minScorePercent: number };

export interface Choice {
  readonly id: string;
  /** Plain text; it is escaped wherever it is shown. */
  readonly text: string;
}

/**
 * A multiple-choice question. `single` has exactly one right answer;
 * `multiple` is right only when the learner picks exactly the right set.
 */
export interface Question {
  readonly id: string;
  readonly kind: 'single' | 'multiple';
  /** Plain text; it is escaped wherever it is shown. */
  readonly prompt: string;
  readonly choices: readonly Choice[];
  readonly correctChoiceIds: readonly string[];
  /** Whole points the question is worth. */
  readonly points: number;
  /** Plain text shown after the learner answers. */
  readonly explanation?: string;
}

export interface Page {
  readonly id: string;
  readonly title: string;
  /** Sanitised HTML body for this page. */
  readonly html: string;
  /** Questions shown under the body. A page with questions is a quiz page. */
  readonly questions?: readonly Question[];
}

export interface Module {
  readonly id: string;
  readonly title: string;
  readonly pages: readonly Page[];
}

/** Standards-neutral description of a course; the only thing the editor writes. */
export interface CourseModel {
  readonly modelVersion: typeof COURSE_MODEL_VERSION;
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly language: string;
  readonly completion: CompletionRule;
  readonly modules: readonly Module[];
}
