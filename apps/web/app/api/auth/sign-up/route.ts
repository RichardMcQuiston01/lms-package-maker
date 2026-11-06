import { signUpHandler } from '../../../../lib/api/authHandlers';
import { getServices } from '../../../../lib/services';

export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return signUpHandler(getServices().auth, request);
}
