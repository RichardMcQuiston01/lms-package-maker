/** Current version of the Course Model schema. */
export const COURSE_MODEL_VERSION = 1;

/** A successful or failed result that callers must check. */
export type Result<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly errors: readonly string[] };

export type CompletionRule =
  | { readonly kind: 'viewAll' }
  | { readonly kind: 'passQuiz'; readonly minScorePercent: number };

export interface Page {
  readonly id: string;
  readonly title: string;
  /** Sanitised HTML body for this page. */
  readonly html: string;
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
