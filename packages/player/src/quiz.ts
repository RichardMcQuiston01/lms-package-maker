import type { QuizConfig, QuizQuestionConfig } from './config.js';

/** What the learner picked per question, by choice position; null means not answered yet. */
export type Answers = readonly (readonly number[] | null)[];

/**
 * A question is right only when the picked set is exactly the correct set,
 * so a `multiple` question gives no partial credit.
 */
export function isCorrect(
  question: QuizQuestionConfig,
  selected: readonly number[]
): boolean {
  const picked: number[] = [...new Set(selected)].sort((a, b) => a - b);
  const correct: number[] = [...question.correct].sort((a, b) => a - b);
  return (
    picked.length === correct.length &&
    picked.every(
      (value: number, index: number): boolean => value === correct[index]
    )
  );
}

export interface QuizScore {
  readonly earned: number;
  readonly possible: number;
  /** 0 to 100, not rounded. */
  readonly percent: number;
  /** True once every question has been answered. */
  readonly complete: boolean;
}

export function scoreQuiz(quiz: QuizConfig, answers: Answers): QuizScore {
  let earned = 0;
  let possible = 0;
  let complete = true;
  quiz.questions.forEach(
    (question: QuizQuestionConfig, index: number): void => {
      possible += question.points;
      const answer: readonly number[] | null | undefined = answers[index];
      if (answer === null || answer === undefined) {
        complete = false;
      } else if (isCorrect(question, answer)) {
        earned += question.points;
      }
    }
  );
  return {
    earned,
    possible,
    percent: possible === 0 ? 0 : (earned / possible) * 100,
    complete,
  };
}

/** A score for the LMS: two decimals is plenty and SCORM 1.2 accepts decimals. */
export function reportableScore(percent: number): number {
  return Math.round(percent * 100) / 100;
}

export function hasPassed(percent: number, passPercent: number): boolean {
  return percent >= passPercent;
}
