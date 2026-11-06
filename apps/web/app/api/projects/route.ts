import { createProject, listProjects } from '../../../lib/api/handlers';
import { signedIn } from '../../../lib/api/routes';

export const dynamic = 'force-dynamic';

export const GET = signedIn<unknown>((services, user): Promise<Response> =>
  listProjects(services.projects, user.id)
);

export const POST = signedIn<unknown>(
  (services, user, request): Promise<Response> =>
    createProject(services.projects, user.id, request)
);
