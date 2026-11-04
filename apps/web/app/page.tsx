import type { ReactNode } from 'react';

export default function HomePage(): ReactNode {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-semibold">LMS Package Maker</h1>
      <p className="mt-2 text-slate-600">
        Author once, export to SCORM, xAPI, cmi5, AICC or HTML5.
      </p>
    </main>
  );
}
