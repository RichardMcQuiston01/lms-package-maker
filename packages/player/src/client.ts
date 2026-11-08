import type { PlayerConfig, QuizConfig } from './config.js';
import {
  hasPassed,
  isCorrect,
  reportableScore,
  scoreQuiz,
  type Answers,
} from './quiz.js';
import { decodeProgress, encodeProgress } from './suspend.js';
import type {
  ContentRuntime,
  InitialState,
  Result,
} from '@richardmcquiston01/lms-package-maker-runtime';

/**
 * Browser script of the generated player. It shows one page at a time, marks
 * quiz answers, and reports progress through `LmsPackageRuntime`.
 *
 * Completion: with the `viewAll` rule the course is complete once every page
 * was visited. With `passQuiz` it is passed or failed once every question has
 * been answered. Every completed attempt is reported as it happened (its
 * score and its pass or fail); the system that records the data decides which
 * attempt counts.
 */

declare global {
  interface Window {
    LmsPackageRuntime?: ContentRuntime;
  }
}

function queryAll<T extends Element>(
  selector: string,
  root: ParentNode = document
): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

function showStatus(message: string): void {
  const status: HTMLElement | null = document.getElementById('lpm-status');
  if (status !== null) {
    status.textContent = message;
  }
}

/** A problem the learner should see; unlike the status line it stays put. */
function showNotice(message: string): void {
  const notice: HTMLElement | null = document.getElementById('lpm-notice');
  if (notice !== null) {
    notice.textContent = message;
    notice.hidden = false;
  }
}

function readConfig(): PlayerConfig | null {
  const element: HTMLElement | null = document.getElementById('lpm-config');
  if (element === null) {
    showStatus('Player configuration (#lpm-config) is missing from this page.');
    return null;
  }
  try {
    return JSON.parse(element.textContent ?? '') as PlayerConfig;
  } catch (cause: unknown) {
    showStatus(`Player configuration is not valid JSON: ${String(cause)}`);
    return null;
  }
}

function report(label: string, result: Result<unknown>): void {
  if (!result.ok) {
    console.error(`[lms-package] ${label}: ${result.error}`);
  }
}

async function start(): Promise<void> {
  const config: PlayerConfig | null = readConfig();
  if (config === null) {
    return;
  }
  const runtime: ContentRuntime | undefined = window.LmsPackageRuntime;
  if (runtime === undefined) {
    showStatus(
      'The LMS runtime (assets/runtime.js) did not load, so progress cannot be saved.'
    );
    return;
  }
  // A constant keeps the narrowing inside the helper functions below.
  const activeRuntime: ContentRuntime = runtime;
  const pages: HTMLElement[] = queryAll<HTMLElement>('.lpm-page');
  const navButtons: HTMLButtonElement[] =
    queryAll<HTMLButtonElement>('[data-nav-index]');
  const progress: HTMLProgressElement | null =
    document.querySelector('progress');
  const quiz: QuizConfig | null = config.quiz;
  const summary: HTMLElement | null =
    document.getElementById('lpm-quiz-summary');
  if (pages.length !== config.pages.length) {
    showStatus(
      `Expected ${config.pages.length} pages but found ${pages.length} in the document.`
    );
    return;
  }

  const initial: Result<InitialState> = await activeRuntime.start();
  const state: InitialState = initial.ok
    ? initial.value
    : { location: null, suspendData: null, status: null };
  if (!initial.ok) {
    showNotice(`Progress will not be saved: ${initial.error}`);
  }
  const saved = decodeProgress(
    state.suspendData,
    pages.length,
    quiz?.questions.length ?? 0
  );
  const visited: boolean[] = [...saved.visited];
  const answers: (readonly number[] | null)[] = [...saved.answers];
  let lastPercent: number | null = saved.lastPercent;
  let current: number = Math.max(
    0,
    config.pages.findIndex((page): boolean => page.id === state.location)
  );

  function persist(): void {
    report(
      'setSuspendData',
      activeRuntime.setSuspendData(
        encodeProgress({ visited, lastPercent, answers })
      )
    );
  }

  // ---- quiz -------------------------------------------------------------

  function questionElement(index: number): HTMLFieldSetElement | null {
    return document.querySelector<HTMLFieldSetElement>(
      `[data-question-index="${index}"]`
    );
  }

  function setLocked(fieldset: HTMLFieldSetElement, locked: boolean): void {
    queryAll<HTMLInputElement>('input', fieldset).forEach(
      (input: HTMLInputElement): void => {
        input.disabled = locked;
      }
    );
  }

  /** Shows whether an answered question was right, and its explanation. */
  function markQuestion(index: number): void {
    const question = quiz?.questions[index];
    const answer = answers[index];
    const fieldset: HTMLFieldSetElement | null = questionElement(index);
    if (
      question === undefined ||
      answer === null ||
      answer === undefined ||
      fieldset === null
    ) {
      return;
    }
    queryAll<HTMLInputElement>('input', fieldset).forEach(
      (input: HTMLInputElement): void => {
        input.checked = answer.includes(Number(input.value));
      }
    );
    setLocked(fieldset, true);
    const right: boolean = isCorrect(question, answer);
    fieldset.classList.toggle('is-correct', right);
    fieldset.classList.toggle('is-wrong', !right);
    const feedback: HTMLElement | null =
      fieldset.querySelector('.lpm-feedback');
    if (feedback !== null) {
      feedback.textContent = right ? 'Correct.' : 'Not quite.';
      feedback.hidden = false;
    }
    const explanation: HTMLElement | null =
      fieldset.querySelector('.lpm-explanation');
    if (explanation !== null) {
      explanation.hidden = false;
    }
  }

  function clearQuestion(index: number): void {
    const fieldset: HTMLFieldSetElement | null = questionElement(index);
    answers[index] = null;
    if (fieldset === null) {
      return;
    }
    queryAll<HTMLInputElement>('input', fieldset).forEach(
      (input: HTMLInputElement): void => {
        input.checked = false;
      }
    );
    setLocked(fieldset, false);
    fieldset.classList.remove('is-correct', 'is-wrong');
    queryAll<HTMLElement>('.lpm-feedback, .lpm-explanation', fieldset).forEach(
      (element: HTMLElement): void => {
        element.hidden = true;
      }
    );
  }

  function describeSummary(): string {
    if (quiz === null) return '';
    const score = scoreQuiz(quiz, answers);
    if (lastPercent === null) {
      return score.complete
        ? ''
        : 'Answer every question to see your quiz score.';
    }
    const latest: string = `${reportableScore(lastPercent)}%`;
    if (quiz.passPercent === null) {
      return `Quiz score: ${latest}.`;
    }
    return hasPassed(lastPercent, quiz.passPercent)
      ? `Quiz score: ${latest}. Passed (pass mark ${quiz.passPercent}%).`
      : `Quiz score: ${latest}. Not passed (pass mark ${quiz.passPercent}%). You can try again.`;
  }

  function showSummary(): void {
    if (summary !== null) {
      const text: string = describeSummary();
      summary.textContent = text;
      summary.hidden = text === '';
    }
  }

  /**
   * Reports the attempt that was just completed, once every question has an
   * answer: its score and, with a pass mark, whether it passed.
   */
  function evaluateQuiz(): void {
    if (quiz === null) return;
    const score = scoreQuiz(quiz, answers);
    if (score.complete) {
      lastPercent = score.percent;
      report(
        'setScore',
        activeRuntime.setScore({
          raw: reportableScore(score.percent),
          min: 0,
          max: 100,
        })
      );
      if (quiz.passPercent !== null) {
        const passed: boolean = hasPassed(score.percent, quiz.passPercent);
        report(
          passed ? 'pass' : 'fail',
          passed ? activeRuntime.pass() : activeRuntime.fail()
        );
      }
    }
    showSummary();
    persist();
  }

  function formRange(form: HTMLElement): number[] {
    const first = Number(form.dataset['quizFirst']);
    const count = Number(form.dataset['quizCount']);
    return Array.from(
      { length: count },
      (_unused, offset: number): number => first + offset
    );
  }

  queryAll<HTMLElement>('.lpm-quiz').forEach((form: HTMLElement): void => {
    const submitButton: HTMLButtonElement | null = form.querySelector(
      '[data-action="submit"]'
    );
    const retryButton: HTMLButtonElement | null = form.querySelector(
      '[data-action="retry"]'
    );
    const result: HTMLElement | null = form.querySelector('.lpm-quiz-result');

    function refreshForm(): void {
      const indexes: number[] = formRange(form);
      const submitted: boolean = indexes.every(
        (index: number): boolean => answers[index] !== null
      );
      if (submitButton !== null) submitButton.hidden = submitted;
      if (retryButton !== null) retryButton.hidden = !submitted;
      if (result !== null && quiz !== null) {
        if (submitted) {
          const earned: number = indexes.reduce(
            (sum: number, index: number): number => {
              const question = quiz.questions[index];
              const answer = answers[index];
              return question !== undefined &&
                answer !== null &&
                answer !== undefined &&
                isCorrect(question, answer)
                ? sum + question.points
                : sum;
            },
            0
          );
          const possible: number = indexes.reduce(
            (sum: number, index: number): number =>
              sum + (quiz.questions[index]?.points ?? 0),
            0
          );
          result.textContent = `You scored ${earned} of ${possible} points on this page.`;
        }
        result.hidden = !submitted;
      }
    }

    submitButton?.addEventListener('click', (): void => {
      for (const index of formRange(form)) {
        const fieldset: HTMLFieldSetElement | null = questionElement(index);
        const picked: number[] =
          fieldset === null
            ? []
            : queryAll<HTMLInputElement>('input:checked', fieldset).map(
                (input: HTMLInputElement): number => Number(input.value)
              );
        answers[index] = picked;
        markQuestion(index);
      }
      refreshForm();
      evaluateQuiz();
    });

    retryButton?.addEventListener('click', (): void => {
      formRange(form).forEach(clearQuestion);
      refreshForm();
      showSummary();
      persist();
    });

    // Restore answers saved in an earlier session.
    formRange(form).forEach(markQuestion);
    refreshForm();
  });

  // ---- pages ------------------------------------------------------------

  const show = (index: number): void => {
    current = index;
    visited[index] = true;
    pages.forEach((page: HTMLElement, pageIndex: number): void => {
      page.hidden = pageIndex !== index;
    });
    navButtons.forEach((button: HTMLButtonElement): void => {
      if (Number(button.dataset['navIndex']) === index) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });
    const seenCount: number = visited.filter(Boolean).length;
    if (progress !== null) {
      progress.value = seenCount / pages.length;
    }
    const page = config.pages[index];
    if (page !== undefined) {
      report('setLocation', activeRuntime.setLocation(page.id));
    }
    persist();
    report('setProgress', activeRuntime.setProgress(seenCount / pages.length));
    if (config.completion === 'viewAll' && seenCount === pages.length) {
      report('complete', activeRuntime.complete());
      showStatus('Course complete.');
    } else {
      showStatus(`Page ${index + 1} of ${pages.length}`);
    }
  };

  navButtons.forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void =>
      show(Number(button.dataset['navIndex']))
    );
  });
  for (const [action, step] of [
    ['prev', -1],
    ['next', 1],
  ] as const) {
    document
      .querySelector(`[data-action="${action}"]`)
      ?.addEventListener('click', (): void => {
        show(Math.min(pages.length - 1, Math.max(0, current + step)));
      });
  }

  let ended = false;
  const end = (): void => {
    if (!ended) {
      ended = true;
      report('terminate', activeRuntime.terminate());
    }
  };
  window.addEventListener('pagehide', end);
  window.addEventListener('beforeunload', end);

  // "Exit course": end the session on purpose, then let the adapter finish
  // (statements and requests still in flight are sent; cmi5 returns to the
  // LMS). A window the LMS opened can close itself; others cannot, so the page
  // says the session is over.
  document
    .querySelector<HTMLButtonElement>('[data-action="exit"]')
    ?.addEventListener('click', (event: MouseEvent): void => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      ended = true;
      showStatus('Ending the session…');
      void activeRuntime.exit().then((result: Result<null>): void => {
        report('exit', result);
        showStatus(
          result.ok
            ? 'The session has ended. You can close this window.'
            : `The session could not be ended cleanly: ${result.error}`
        );
        if (!result.ok) {
          // Leave the way open to try again, here or by closing the window.
          ended = false;
          button.disabled = false;
          return;
        }
        // Browsers only let a script close a window that a script opened.
        if (window.opener !== null) {
          window.close();
        }
      });
    });

  showSummary();
  show(current);
}

start().catch((cause: unknown): void => {
  const reason: string = cause instanceof Error ? cause.message : String(cause);
  console.error(`[lms-package] the player failed to start: ${reason}`);
});
