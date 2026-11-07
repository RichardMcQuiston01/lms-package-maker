/**
 * Which page HTML the visual editor can hold without losing anything.
 * The visual editor only knows these tags; HTML typed in the HTML view may use
 * more of what the server keeps (see `sanitize.ts`), and opening such a page
 * visually and editing it would drop the rest.
 */
const VISUAL_TAGS: ReadonlySet<string> = new Set([
  'a',
  'audio',
  'b',
  'blockquote',
  'br',
  'code',
  // Written by the table editor for column widths; the server drops them.
  'col',
  'colgroup',
  'em',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
  'video',
]);

const TAG_PATTERN = /<\/?([A-Za-z][A-Za-z0-9-]*)/g;
const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

/** The tag names in `html` that the visual editor cannot keep, sorted. */
export function findUnsupportedTags(html: string): string[] {
  const found: Set<string> = new Set();
  for (const match of html.replace(COMMENT_PATTERN, '').matchAll(TAG_PATTERN)) {
    const name: string = (match[1] ?? '').toLowerCase();
    if (!VISUAL_TAGS.has(name)) {
      found.add(name);
    }
  }
  return [...found].sort();
}

const MEDIA_PREFIX = 'media:';

/**
 * The address a browser can load for an image or player `src`. Uploaded files
 * are stored as `media:<id>`; while editing they are served by the app.
 */
export function editorMediaUrl(projectId: string, src: string): string {
  return src.startsWith(MEDIA_PREFIX)
    ? `/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(src.slice(MEDIA_PREFIX.length))}`
    : src;
}

/** `<p></p>` is what an empty editor reports; pages store an empty string. */
export function normalizeEditorHtml(html: string, isEmpty: boolean): string {
  return isEmpty ? '' : html;
}
