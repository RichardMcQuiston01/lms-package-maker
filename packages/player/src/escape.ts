const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for use in HTML content or a quoted attribute. */
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char: string): string => HTML_ESCAPES[char] ?? char
  );
}

/** Turns any text into a valid XML NCName fragment (letters, digits, `_-.`). */
export function toIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_');
}

const LINE_SEPARATOR: RegExp = new RegExp('\\u2028', 'g');
const PARAGRAPH_SEPARATOR: RegExp = new RegExp('\\u2029', 'g');

/** Serialises data for a `<script type="application/json">` block. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(LINE_SEPARATOR, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR, '\\u2029');
}
