import type {
  IdentityProvider,
  IdentityRequest,
  IdentityResult,
} from '@richardmcquiston01/lms-package-maker-identity';
import { readSessionToken } from '../auth/http';
import type { AuthService } from '../auth/service';

/**
 * The app's own accounts as an identity provider: it reads the session cookie
 * and asks the account service who it belongs to. Sign-in happens on the
 * app's own `/sign-in` page.
 */
export function createBuiltInIdentityProvider(
  accounts: AuthService
): IdentityProvider {
  return {
    name: 'builtin',
    signInUrl: '/sign-in',
    signOutUrl: null,
    async identify(request: IdentityRequest): Promise<IdentityResult> {
      const user = await accounts.authenticate(
        readSessionToken(request.headers.get('cookie'))
      );
      return {
        ok: true,
        value:
          user === null
            ? null
            : { id: user.id, displayName: user.displayName, email: user.email },
      };
    },
  };
}
