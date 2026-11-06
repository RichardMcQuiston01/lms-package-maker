import { exportProject } from '../../../../../lib/api/handlers';
import { signedIn } from '../../../../../lib/api/routes';

export const dynamic = 'force-dynamic';

interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

export const GET = signedIn<RouteContext>(
  async (services, user, request, context): Promise<Response> => {
    const { id } = await context.params;
    const standard: string | null = new URL(request.url).searchParams.get(
      'standard'
    );
    return exportProject(services.projects, user.id, id, standard);
  }
);
