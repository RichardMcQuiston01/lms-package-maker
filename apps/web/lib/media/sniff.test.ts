import { describe, expect, test } from 'bun:test';
import { bytesStartingWith, TINY_PNG } from './fixtures';
import { cleanFileName, extensionFor, sniffMedia } from './sniff';

describe('sniffMedia', () => {
  test('recognises each allowed type from its first bytes', () => {
    const cases: [string, Uint8Array][] = [
      ['image/png', TINY_PNG],
      ['image/jpeg', bytesStartingWith([0xff, 0xd8, 0xff, 0xe0])],
      ['image/gif', bytesStartingWith(['GIF89a'])],
      ['image/webp', bytesStartingWith(['RIFF', 0, 0, 0, 0, 'WEBP'])],
      ['audio/wav', bytesStartingWith(['RIFF', 0, 0, 0, 0, 'WAVE'])],
      ['audio/ogg', bytesStartingWith(['OggS'])],
      ['audio/mpeg', bytesStartingWith(['ID3'])],
      ['audio/mpeg', bytesStartingWith([0xff, 0xfb, 0x90])],
      ['audio/mp4', bytesStartingWith([0, 0, 0, 0x20, 'ftypM4A '])],
      ['video/mp4', bytesStartingWith([0, 0, 0, 0x20, 'ftypisom'])],
      ['video/webm', bytesStartingWith([0x1a, 0x45, 0xdf, 0xa3])],
    ];
    for (const [contentType, bytes] of cases) {
      expect(sniffMedia(bytes)?.contentType).toBe(contentType);
    }
  });

  test('refuses files that can carry script or are not media', () => {
    const refused: Uint8Array[] = [
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
      ),
      new TextEncoder().encode('<!doctype html><script>alert(1)</script>'),
      new TextEncoder().encode('plain text pretending to be a png'),
      bytesStartingWith(['MZ']),
      bytesStartingWith(['RIFF', 0, 0, 0, 0, 'AVI ']),
      new Uint8Array(),
    ];
    for (const bytes of refused) {
      expect(sniffMedia(bytes)).toBeNull();
    }
  });

  test('maps content types back to extensions', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('video/mp4')).toBe('mp4');
    expect(extensionFor('text/html')).toBe('bin');
  });
});

describe('cleanFileName', () => {
  test('keeps only the last path segment and strips risky characters', () => {
    expect(cleanFileName('C:\\Users\\me\\photo.png')).toBe('photo.png');
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('a"b<c>:d*e?.png')).toBe('a_b_c__d_e_.png');
    expect(cleanFileName('line\nbreak\u0000.png')).toBe('linebreak.png');
    expect(cleanFileName('  many    spaces.png ')).toBe('many spaces.png');
  });

  test('falls back to a plain name and limits the length', () => {
    expect(cleanFileName('')).toBe('upload');
    expect(cleanFileName('..')).toBe('upload');
    expect(cleanFileName('a'.repeat(500)).length).toBe(120);
  });
});
