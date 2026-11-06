import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS: string[] = [
  'a',
  'abbr',
  'audio',
  'b',
  'blockquote',
  'br',
  'caption',
  'cite',
  'code',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
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
  'small',
  'source',
  'span',
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
];

/**
 * Cleans author-supplied page HTML. The exported player inserts page HTML
 * as-is, so anything that could run script is removed here, on the server,
 * before it is stored.
 *
 * Page titles are rendered as `<h2>`, so headings start at `<h3>`.
 *
 * Uploaded media is referenced as `src="media:<id>"`; export swaps the
 * reference for the file's path inside the package.
 */
export function sanitizePageHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      audio: ['src', 'controls', 'preload', 'title'],
      video: ['src', 'controls', 'preload', 'title', 'width', 'height'],
      source: ['src', 'type'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
      '*': ['lang'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    // Audio and video may only use files uploaded to the course (`media:<id>`),
    // so a package never depends on a server that might disappear.
    allowedSchemesByTag: {
      img: ['http', 'https', 'data', 'media'],
      audio: ['media'],
      video: ['media'],
      source: ['media'],
    },
    allowProtocolRelative: false,
    transformTags: {
      audio: sanitizeHtml.simpleTransform('audio', {
        controls: 'controls',
        preload: 'metadata',
      }),
      video: sanitizeHtml.simpleTransform('video', {
        controls: 'controls',
        preload: 'metadata',
      }),
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
  });
}
