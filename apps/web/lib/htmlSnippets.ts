import type { MediaJson } from './api/mediaHandlers';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

function escapeAttribute(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (char: string): string => ESCAPES[char] ?? char
  );
}

/**
 * The HTML to put in a page for an uploaded file. Images carry the alt text
 * the author typed (empty means "decorative"); audio and video always show
 * their player controls.
 */
export function mediaSnippet(
  media: Pick<MediaJson, 'id' | 'kind'>,
  altText: string
): string {
  switch (media.kind) {
    case 'image':
      return `<img src="media:${media.id}" alt="${escapeAttribute(altText.trim())}">`;
    case 'audio':
      return `<audio src="media:${media.id}" controls></audio>`;
    case 'video':
      return `<video src="media:${media.id}" controls></video>`;
  }
}

/** Puts text into a string in place of the selected part. */
export function insertAt(
  text: string,
  start: number,
  end: number,
  insertion: string
): { text: string; caret: number } {
  const from: number = Math.max(0, Math.min(start, text.length));
  const to: number = Math.max(from, Math.min(end, text.length));
  return {
    text: text.slice(0, from) + insertion + text.slice(to),
    caret: from + insertion.length,
  };
}

/** A file size for people, such as "1.4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
