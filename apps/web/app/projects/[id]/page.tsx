import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CourseEditor } from '../../../components/CourseEditor';
import { isProjectId } from '../../../lib/api/http';
import { toMediaJson } from '../../../lib/api/mediaHandlers';
import { getCurrentUser } from '../../../lib/auth/current';
import { redirectToSignIn } from '../../../lib/identity/redirect';
import { getServices } from '../../../lib/services';

export const dynamic = 'force-dynamic';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ProjectPage({
  params,
}: PageProps): Promise<ReactNode> {
  const { id } = await params;
  if (!isProjectId(id)) {
    notFound();
  }
  const user = await getCurrentUser();
  if (user === null) {
    redirectToSignIn();
  }
  const services = getServices();
  const found = await services.projects.get(id, user.id);
  if (!found.ok && found.kind === 'notFound') {
    notFound();
  }
  if (!found.ok) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p role="alert" className="rounded-md bg-red-50 p-3 text-red-800">
          Could not open this course: {found.errors.join(' ')}
        </p>
      </main>
    );
  }
  const media = await services.media.list(id, user.id);
  if (!media.ok) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p role="alert" className="rounded-md bg-red-50 p-3 text-red-800">
          Could not load this course's media: {media.errors.join(' ')}
        </p>
      </main>
    );
  }
  return (
    <CourseEditor
      projectId={found.value.id}
      initialCourse={found.value.course}
      initialMedia={media.value.map(toMediaJson)}
      initialPreviewUrl={services.previewAccess.urlFor(found.value.id, user.id)}
    />
  );
}
