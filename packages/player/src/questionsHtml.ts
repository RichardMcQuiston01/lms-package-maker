import type {
  Page,
  Question,
} from '@richardmcquiston01/lms-package-maker-model';
import { escapeHtml } from './escape.js';

function renderQuestion(question: Question, index: number): string {
  const inputType: string = question.kind === 'single' ? 'radio' : 'checkbox';
  const points = `${question.points} ${question.points === 1 ? 'point' : 'points'}`;
  const choices: string = question.choices
    .map(
      (choice, position: number): string =>
        `<label class="lpm-choice"><input type="${inputType}" name="q${index}" value="${position}"><span>${escapeHtml(choice.text)}</span></label>`
    )
    .join('\n');
  const hint: string =
    question.kind === 'multiple'
      ? '<span class="lpm-hint">Select all that apply.</span>'
      : '';
  const explanation: string =
    question.explanation === undefined || question.explanation.trim() === ''
      ? ''
      : `\n<p class="lpm-explanation" hidden>${escapeHtml(question.explanation)}</p>`;
  return `<fieldset class="lpm-question" data-question-index="${index}">
<legend>${escapeHtml(question.prompt)} <span class="lpm-points">(${points})</span></legend>
${hint}
<div class="lpm-choices">
${choices}
</div>
<p class="lpm-feedback" role="status" hidden></p>${explanation}
</fieldset>`;
}

/**
 * The questions of one page as a group, or an empty string. Questions are
 * numbered across the whole course, starting at `firstIndex`. The right
 * answers are not written into the HTML; the player script gets them from
 * its configuration.
 */
export function renderPageQuestions(page: Page, firstIndex: number): string {
  const questions = page.questions ?? [];
  if (questions.length === 0) {
    return '';
  }
  const body: string = questions
    .map((question: Question, offset: number): string =>
      renderQuestion(question, firstIndex + offset)
    )
    .join('\n');
  // A plain container, not a <form>: hosts that sandbox the frame without
  // "allow-forms" would block a form from submitting.
  return `<div class="lpm-quiz" role="group" aria-label="Quiz questions" data-quiz-first="${firstIndex}" data-quiz-count="${questions.length}">
${body}
<div class="lpm-quiz-actions">
<button type="button" data-action="submit">Submit answers</button>
<button type="button" data-action="retry" hidden>Try again</button>
</div>
<p class="lpm-quiz-result" role="status" hidden></p>
</div>`;
}
