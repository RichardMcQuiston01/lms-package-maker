'use client';

import type { Page } from '@richardmcquiston01/lms-package-maker-model';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { findUnsupportedTags } from '../lib/visualEditor/support';
import { RichTextEditor, type RichTextEditorHandle } from './RichTextEditor';

type EditMode = 'visual' | 'html';

interface PagePanelProps {
  readonly projectId: string;
  readonly page: Page | null;
  /** Lets the editor insert text where the caret is in the HTML view. */
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Lets the editor insert HTML where the caret is in the visual view. */
  readonly richTextRef: RefObject<RichTextEditorHandle | null>;
  readonly onTitleChange: (title: string) => void;
  readonly onHtmlChange: (html: string) => void;
}

const MODE_BUTTON =
  'rounded border px-3 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600';

export function PagePanel({
  projectId,
  page,
  textareaRef,
  richTextRef,
  onTitleChange,
  onHtmlChange,
}: PagePanelProps): ReactNode {
  // The view chosen for each page; pages that use markup the visual editor
  // would remove start in the HTML view.
  const [chosen, setChosen] = useState<Readonly<Record<string, EditMode>>>({});
  // Bumped each time the visual view opens, so it loads the latest HTML.
  const [visualSession, setVisualSession] = useState<number>(0);
  const [confirming, setConfirming] = useState<boolean>(false);
  // The view a page opens in is decided once, from the HTML it loaded with.
  // Deciding again while typing would move the author between views.
  const opened = useRef<Record<string, EditMode>>({});

  if (page === null) {
    return (
      <p className="text-slate-500">Select a page in the outline to edit it.</p>
    );
  }
  const unsupported: string[] = findUnsupportedTags(page.html);
  opened.current[page.id] ??= unsupported.length > 0 ? 'html' : 'visual';
  const mode: EditMode = chosen[page.id] ?? opened.current[page.id] ?? 'visual';

  function choose(next: EditMode): void {
    if (page === null) {
      return;
    }
    setConfirming(false);
    if (next === 'visual') {
      setVisualSession((session: number): number => session + 1);
    }
    setChosen({ ...chosen, [page.id]: next });
  }

  function openVisual(): void {
    if (mode === 'visual') {
      return;
    }
    if (unsupported.length > 0) {
      setConfirming(true);
      return;
    }
    choose('visual');
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

      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-medium">Page content</span>
          <div role="group" aria-label="Editing view" className="flex gap-1">
            <button
              type="button"
              aria-pressed={mode === 'visual'}
              onClick={openVisual}
              className={`${MODE_BUTTON} ${mode === 'visual' ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-300 bg-white'}`}
            >
              Visual
            </button>
            <button
              type="button"
              aria-pressed={mode === 'html'}
              onClick={(): void => choose('html')}
              className={`${MODE_BUTTON} ${mode === 'html' ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-300 bg-white'}`}
            >
              HTML
            </button>
          </div>
        </div>

        {confirming && (
          <div
            role="alert"
            className="mb-2 space-y-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm"
          >
            <p>
              This page uses markup the visual editor cannot keep (
              {unsupported.map((tag: string): string => `<${tag}>`).join(', ')}
              ). If you edit it visually, that markup is removed.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={`${MODE_BUTTON} border-amber-600 bg-white`}
                onClick={(): void => choose('visual')}
              >
                Edit visually anyway
              </button>
              <button
                type="button"
                className={`${MODE_BUTTON} border-slate-300 bg-white`}
                onClick={(): void => setConfirming(false)}
              >
                Keep the HTML view
              </button>
            </div>
          </div>
        )}

        {mode === 'html' && unsupported.length > 0 && !confirming && (
          <p className="mb-2 text-xs text-slate-600">
            Opened in the HTML view because this page uses{' '}
            {unsupported.map((tag: string): string => `<${tag}>`).join(', ')},
            which the visual editor cannot keep.
          </p>
        )}

        {mode === 'visual' ? (
          <RichTextEditor
            key={`${page.id}:${visualSession}`}
            ref={richTextRef}
            projectId={projectId}
            html={page.html}
            onChange={onHtmlChange}
          />
        ) : (
          <label className="block">
            <span className="sr-only">Page content (HTML)</span>
            <textarea
              ref={textareaRef}
              value={page.html}
              onChange={(event): void => onHtmlChange(event.target.value)}
              rows={16}
              spellCheck={false}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
            />
          </label>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Headings, lists, links, images, audio, video and tables are kept.
        Scripts, forms, frames and event handlers are removed when you save.
      </p>
    </div>
  );
}
