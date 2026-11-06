import { createProject, listProjects } from '../../../lib/api/handlers';
import { getProjectService } from '../../../lib/services';

export const dynamic = 'force-dynamic';

export function GET(): Promise<Response> {
  return listProjects(getProjectService());
}

export function POST(request: Request): Promise<Response> {
  return createProject(getProjectService(), request);
}
