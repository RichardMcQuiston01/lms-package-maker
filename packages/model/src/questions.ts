/** Limits that keep a quiz readable and its saved progress small enough for SCORM 1.2. */
export const QUESTION_LIMITS = {
  maxQuestionsPerPage: 50,
  maxQuestionsPerCourse: 200,
  minChoices: 2,
  maxChoices: 10,
  maxPromptLength: 500,
  maxChoiceLength: 200,
  maxExplanationLength: 1000,
  minPoints: 1,
  maxPoints: 100,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkText(
  source: Record<string, unknown>,
  key: string,
  path: string,
  maxLength: number,
  errors: string[]
): void {
  const value: unknown = source[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(
      `${path}.${key} must be a non-empty string, got ${typeof value}`
    );
  } else if (value.length > maxLength) {
    errors.push(
      `${path}.${key} must be at most ${maxLength} characters, got ${value.length}`
    );
  }
}

function checkChoices(
  question: Record<string, unknown>,
  path: string,
  errors: string[]
): string[] {
  const choices: unknown = question['choices'];
  const ids: string[] = [];
  if (
    !Array.isArray(choices) ||
    choices.length < QUESTION_LIMITS.minChoices ||
    choices.length > QUESTION_LIMITS.maxChoices
  ) {
    errors.push(
      `${path}.choices must be an array of ${QUESTION_LIMITS.minChoices} to ${QUESTION_LIMITS.maxChoices} choices`
    );
    return ids;
  }
  choices.forEach((choice: unknown, index: number): void => {
    const choicePath = `${path}.choices[${index}]`;
    if (!isRecord(choice)) {
      errors.push(`${choicePath} must be an object`);
      return;
    }
    const id: unknown = choice['id'];
    if (typeof id !== 'string' || id.trim() === '') {
      errors.push(
        `${choicePath}.id must be a non-empty string, got ${typeof id}`
      );
    } else if (ids.includes(id)) {
      errors.push(`${choicePath}.id '${id}' is used twice in this question`);
    } else {
      ids.push(id);
    }
    checkText(
      choice,
      'text',
      choicePath,
      QUESTION_LIMITS.maxChoiceLength,
      errors
    );
  });
  return ids;
}

/**
 * Checks the questions of one page and adds every problem it finds to
 * `errors`. `seenQuestionIds` is shared across the course so ids stay unique.
 * Returns how many questions the page holds.
 */
export function validateQuestions(
  value: unknown,
  pagePath: string,
  seenQuestionIds: Set<string>,
  errors: string[]
): number {
  if (value === undefined) {
    return 0;
  }
  if (!Array.isArray(value)) {
    errors.push(`${pagePath}.questions must be an array`);
    return 0;
  }
  if (value.length > QUESTION_LIMITS.maxQuestionsPerPage) {
    errors.push(
      `${pagePath}.questions holds ${value.length} questions; the most a page can hold is ${QUESTION_LIMITS.maxQuestionsPerPage}`
    );
  }
  value.forEach((question: unknown, index: number): void => {
    const path = `${pagePath}.questions[${index}]`;
    if (!isRecord(question)) {
      errors.push(`${path} must be an object`);
      return;
    }
    const id: unknown = question['id'];
    if (typeof id !== 'string' || id.trim() === '') {
      errors.push(`${path}.id must be a non-empty string, got ${typeof id}`);
    } else if (seenQuestionIds.has(id)) {
      errors.push(
        `${path}.id '${id}' is used more than once; question ids must be unique across the course`
      );
    } else {
      seenQuestionIds.add(id);
    }
    const kind: unknown = question['kind'];
    if (kind !== 'single' && kind !== 'multiple') {
      errors.push(
        `${path}.kind must be 'single' or 'multiple', got ${String(kind)}`
      );
    }
    checkText(
      question,
      'prompt',
      path,
      QUESTION_LIMITS.maxPromptLength,
      errors
    );
    const choiceIds: string[] = checkChoices(question, path, errors);
    const correct: unknown = question['correctChoiceIds'];
    if (!Array.isArray(correct) || correct.length === 0) {
      errors.push(
        `${path}.correctChoiceIds must list at least one correct choice`
      );
    } else {
      const unknown: unknown[] = correct.filter(
        (entry: unknown): boolean =>
          typeof entry !== 'string' || !choiceIds.includes(entry)
      );
      if (unknown.length > 0) {
        errors.push(
          `${path}.correctChoiceIds names choices that do not exist: ${unknown.map(String).join(', ')}`
        );
      }
      if (new Set(correct).size !== correct.length) {
        errors.push(`${path}.correctChoiceIds lists a choice more than once`);
      }
      if (kind === 'single' && correct.length !== 1) {
        errors.push(
          `${path}.correctChoiceIds must hold exactly one choice for a 'single' question, got ${correct.length}`
        );
      }
      if (
        kind === 'multiple' &&
        correct.length >= choiceIds.length &&
        choiceIds.length > 0
      ) {
        errors.push(
          `${path}: a 'multiple' question cannot have every choice correct`
        );
      }
    }
    const points: unknown = question['points'];
    if (
      typeof points !== 'number' ||
      !Number.isInteger(points) ||
      points < QUESTION_LIMITS.minPoints ||
      points > QUESTION_LIMITS.maxPoints
    ) {
      errors.push(
        `${path}.points must be a whole number from ${QUESTION_LIMITS.minPoints} to ${QUESTION_LIMITS.maxPoints}`
      );
    }
    const explanation: unknown = question['explanation'];
    if (explanation !== undefined) {
      if (typeof explanation !== 'string') {
        errors.push(
          `${path}.explanation must be a string, got ${typeof explanation}`
        );
      } else if (explanation.length > QUESTION_LIMITS.maxExplanationLength) {
        errors.push(
          `${path}.explanation must be at most ${QUESTION_LIMITS.maxExplanationLength} characters, got ${explanation.length}`
        );
      }
    }
  });
  return value.length;
}
