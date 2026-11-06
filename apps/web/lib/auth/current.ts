import {
  validateIdentity,
  type Identity,
} from '@richardmcquiston01/lms-package-maker-identity';
import { headers } from 'next/headers';
import { getServices } from '../services';

/**
 * The signed-in person for a server component, or null. A provider problem is
 * written to the server log and treated as signed out, so a page can send the
 * visitor to sign in instead of failing.
 */
export async function getCurrentUser(): Promise<Identity | null> {
  const { identity } = getServices();
  const result = await identity.identify({ headers: await headers() });
  if (!result.ok) {
    console.error(
      `[identity] the '${identity.name}' provider could not tell who this is: ${result.errors.join('; ')}`
    );
    return null;
  }
  if (result.value === null) {
    return null;
  }
  const checked = validateIdentity(result.value);
  if (!checked.ok) {
    console.error(
      `[identity] the '${identity.name}' provider returned an unusable identity: ${checked.errors.join('; ')}`
    );
    return null;
  }
  return checked.value;
}
