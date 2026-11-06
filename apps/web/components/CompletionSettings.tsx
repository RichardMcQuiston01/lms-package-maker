'use client';

import type {
  CompletionRule,
  CourseModel,
} from '@richardmcquiston01/lms-package-maker-model';
import type { ReactNode } from 'react';
import { countQuestions } from '../lib/courseEdit';

interface CompletionSettingsProps {
  readonly course: CourseModel;
  readonly onChange: (rule: CompletionRule) => void;
}

const DEFAULT_PASS_MARK = 70;

/** How a learner finishes the course, and the pass mark when a quiz decides it. */
export function CompletionSettings({
  course,
  onChange,
}: CompletionSettingsProps): ReactNode {
  const rule: CompletionRule = course.completion;
  const questionCount: number = countQuestions(course);
  return (
    <section
      aria-label="Completion"
      className="mt-6 border-t border-slate-200 pt-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide opacity-70">
        Completion
      </h2>
      <label className="mt-2 flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="completion"
          checked={rule.kind === 'viewAll'}
          onChange={(): void => onChange({ kind: 'viewAll' })}
          className="mt-1"
        />
        <span>Complete when every page has been viewed</span>
      </label>
      <label className="mt-1 flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="completion"
          checked={rule.kind === 'passQuiz'}
          onChange={(): void =>
            onChange({ kind: 'passQuiz', minScorePercent: DEFAULT_PASS_MARK })
          }
          className="mt-1"
        />
        <span>Complete when the learner passes the quiz</span>
      </label>
      {rule.kind === 'passQuiz' && (
        <label className="ml-6 mt-2 block text-xs">
          <span className="text-slate-600">Pass mark (percent)</span>
          <input
            aria-label="Pass mark in percent"
            type="number"
            min={0}
            max={100}
            step={1}
            value={rule.minScorePercent}
            onChange={(event): void =>
              onChange({
                kind: 'passQuiz',
                minScorePercent: Math.min(
                  100,
                  Math.max(0, Number(event.target.value) || 0)
                ),
              })
            }
            className="mt-1 block w-24 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          />
        </label>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {questionCount === 0
          ? 'No questions yet.'
          : `${questionCount} ${questionCount === 1 ? 'question' : 'questions'} in this course.`}
        {rule.kind === 'passQuiz' && questionCount === 0 && (
          <span role="alert" className="ml-1 text-red-700">
            Add at least one question before saving.
          </span>
        )}
      </p>
    </section>
  );
}
