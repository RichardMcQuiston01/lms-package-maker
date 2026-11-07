import { describe, expect, test } from 'bun:test';
import {
  editorMediaUrl,
  findUnsupportedTags,
  normalizeEditorHtml,
} from './support';

describe('findUnsupportedTags', () => {
  test('accepts everything the visual editor can hold', () => {
    const html = `<h3>Title</h3><p>A <strong>b</strong> <em>c</em> <u>d</u> <a href="https://x.test">e</a> <code>f</code> <sub>1</sub><sup>2</sup><mark>m</mark><br></p>
<ul><li>one</li></ul><ol><li>two</li></ol><blockquote><p>q</p></blockquote><pre><code>x</code></pre><hr>
<table><colgroup><col></colgroup><thead><tr><th>h</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>
<p><img src="media:1" alt=""></p><audio src="media:2" controls></audio><video src="media:3" controls></video>`;
    expect(findUnsupportedTags(html)).toEqual([]);
  });

  test('lists what would be lost, once each and in sorted order', () => {
    expect(
      findUnsupportedTags(
        '<div><span>a</span><SPAN>b</SPAN></div><figure><figcaption>c</figcaption></figure><dl><dt>t</dt><dd>d</dd></dl>'
      )
    ).toEqual(['dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'span']);
  });

  test('ignores comments and plain text', () => {
    expect(findUnsupportedTags('<!-- <div> --><p>1 < 2 and 3 > 2</p>')).toEqual(
      []
    );
    expect(findUnsupportedTags('')).toEqual([]);
  });
});

describe('editorMediaUrl', () => {
  test('points uploaded files at the media route', () => {
    expect(editorMediaUrl('p-1', 'media:abc-123')).toBe(
      '/api/projects/p-1/media/abc-123'
    );
  });

  test('leaves other addresses alone and encodes odd ids', () => {
    expect(editorMediaUrl('p', 'https://x.test/a.png')).toBe(
      'https://x.test/a.png'
    );
    expect(editorMediaUrl('p', 'media:a/b')).toBe(
      '/api/projects/p/media/a%2Fb'
    );
  });
});

describe('normalizeEditorHtml', () => {
  test('stores an empty page as an empty string', () => {
    expect(normalizeEditorHtml('<p></p>', true)).toBe('');
    expect(normalizeEditorHtml('<p>x</p>', false)).toBe('<p>x</p>');
  });
});
