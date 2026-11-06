import { getProject, saveProject } from '../../../../lib/api/handlers';
import { signedIn } from '../../../../lib/api/routes';

export const dynamic = 'force-dynamic';

interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

export const GET = signedIn<RouteContext>(
  async (services, user, _request, context): Promise<Response> => {
    const { id } = await context.params;
    return getProject(services.projects, user.id, id);
  }
);

export const PUT = signedIn<RouteContext>(
  async (services, user, request, context): Promise<Response> => {
    const { id } = await context.params;
    return saveProject(services.projects, user.id, id, request);
  }
);
