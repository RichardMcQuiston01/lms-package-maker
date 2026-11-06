import { describe, expect, test } from 'bun:test';
import { sanitizePageHtml } from './sanitize';

describe('sanitizePageHtml', () => {
  test('keeps ordinary formatting', () => {
    expect(sanitizePageHtml('<p>Hello <strong>there</strong></p>')).toBe(
      '<p>Hello <strong>there</strong></p>'
    );
  });

  test('removes scripts, event handlers and javascript links', () => {
    const dirty =
      '<p onclick="steal()">hi</p><script>alert(1)</script>' +
      '<a href="javascript:alert(1)">x</a><img src="x" onerror="alert(1)">';
    const clean: string = sanitizePageHtml(dirty);
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('javascript:');
  });

  test('drops iframes, forms and style blocks', () => {
    const clean: string = sanitizePageHtml(
      '<iframe src="https://evil.test"></iframe><form action="/x"><input></form><style>p{}</style>ok'
    );
    expect(clean).toBe('ok');
  });

  test('forces safe link attributes', () => {
    const clean: string = sanitizePageHtml(
      '<a href="https://example.com">x</a>'
    );
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_blank"');
  });

  test('allows data images but not data links', () => {
    expect(
      sanitizePageHtml('<img src="data:image/png;base64,AAAA" alt="a">')
    ).toContain('data:image/png');
    expect(
      sanitizePageHtml('<a href="data:text/html,<b>x</b>">x</a>')
    ).not.toContain('data:');
  });
});
