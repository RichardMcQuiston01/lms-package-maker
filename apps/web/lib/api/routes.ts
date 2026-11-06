import { getServices, type Services } from '../services';
import type { Identity } from '@richardmcquiston01/lms-package-maker-identity';
import { authenticateRequest } from './session';

/**
 * Wraps a route so it only runs for a signed-in person. The route receives
 * the services and the person, and its own request and context.
 */
export function signedIn<TContext>(
  run: (
    services: Services,
    user: Identity,
    request: Request,
    context: TContext
  ) => Promise<Response>
): (request: Request, context: TContext) => Promise<Response> {
  return async (request: Request, context: TContext): Promise<Response> => {
    const services: Services = getServices();
    const result = await authenticateRequest(services.identity, request);
    if (!result.ok) {
      return result.response;
    }
    return run(services, result.user, request, context);
  };
}
