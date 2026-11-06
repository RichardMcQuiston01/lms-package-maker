'use client';

import type { ReactNode } from 'react';

interface PreviewPaneProps {
  /** Signed link to the preview; a new link loads the newest saved version. */
  readonly previewUrl: string;
  readonly hasUnsavedChanges: boolean;
}

/**
 * Shows the saved course in the real player. The frame is sandboxed without
 * `allow-same-origin`, so preview content cannot reach the editor's cookies
 * or storage even if it were hostile.
 */
export function PreviewPane({
  previewUrl,
  hasUnsavedChanges,
}: PreviewPaneProps): ReactNode {
  return (
    <section aria-label="Preview" className="flex h-full min-h-96 flex-col">
      <div className="mb-2 flex items-center justify-between text-sm">
        <h2 className="font-medium">Preview</h2>
        <span
          className={hasUnsavedChanges ? 'text-amber-700' : 'text-slate-500'}
        >
          {hasUnsavedChanges ? 'Showing the last saved version' : 'Up to date'}
        </span>
      </div>
      <iframe
        key={previewUrl}
        title="Course preview"
        src={previewUrl}
        sandbox="allow-scripts"
        className="min-h-96 w-full flex-1 rounded-md border border-slate-300 bg-white"
      />
    </section>
  );
}
