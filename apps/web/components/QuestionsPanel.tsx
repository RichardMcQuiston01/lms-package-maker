'use client';

import type {
  Page,
  Question,
} from '@richardmcquiston01/lms-package-maker-model';
import type { ReactNode } from 'react';
import { QuestionEditor } from './QuestionEditor';

interface QuestionsPanelProps {
  readonly page: Page;
  readonly onAdd: () => void;
  readonly onChange: (question: Question) => void;
  readonly onRemove: (questionId: string) => void;
  readonly onMove: (questionId: string, direction: -1 | 1) => void;
  readonly onProblem: (message: string) => void;
}

/** The questions of the open page. A page with questions becomes a quiz page. */
export function QuestionsPanel({
  page,
  onAdd,
  onChange,
  onRemove,
  onMove,
  onProblem,
}: QuestionsPanelProps): ReactNode {
  const questions: readonly Question[] = page.questions ?? [];
  return (
    <section
      aria-label="Questions"
      className="mt-6 border-t border-slate-200 pt-4"
    >
      <h2 className="text-sm font-semibold">Questions on this page</h2>
      {questions.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          No questions. Add one to make this a quiz page; learners submit their
          answers at the bottom of the page.
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          {questions.map((question: Question, index: number) => (
            <QuestionEditor
              key={question.id}
              question={question}
              number={index + 1}
              onChange={onChange}
              onProblem={onProblem}
              onRemove={(): void => onRemove(question.id)}
              onMove={(direction): void => onMove(question.id, direction)}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 rounded border border-dashed border-slate-400 px-3 py-1.5 text-sm hover:bg-slate-100"
      >
        + Add question
      </button>
    </section>
  );
}
