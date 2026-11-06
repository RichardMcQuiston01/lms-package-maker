'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { signOutRequest } from '../lib/apiClient';

export function SignOutButton(): ReactNode {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    const result = await signOutRequest();
    if (!result.ok) {
      setProblem(result.errors.join(' '));
      return;
    }
    router.push('/sign-in');
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={(): void => void handleClick()}
        className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
      >
        Sign out
      </button>
      {problem !== null && (
        <span role="alert" className="text-sm text-red-700">
          {problem}
        </span>
      )}
    </span>
  );
}
