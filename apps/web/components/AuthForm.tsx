'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { signInRequest, signUpRequest } from '../lib/apiClient';

interface AuthFormProps {
  readonly mode: 'sign-in' | 'sign-up';
  /** Show a link to the other form when that form is available. */
  readonly canSwitch: boolean;
}

const FIELD_CLASS =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2';

export function AuthForm({ mode, canSwitch }: AuthFormProps): ReactNode {
  const router = useRouter();
  const isSignUp: boolean = mode === 'sign-up';
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [problems, setProblems] = useState<readonly string[]>([]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setProblems([]);
    const result = isSignUp
      ? await signUpRequest(email, password, displayName)
      : await signInRequest(email, password);
    if (!result.ok) {
      setProblems(result.errors);
      setBusy(false);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-semibold">
        {isSignUp ? 'Create your account' : 'Sign in'}
      </h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {isSignUp && (
          <label className="block">
            <span className="text-sm font-medium">Your name</span>
            <input
              value={displayName}
              onChange={(event): void => setDisplayName(event.target.value)}
              autoComplete="name"
              maxLength={100}
              required
              className={FIELD_CLASS}
            />
          </label>
        )}
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event): void => setEmail(event.target.value)}
            autoComplete="email"
            required
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event): void => setPassword(event.target.value)}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            minLength={isSignUp ? 10 : undefined}
            required
            className={FIELD_CLASS}
          />
          {isSignUp && (
            <span className="mt-1 block text-xs text-slate-500">
              At least 10 characters.
            </span>
          )}
        </label>
        {problems.length > 0 && (
          <ul
            role="alert"
            className="space-y-1 rounded-md bg-red-50 p-3 text-sm text-red-800"
          >
            {problems.map((problem: string) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
        </button>
      </form>
      {canSwitch && (
        <p className="mt-4 text-sm text-slate-600">
          {isSignUp ? (
            <>
              Already have an account?{' '}
              <Link href="/sign-in" className="text-blue-700 hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{' '}
              <Link href="/sign-up" className="text-blue-700 hover:underline">
                Create an account
              </Link>
            </>
          )}
        </p>
      )}
    </main>
  );
}
