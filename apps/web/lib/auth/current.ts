import { cookies } from 'next/headers';
import { getServices } from '../services';
import { SESSION_COOKIE_NAME } from './http';
import type { AuthUser } from './types';

/** The signed-in person for a server component, or null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token: string | undefined = store.get(SESSION_COOKIE_NAME)?.value;
  return getServices().auth.authenticate(token ?? null);
}
