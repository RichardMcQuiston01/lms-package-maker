import { getProject, saveProject } from '../../../../lib/api/handlers';
import { getProjectService } from '../../../../lib/services';

export const dynamic = 'force-dynamic';

interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<Response> {
  const { id } = await context.params;
  return getProject(getProjectService(), id);
}

export async function PUT(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const { id } = await context.params;
  return saveProject(getProjectService(), id, request);
}
