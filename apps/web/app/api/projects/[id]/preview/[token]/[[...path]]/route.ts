import { previewProject } from '../../../../../../../lib/api/handlers';
import { getServices } from '../../../../../../../lib/services';

export const dynamic = 'force-dynamic';

interface RouteContext {
  readonly params: Promise<{ id: string; token: string; path?: string[] }>;
}

/** Opened by the sandboxed preview frame, which authenticates with the signed token. */
export async function GET(
  _request: Request,
  context: RouteContext
): Promise<Response> {
  const { id, token, path } = await context.params;
  const services = getServices();
  return previewProject(
    services.projects,
    services.previewAccess,
    id,
    token,
    path ?? []
  );
}
