import { describe, expect, test } from 'bun:test';
import {
  validateCourseModel,
  type Question,
} from '@richardmcquiston01/lms-package-maker-model';
import {
  addChoice,
  newQuestion,
  removeChoice,
  setExplanation,
  setKind,
  setPoints,
  setPrompt,
  toggleCorrect,
} from './questionEdit';

const base: Question = newQuestion('single', {
  question: 'q',
  choiceA: 'a',
  choiceB: 'b',
});

function valid(question: Question): boolean {
  return validateCourseModel({
    modelVersion: 1,
    id: 'c',
    title: 'C',
    description: '',
    language: 'en',
    completion: { kind: 'viewAll' },
    modules: [
      {
        id: 'm',
        title: 'M',
        pages: [{ id: 'p', title: 'P', html: '', questions: [question] }],
      },
    ],
  }).ok;
}

function unwrap(result: ReturnType<typeof toggleCorrect>): Question {
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.value;
}

describe('question edits', () => {
  test('a new question is valid and its edits never change the original', () => {
    expect(valid(base)).toBe(true);
    const snapshot: string = JSON.stringify(base);
    setPrompt(base, 'Other');
    setPoints(base, 5);
    unwrap(addChoice(base, 'c'));
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  test('an empty explanation is removed, a real one kept', () => {
    const withText = setExplanation(base, 'Because.');
    expect(withText.explanation).toBe('Because.');
    const cleared = setExplanation(withText, '   ');
    expect('explanation' in cleared).toBe(false);
    expect(valid(cleared)).toBe(true);
  });

  test('single choice: marking another right replaces the old one', () => {
    expect(unwrap(toggleCorrect(base, 'b')).correctChoiceIds).toEqual(['b']);
  });

  test('several right: toggles, but never zero and never all', () => {
    let question: Question = setKind(
      unwrap(addChoice(unwrap(addChoice(base, 'c')), 'd')),
      'multiple'
    );
    question = unwrap(toggleCorrect(question, 'c'));
    expect(question.correctChoiceIds).toEqual(['a', 'c']);
    expect(valid(question)).toBe(true);
    const last = toggleCorrect(unwrap(toggleCorrect(question, 'a')), 'c');
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.errors[0]).toContain('at least one right answer');
    const almostAll = unwrap(toggleCorrect(question, 'b'));
    const all = toggleCorrect(almostAll, 'd');
    expect(all.ok).toBe(false);
    if (!all.ok)
      expect(all.errors[0]).toContain('not every choice can be right');
  });

  test('switching to a single answer keeps only the first right one', () => {
    const multiple = setKind(
      unwrap(addChoice(unwrap(addChoice(base, 'c')), 'd')),
      'multiple'
    );
    const several = unwrap(toggleCorrect(multiple, 'c'));
    const back = setKind(several, 'single');
    expect(back.correctChoiceIds).toEqual(['a']);
    expect(valid(back)).toBe(true);
  });

  test('choices are limited to 2..10, and removing the right one picks a new right one', () => {
    expect(removeChoice(base, 'a').ok).toBe(false);
    let question: Question = base;
    for (let index = 0; index < 8; index += 1)
      question = unwrap(addChoice(question, `x${index}`));
    expect(question.choices.length).toBe(10);
    const full = addChoice(question, 'overflow');
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.errors[0]).toContain('at most 10 choices');
    const removed = unwrap(removeChoice(question, 'a'));
    expect(removed.choices.length).toBe(9);
    expect(removed.correctChoiceIds).toEqual(['b']);
    expect(valid(removed)).toBe(true);
    expect(removeChoice(question, 'nope').ok).toBe(false);
  });

  test('removing a choice from a pick-many question keeps at least one wrong', () => {
    const three = unwrap(addChoice(base, 'c'));
    const multiple = unwrap(toggleCorrect(setKind(three, 'multiple'), 'b'));
    expect(multiple.correctChoiceIds).toEqual(['a', 'b']);
    const removed = unwrap(removeChoice(multiple, 'c'));
    expect(removed.correctChoiceIds.length).toBeLessThan(
      removed.choices.length
    );
    expect(valid(removed)).toBe(true);
  });
});
