'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { createProjectRequest } from '../lib/apiClient';

export function NewProjectForm(): ReactNode {
  const router = useRouter();
  const [title, setTitle] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const created = await createProjectRequest(title);
    if (!created.ok) {
      setProblem(created.errors.join(' '));
      setBusy(false);
      return;
    }
    router.push(`/projects/${created.value.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-3">
      <label className="flex-1 min-w-64">
        <span className="sr-only">Course title</span>
        <input
          value={title}
          onChange={(event): void => setTitle(event.target.value)}
          placeholder="New course title"
          maxLength={200}
          required
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={busy || title.trim() === ''}
        className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create course'}
      </button>
      {problem !== null && (
        <p role="alert" className="w-full text-sm text-red-700">
          {problem}
        </p>
      )}
    </form>
  );
}
