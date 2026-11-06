import { describe, expect, test } from 'bun:test';
import type { QuizConfig } from './config.js';
import { hasPassed, isCorrect, reportableScore, scoreQuiz } from './quiz.js';
import { decodeProgress, encodeProgress } from './suspend.js';

const quiz: QuizConfig = {
  passPercent: 70,
  questions: [
    { pageIndex: 1, kind: 'single', points: 2, choiceCount: 3, correct: [1] },
    {
      pageIndex: 1,
      kind: 'multiple',
      points: 3,
      choiceCount: 4,
      correct: [0, 2],
    },
    { pageIndex: 2, kind: 'single', points: 5, choiceCount: 2, correct: [0] },
  ],
};

describe('marking', () => {
  test('a single question is right only for the right choice', () => {
    const [first] = quiz.questions;
    expect(isCorrect(first!, [1])).toBe(true);
    expect(isCorrect(first!, [0])).toBe(false);
    expect(isCorrect(first!, [])).toBe(false);
  });

  test('a multiple question needs exactly the right set, in any order', () => {
    const second = quiz.questions[1]!;
    expect(isCorrect(second, [2, 0])).toBe(true);
    expect(isCorrect(second, [0])).toBe(false);
    expect(isCorrect(second, [0, 1, 2])).toBe(false);
    expect(isCorrect(second, [0, 0, 2])).toBe(true);
  });

  test('scores by points and says when the quiz is complete', () => {
    expect(scoreQuiz(quiz, [[1], [0, 2], [0]])).toEqual({
      earned: 10,
      possible: 10,
      percent: 100,
      complete: true,
    });
    expect(scoreQuiz(quiz, [[0], [0, 2], [0]])).toMatchObject({
      earned: 8,
      percent: 80,
      complete: true,
    });
    const partial = scoreQuiz(quiz, [[1], null, [0]]);
    expect(partial).toMatchObject({ earned: 7, complete: false });
    expect(scoreQuiz(quiz, [[0], [], [1]]).percent).toBe(0);
  });

  test('pass mark is compared on the unrounded score', () => {
    expect(hasPassed(70, 70)).toBe(true);
    expect(hasPassed(69.99, 70)).toBe(false);
    expect(reportableScore(66.66666)).toBe(66.67);
  });
});

describe('saved progress', () => {
  test('round-trips visited pages, the latest score and answers', () => {
    const progress = {
      visited: [true, false, true],
      lastPercent: 80,
      answers: [[1], null, [0, 2]],
    };
    const text: string = encodeProgress(progress);
    expect(text).toBe('v2;101;80;2,-,5');
    expect(decodeProgress(text, 3, 3)).toEqual(progress);
  });

  test('still reads the older visited-bits format', () => {
    expect(decodeProgress('110', 3, 2)).toEqual({
      visited: [true, true, false],
      lastPercent: null,
      answers: [null, null],
    });
  });

  test('gives a fresh start for anything unreadable, never an error', () => {
    for (const bad of ['garbage', 'v2;xyz;1;2', 'v2;1;2', 'v9;1;-;-', '']) {
      expect(decodeProgress(bad, 2, 1)).toEqual({
        visited: [false, false],
        lastPercent: null,
        answers: [null],
      });
    }
    expect(decodeProgress(null, 1, 0).answers).toEqual([]);
  });

  test('ignores extra answers and short bit strings', () => {
    const result = decodeProgress('v2;1;-;1,1,1', 3, 1);
    expect(result.answers).toEqual([[0]]);
    expect(result.visited).toEqual([true, false, false]);
  });

  test('stays far below the 4096 character limit for the largest allowed course', () => {
    const answers = Array.from({ length: 200 }, () => [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    const text: string = encodeProgress({
      visited: new Array(100).fill(true),
      lastPercent: 99.99,
      answers,
    });
    expect(text.length).toBeLessThan(1500);
  });
});
