import { previewProject } from '../../../../../../lib/api/handlers';
import { getProjectService } from '../../../../../../lib/services';

export const dynamic = 'force-dynamic';

interface RouteContext {
  readonly params: Promise<{ id: string; path?: string[] }>;
}

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<Response> {
  const { id, path } = await context.params;
  return previewProject(getProjectService(), id, path ?? []);
}
