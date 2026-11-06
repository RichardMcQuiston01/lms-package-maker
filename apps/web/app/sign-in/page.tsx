import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthForm } from '../../components/AuthForm';
import { getCurrentUser } from '../../lib/auth/current';
import { getServices } from '../../lib/services';

export const dynamic = 'force-dynamic';

export default async function SignInPage(): Promise<ReactNode> {
  if ((await getCurrentUser()) !== null) {
    redirect('/');
  }
  const signUpOpen: boolean = await getServices().auth.isSignUpOpen();
  return <AuthForm mode="sign-in" canSwitch={signUpOpen} />;
}
