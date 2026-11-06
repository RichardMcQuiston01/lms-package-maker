'use client';

import type { Page } from '@richardmcquiston01/lms-package-maker-model';
import type { ReactNode, RefObject } from 'react';

interface PagePanelProps {
  readonly page: Page | null;
  /** Lets the editor insert text where the caret is. */
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
  readonly onTitleChange: (title: string) => void;
  readonly onHtmlChange: (html: string) => void;
}

export function PagePanel({
  page,
  textareaRef,
  onTitleChange,
  onHtmlChange,
}: PagePanelProps): ReactNode {
  if (page === null) {
    return (
      <p className="text-slate-500">Select a page in the outline to edit it.</p>
    );
  }
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium">Page title</span>
        <input
          value={page.title}
          onChange={(event): void => onTitleChange(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Page content (HTML)</span>
        <textarea
          ref={textareaRef}
          value={page.html}
          onChange={(event): void => onHtmlChange(event.target.value)}
          rows={16}
          spellCheck={false}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
        />
      </label>
      <p className="text-xs text-slate-500">
        Paragraphs, headings (h3 to h6), lists, links, images and tables are
        kept. Scripts, forms, frames and event handlers are removed when you
        save.
      </p>
    </div>
  );
}
