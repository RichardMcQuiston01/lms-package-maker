import {
  QUESTION_LIMITS,
  type Choice,
  type Question,
  type Result,
} from '@richardmcquiston01/lms-package-maker-model';

/**
 * Pure edits of one question. The editor never changes a question in place,
 * and these keep a question valid: at least two choices, at least one right
 * answer, and a pick-many question never has every choice right.
 */

function failure(message: string): Result<Question> {
  return { ok: false, errors: [message] };
}

/** A new question with two choices; the first is the right answer. */
export function newQuestion(
  kind: Question['kind'],
  ids: { question: string; choiceA: string; choiceB: string }
): Question {
  return {
    id: ids.question,
    kind,
    prompt: 'New question',
    choices: [
      { id: ids.choiceA, text: 'Choice 1' },
      { id: ids.choiceB, text: 'Choice 2' },
    ],
    correctChoiceIds: [ids.choiceA],
    points: 1,
  };
}

export function setPrompt(question: Question, prompt: string): Question {
  return { ...question, prompt };
}

export function setPoints(question: Question, points: number): Question {
  return { ...question, points };
}

/** An empty explanation is removed rather than stored as an empty string. */
export function setExplanation(
  question: Question,
  explanation: string
): Question {
  const { explanation: _previous, ...rest } = question;
  return explanation.trim() === '' ? rest : { ...rest, explanation };
}

export function setChoiceText(
  question: Question,
  choiceId: string,
  text: string
): Question {
  return {
    ...question,
    choices: question.choices.map((choice: Choice): Choice =>
      choice.id === choiceId ? { ...choice, text } : choice
    ),
  };
}

/**
 * Switches between one right answer and several. Going to a single answer
 * keeps the first right choice; going to several keeps what was right.
 */
export function setKind(question: Question, kind: Question['kind']): Question {
  if (question.kind === kind) return question;
  const correct: readonly string[] =
    kind === 'single'
      ? question.correctChoiceIds.slice(0, 1)
      : question.correctChoiceIds;
  return { ...question, kind, correctChoiceIds: correct };
}

/** Marks a choice right or wrong, never leaving zero (or, for several, all) right. */
export function toggleCorrect(
  question: Question,
  choiceId: string
): Result<Question> {
  if (
    !question.choices.some((choice: Choice): boolean => choice.id === choiceId)
  ) {
    return failure(
      `choice '${choiceId}' does not exist, so it cannot be marked right`
    );
  }
  if (question.kind === 'single') {
    return { ok: true, value: { ...question, correctChoiceIds: [choiceId] } };
  }
  const isCorrect: boolean = question.correctChoiceIds.includes(choiceId);
  if (isCorrect && question.correctChoiceIds.length === 1) {
    return failure('a question needs at least one right answer');
  }
  if (
    !isCorrect &&
    question.correctChoiceIds.length + 1 >= question.choices.length
  ) {
    return failure('not every choice can be right; leave at least one wrong');
  }
  return {
    ok: true,
    value: {
      ...question,
      correctChoiceIds: isCorrect
        ? question.correctChoiceIds.filter(
            (id: string): boolean => id !== choiceId
          )
        : [...question.correctChoiceIds, choiceId],
    },
  };
}

export function addChoice(
  question: Question,
  choiceId: string
): Result<Question> {
  if (question.choices.length >= QUESTION_LIMITS.maxChoices) {
    return failure(
      `a question can have at most ${QUESTION_LIMITS.maxChoices} choices`
    );
  }
  return {
    ok: true,
    value: {
      ...question,
      choices: [
        ...question.choices,
        { id: choiceId, text: `Choice ${question.choices.length + 1}` },
      ],
    },
  };
}

export function removeChoice(
  question: Question,
  choiceId: string
): Result<Question> {
  if (question.choices.length <= QUESTION_LIMITS.minChoices) {
    return failure(
      `a question needs at least ${QUESTION_LIMITS.minChoices} choices`
    );
  }
  const remaining: Choice[] = question.choices.filter(
    (choice: Choice): boolean => choice.id !== choiceId
  );
  if (remaining.length === question.choices.length) {
    return failure(
      `choice '${choiceId}' does not exist, so it cannot be removed`
    );
  }
  let correct: string[] = question.correctChoiceIds.filter(
    (id: string): boolean => id !== choiceId
  );
  if (correct.length === 0) {
    // The removed choice was the only right one; make the first remaining one right.
    correct = [remaining[0]?.id ?? ''];
  }
  if (question.kind === 'multiple' && correct.length >= remaining.length) {
    correct = correct.slice(0, remaining.length - 1);
  }
  return {
    ok: true,
    value: { ...question, choices: remaining, correctChoiceIds: correct },
  };
}
