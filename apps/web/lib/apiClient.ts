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

export interface SignedInUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

async function postAuth(
  path: string,
  action: string,
  body: Record<string, string>
): Promise<Result<SignedInUser>> {
  try {
    const response: Response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      // Auth messages are already written for people, so show them as they are.
      try {
        const failure = (await response.json()) as Partial<ApiError>;
        return {
          ok: false,
          errors: failure.details?.length
            ? [...failure.details]
            : [failure.error ?? `${action} failed (HTTP ${response.status})`],
        };
      } catch {
        return {
          ok: false,
          errors: [
            `${action} failed (HTTP ${response.status}) and the server sent no readable message`,
          ],
        };
      }
    }
    const result = (await response.json()) as { user: SignedInUser };
    return { ok: true, value: result.user };
  } catch (cause: unknown) {
    return { ok: false, errors: [describeNetworkFailure(action, cause)] };
  }
}

export function signInRequest(
  email: string,
  password: string
): Promise<Result<SignedInUser>> {
  return postAuth('/api/auth/sign-in', 'Signing in', { email, password });
}

export function signUpRequest(
  email: string,
  password: string,
  displayName: string
): Promise<Result<SignedInUser>> {
  return postAuth('/api/auth/sign-up', 'Creating the account', {
    email,
    password,
    displayName,
  });
}

export async function signOutRequest(): Promise<Result<null>> {
  try {
    const response: Response = await fetch('/api/auth/sign-out', {
      method: 'POST',
    });
    return response.ok
      ? { ok: true, value: null }
      : { ok: false, errors: [await describeFailure(response, 'Signing out')] };
  } catch (cause: unknown) {
    return {
      ok: false,
      errors: [describeNetworkFailure('Signing out', cause)],
    };
  }
}

export async function previewLinkRequest(
  projectId: string
): Promise<Result<string>> {
  const action = 'Refreshing the preview';
  try {
    const response: Response = await fetch(
      `/api/projects/${projectId}/preview-link`
    );
    if (!response.ok) {
      return { ok: false, errors: [await describeFailure(response, action)] };
    }
    const body = (await response.json()) as { url: string };
    return { ok: true, value: body.url };
  } catch (cause: unknown) {
    return { ok: false, errors: [describeNetworkFailure(action, cause)] };
  }
}
