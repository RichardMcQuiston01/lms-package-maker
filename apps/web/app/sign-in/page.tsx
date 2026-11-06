import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthForm } from '../../components/AuthForm';
import { getCurrentUser } from '../../lib/auth/current';
import { getServices } from '../../lib/services';

export const dynamic = 'force-dynamic';

export default async function SignInPage(): Promise<ReactNode> {
  const { accounts } = getServices();
  if (accounts === null) {
    // Another identity provider signs people in; this app has no sign-in page.
    notFound();
  }
  if ((await getCurrentUser()) !== null) {
    redirect('/');
  }
  const signUpOpen: boolean = await accounts.isSignUpOpen();
  return <AuthForm mode="sign-in" canSwitch={signUpOpen} />;
}
