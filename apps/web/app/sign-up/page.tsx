import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthForm } from '../../components/AuthForm';
import { getCurrentUser } from '../../lib/auth/current';
import { getServices } from '../../lib/services';

export const dynamic = 'force-dynamic';

export default async function SignUpPage(): Promise<ReactNode> {
  if ((await getCurrentUser()) !== null) {
    redirect('/');
  }
  if (!(await getServices().auth.isSignUpOpen())) {
    return (
      <main className="mx-auto max-w-sm p-8">
        <h1 className="text-2xl font-semibold">Sign-up is closed</h1>
        <p className="mt-3 text-slate-600">
          Ask the person who runs this server to create an account for you, or
          to set <code>ALLOW_SIGN_UP=true</code>.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/sign-in" className="text-blue-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </main>
    );
  }
  return <AuthForm mode="sign-up" canSwitch />;
}
