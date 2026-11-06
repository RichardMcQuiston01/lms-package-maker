import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

/**
 * Shown when another identity provider decides who is signed in and has no
 * sign-in address configured, so the app cannot send the visitor anywhere.
 */
export default function NotSignedInPage(): ReactNode {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">You are not signed in</h1>
      <p className="mt-3 text-slate-600">
        This server learns who you are from your organisation&apos;s login. Sign
        in there, then open this page again. If you think you are signed in, ask
        whoever runs this server to check that the login passes your identity
        on.
      </p>
    </main>
  );
}
