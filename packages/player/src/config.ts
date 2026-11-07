/** One question, as the player script needs it to mark answers. */
export interface QuizQuestionConfig {
  /** Index of the page that holds the question. */
  readonly pageIndex: number;
  readonly kind: 'single' | 'multiple';
  readonly points: number;
  readonly choiceCount: number;
  /** Positions (0-based) of the correct choices. */
  readonly correct: readonly number[];
}

export interface QuizConfig {
  /** Pass mark in percent, or null when the quiz is practice only. */
  readonly passPercent: number | null;
  readonly questions: readonly QuizQuestionConfig[];
}

/** Data the player script reads from `#lpm-config`. */
export interface PlayerConfig {
  readonly title: string;
  readonly pages: readonly { readonly id: string; readonly title: string }[];
  /** `viewAll` completes by visiting every page; `passQuiz` by passing the quiz. */
  readonly completion: 'viewAll' | 'passQuiz';
  readonly quiz: QuizConfig | null;
  /**
   * The LMS API the runtime should try first when a host offers several.
   * Absent means the default order (SCORM 1.2, then SCORM 2004).
   */
  readonly runtimeApi?: 'scorm2004' | 'xapi' | 'cmi5';
  /** The course as an xAPI Activity; present for xAPI packages. */
  readonly xapi?: { readonly activityId: string };
  /** Course language, used to label the xAPI activity name. */
  readonly language?: string;
}
