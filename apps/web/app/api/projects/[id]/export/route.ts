import { exportProject } from '../../../../../lib/api/handlers';
import { getProjectService } from '../../../../../lib/services';

export const dynamic = 'force-dynamic';

interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const { id } = await context.params;
  const standard: string | null = new URL(request.url).searchParams.get(
    'standard'
  );
  return exportProject(getProjectService(), id, standard);
}
