import { redirect } from 'next/navigation';
import { getServices } from '../services';

/** Sends a signed-out visitor to the provider's sign-in address, or an explanation page. */
export function redirectToSignIn(): never {
  redirect(getServices().identity.signInUrl ?? '/not-signed-in');
}
