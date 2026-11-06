import { signInHandler } from '../../../../lib/api/authHandlers';
import { builtInSignInOff } from '../../../../lib/api/http';
import { getServices } from '../../../../lib/services';

export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  const { accounts, identity } = getServices();
  if (accounts === null) {
    return Promise.resolve(builtInSignInOff(identity.name));
  }
  return signInHandler(accounts, request);
}
