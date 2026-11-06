'use client';

import {
  QUESTION_LIMITS,
  type Choice,
  type Question,
  type Result,
} from '@richardmcquiston01/lms-package-maker-model';
import type { ReactNode } from 'react';
import { newClientId } from '../lib/ids';
import {
  addChoice,
  removeChoice,
  setChoiceText,
  setExplanation,
  setKind,
  setPoints,
  setPrompt,
  toggleCorrect,
} from '../lib/questionEdit';

interface QuestionEditorProps {
  readonly question: Question;
  readonly number: number;
  readonly onChange: (question: Question) => void;
  /** Called with a message when an edit would make the question invalid. */
  readonly onProblem: (message: string) => void;
  readonly onRemove: () => void;
  readonly onMove: (direction: -1 | 1) => void;
}

const FIELD =
  'mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm';

export function QuestionEditor({
  question,
  number,
  onChange,
  onProblem,
  onRemove,
  onMove,
}: QuestionEditorProps): ReactNode {
  function apply(result: Result<Question>): void {
    if (result.ok) {
      onChange(result.value);
    } else {
      onProblem(result.errors.join(' '));
    }
  }

  const inputType: string = question.kind === 'single' ? 'radio' : 'checkbox';
  return (
    <fieldset className="rounded-md border border-slate-300 bg-white p-3">
      <legend className="px-1 text-sm font-semibold">Question {number}</legend>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <span className="block text-slate-600">Type</span>
          <select
            aria-label={`Question ${number} type`}
            value={question.kind}
            onChange={(event): void =>
              onChange(
                setKind(
                  question,
                  event.target.value === 'multiple' ? 'multiple' : 'single'
                )
              )
            }
            className="mt-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            <option value="single">One right answer</option>
            <option value="multiple">Several right answers</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-slate-600">Points</span>
          <input
            aria-label={`Question ${number} points`}
            type="number"
            min={QUESTION_LIMITS.minPoints}
            max={QUESTION_LIMITS.maxPoints}
            step={1}
            value={question.points}
            onChange={(event): void =>
              onChange(
                setPoints(question, Math.round(Number(event.target.value) || 1))
              )
            }
            className="mt-1 w-20 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          />
        </label>
        <span className="ml-auto flex gap-1 text-sm">
          <button
            type="button"
            aria-label={`Move question ${number} up`}
            onClick={(): void => onMove(-1)}
            className="rounded px-1.5 hover:bg-slate-200"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move question ${number} down`}
            onClick={(): void => onMove(1)}
            className="rounded px-1.5 hover:bg-slate-200"
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={`Remove question ${number}`}
            onClick={onRemove}
            className="rounded px-1.5 text-red-700 hover:bg-red-50"
          >
            ✕
          </button>
        </span>
      </div>
      <label className="mt-2 block text-xs">
        <span className="text-slate-600">Question</span>
        <textarea
          aria-label={`Question ${number} text`}
          value={question.prompt}
          maxLength={QUESTION_LIMITS.maxPromptLength}
          rows={2}
          onChange={(event): void =>
            onChange(setPrompt(question, event.target.value))
          }
          className={FIELD}
        />
      </label>
      <p className="mt-2 text-xs text-slate-600">
        Choices.{' '}
        {question.kind === 'single'
          ? 'Select the right answer.'
          : 'Tick every right answer.'}
      </p>
      <ul className="mt-1 space-y-1">
        {question.choices.map((choice: Choice, position: number) => (
          <li key={choice.id} className="flex items-center gap-2">
            <input
              type={inputType}
              name={`correct-${question.id}`}
              aria-label={`Choice ${position + 1} of question ${number} is right`}
              checked={question.correctChoiceIds.includes(choice.id)}
              onChange={(): void => apply(toggleCorrect(question, choice.id))}
            />
            <input
              aria-label={`Question ${number} choice ${position + 1} text`}
              value={choice.text}
              maxLength={QUESTION_LIMITS.maxChoiceLength}
              onChange={(event): void =>
                onChange(setChoiceText(question, choice.id, event.target.value))
              }
              className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            />
            <button
              type="button"
              aria-label={`Remove choice ${position + 1} of question ${number}`}
              onClick={(): void => apply(removeChoice(question, choice.id))}
              className="rounded px-1.5 text-slate-600 hover:bg-slate-200"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={(): void => apply(addChoice(question, newClientId()))}
        className="mt-1 text-xs text-blue-700 hover:underline"
      >
        + Add choice
      </button>
      <label className="mt-2 block text-xs">
        <span className="text-slate-600">
          Explanation shown after answering (optional)
        </span>
        <textarea
          aria-label={`Question ${number} explanation`}
          value={question.explanation ?? ''}
          maxLength={QUESTION_LIMITS.maxExplanationLength}
          rows={2}
          onChange={(event): void =>
            onChange(setExplanation(question, event.target.value))
          }
          className={FIELD}
        />
      </label>
    </fieldset>
  );
}
