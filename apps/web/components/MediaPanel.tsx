'use client';

import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { MediaJson } from '../lib/api/mediaHandlers';
import { deleteMediaRequest, uploadMediaRequest } from '../lib/apiClient';
import { formatFileSize, mediaSnippet } from '../lib/htmlSnippets';

interface MediaPanelProps {
  readonly projectId: string;
  readonly initialMedia: readonly MediaJson[];
  /** Puts HTML into the page being edited. */
  readonly onInsert: (html: string) => void;
}

const ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,audio/mpeg,audio/wav,audio/ogg,audio/mp4,video/mp4,video/webm';

export function MediaPanel({
  projectId,
  initialMedia,
  onInsert,
}: MediaPanelProps): ReactNode {
  const [media, setMedia] = useState<readonly MediaJson[]>(initialMedia);
  const [busy, setBusy] = useState<boolean>(false);
  const [problems, setProblems] = useState<readonly string[]>([]);
  const [altText, setAltText] = useState<string>('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFiles(
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const files: File[] = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    setProblems([]);
    const failures: string[] = [];
    for (const file of files) {
      const uploaded = await uploadMediaRequest(projectId, file);
      if (uploaded.ok) {
        setMedia((current): readonly MediaJson[] => [
          uploaded.value,
          ...current,
        ]);
      } else {
        failures.push(...uploaded.errors);
      }
    }
    setProblems(failures);
    setBusy(false);
  }

  async function handleDelete(mediaId: string): Promise<void> {
    setConfirmingId(null);
    const removed = await deleteMediaRequest(projectId, mediaId);
    if (removed.ok) {
      setMedia((current): readonly MediaJson[] =>
        current.filter((entry): boolean => entry.id !== mediaId)
      );
      setProblems([]);
    } else {
      setProblems(removed.errors);
    }
  }

  return (
    <section aria-label="Media" className="mt-6 border-t border-slate-200 pt-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide opacity-70">
        Media
      </h2>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={(event): void => void handleFiles(event)}
        className="sr-only"
        aria-label="Choose files to upload"
      />
      <button
        type="button"
        disabled={busy}
        onClick={(): void => fileInput.current?.click()}
        className="mt-2 w-full rounded border border-dashed border-slate-400 px-2 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
      >
        {busy ? 'Uploading…' : '+ Upload images, audio or video'}
      </button>
      <label className="mt-2 block text-xs">
        <span className="text-slate-600">
          Description for the next image you insert
        </span>
        <input
          value={altText}
          onChange={(event): void => setAltText(event.target.value)}
          placeholder="What the image shows"
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
        />
      </label>
      {problems.length > 0 && (
        <ul
          role="alert"
          className="mt-2 space-y-1 rounded bg-red-50 p-2 text-xs text-red-800"
        >
          {problems.map((problem: string) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {media.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          No files yet. Up to 25 MB each.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {media.map((entry: MediaJson) => (
            <li
              key={entry.id}
              className="rounded border border-slate-200 bg-white p-2 text-sm"
            >
              <div className="flex items-center gap-2">
                {entry.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.url}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-100 text-xs"
                  >
                    {entry.kind === 'audio' ? 'Audio' : 'Video'}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate" title={entry.fileName}>
                    {entry.fileName}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatFileSize(entry.byteSize)}
                  </span>
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={(): void => onInsert(mediaSnippet(entry, altText))}
                  aria-label={`Insert ${entry.fileName} into the page`}
                  className="text-blue-700 hover:underline"
                >
                  Insert
                </button>
                {confirmingId === entry.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(): void => void handleDelete(entry.id)}
                      aria-label={`Confirm deleting ${entry.fileName}`}
                      className="text-red-700 hover:underline"
                    >
                      Delete for good
                    </button>
                    <button
                      type="button"
                      onClick={(): void => setConfirmingId(null)}
                      className="hover:underline"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(): void => setConfirmingId(entry.id)}
                    aria-label={`Delete ${entry.fileName}`}
                    className="text-slate-600 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
