import type {
  CourseModel,
  Result,
} from '@richardmcquiston01/lms-package-maker-model';
import type { ApiError } from './api/http';

/** Browser-side calls to the JSON API. Failures say what went wrong and where. */

async function describeFailure(
  response: Response,
  action: string
): Promise<string> {
  try {
    const body = (await response.json()) as Partial<ApiError>;
    const details: string = (body.details ?? []).join('; ');
    return `${action} failed (HTTP ${response.status}): ${body.error ?? 'no message'}${
      details !== '' ? ` [${details}]` : ''
    }`;
  } catch {
    return `${action} failed (HTTP ${response.status}) and the server sent no readable message`;
  }
}

function describeNetworkFailure(action: string, cause: unknown): string {
  const reason: string = cause instanceof Error ? cause.message : String(cause);
  return `${action} failed because the server could not be reached: ${reason}`;
}

export async function createProjectRequest(
  title: string
): Promise<Result<{ id: string }>> {
  const action = 'Creating the project';
  try {
    const response: Response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      return { ok: false, errors: [await describeFailure(response, action)] };
    }
    const body = (await response.json()) as { project: { id: string } };
    return { ok: true, value: { id: body.project.id } };
  } catch (cause: unknown) {
    return { ok: false, errors: [describeNetworkFailure(action, cause)] };
  }
}

export async function saveCourseRequest(
  projectId: string,
  course: CourseModel
): Promise<Result<CourseModel>> {
  const action = 'Saving the course';
  try {
    const response: Response = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(course),
    });
    if (!response.ok) {
      return { ok: false, errors: [await describeFailure(response, action)] };
    }
    const body = (await response.json()) as {
      project: { course: CourseModel };
    };
    return { ok: true, value: body.project.course };
  } catch (cause: unknown) {
    return { ok: false, errors: [describeNetworkFailure(action, cause)] };
  }
}
