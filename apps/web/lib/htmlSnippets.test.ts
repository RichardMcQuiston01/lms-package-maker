import { describe, expect, test } from 'bun:test';
import { formatFileSize, insertAt, mediaSnippet } from './htmlSnippets';

const ID = '0b6f2f4e-1111-4111-8111-aaaaaaaaaaaa';

describe('mediaSnippet', () => {
  test('writes an image with escaped alt text', () => {
    expect(mediaSnippet({ id: ID, kind: 'image' }, ' A "cat" & <dog> ')).toBe(
      `<img src="media:${ID}" alt="A &quot;cat&quot; &amp; &lt;dog&gt;">`
    );
    expect(mediaSnippet({ id: ID, kind: 'image' }, '')).toBe(
      `<img src="media:${ID}" alt="">`
    );
  });

  test('writes audio and video with controls', () => {
    expect(mediaSnippet({ id: ID, kind: 'audio' }, 'ignored')).toBe(
      `<audio src="media:${ID}" controls></audio>`
    );
    expect(mediaSnippet({ id: ID, kind: 'video' }, '')).toBe(
      `<video src="media:${ID}" controls></video>`
    );
  });
});

describe('insertAt', () => {
  test('inserts at the caret and replaces a selection', () => {
    expect(insertAt('abcdef', 3, 3, 'X')).toEqual({
      text: 'abcXdef',
      caret: 4,
    });
    expect(insertAt('abcdef', 1, 4, 'XY')).toEqual({ text: 'aXYef', caret: 3 });
  });

  test('clamps positions outside the text', () => {
    expect(insertAt('abc', 99, 120, 'X')).toEqual({ text: 'abcX', caret: 4 });
    expect(insertAt('abc', -5, -1, 'X')).toEqual({ text: 'Xabc', caret: 1 });
  });
});

describe('formatFileSize', () => {
  test('uses B, KB and MB', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
