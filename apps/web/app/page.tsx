import Link from 'next/link';
import type { ReactNode } from 'react';
import { NewProjectForm } from '../components/NewProjectForm';
import { SignOutButton } from '../components/SignOutButton';
import { getCurrentUser } from '../lib/auth/current';
import { redirectToSignIn } from '../lib/identity/redirect';
import { getServices } from '../lib/services';

export const dynamic = 'force-dynamic';

export default async function HomePage(): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (user === null) {
    redirectToSignIn();
  }
  const services = getServices();
  const listed = await services.projects.list(user.id);
  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">LMS Package Maker</h1>
        <span className="flex items-center gap-3 text-sm text-slate-600">
          {user.displayName}
          {services.accounts !== null ? (
            <SignOutButton />
          ) : services.identity.signOutUrl !== null ? (
            <a
              href={services.identity.signOutUrl}
              className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-100"
            >
              Sign out
            </a>
          ) : null}
        </span>
      </div>
      <p className="mt-2 text-slate-600">
        Author once, export to SCORM 1.2, SCORM 2004, xAPI, cmi5, AICC or HTML5.
      </p>
      <section className="mt-8" aria-labelledby="new-course">
        <h2 id="new-course" className="mb-3 text-lg font-medium">
          Start a course
        </h2>
        <NewProjectForm />
      </section>
      <section className="mt-10" aria-labelledby="your-courses">
        <h2 id="your-courses" className="mb-3 text-lg font-medium">
          Your courses
        </h2>
        {!listed.ok ? (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-red-800">
            Could not load your courses: {listed.errors.join(' ')}
          </p>
        ) : listed.value.length === 0 ? (
          <p className="text-slate-500">
            No courses yet. Create your first one above.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
            {listed.value.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="block px-4 py-3 hover:bg-slate-50"
                >
                  <span className="font-medium">{project.name}</span>
                  <span className="ml-3 text-sm text-slate-500">
                    updated{' '}
                    {project.updatedAt
                      .toISOString()
                      .slice(0, 16)
                      .replace('T', ' ')}{' '}
                    UTC
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
