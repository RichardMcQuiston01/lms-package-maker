import { describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { zipPackage } from './zip';

const encoder: TextEncoder = new TextEncoder();

describe('zipPackage', () => {
  test('round-trips files', () => {
    const result = zipPackage(
      new Map([['index.html', encoder.encode('<p>x</p>')]])
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const files = unzipSync(result.value);
      expect(new TextDecoder().decode(files['index.html'])).toBe('<p>x</p>');
    }
  });

  test('is deterministic regardless of insertion order', () => {
    const a = zipPackage(
      new Map([
        ['a.txt', encoder.encode('1')],
        ['b.txt', encoder.encode('2')],
      ])
    );
    const b = zipPackage(
      new Map([
        ['b.txt', encoder.encode('2')],
        ['a.txt', encoder.encode('1')],
      ])
    );
    expect(a).toEqual(b);
  });

  test('rejects path traversal with a descriptive error', () => {
    const result = zipPackage(new Map([['../evil', encoder.encode('x')]]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("'../evil'");
    }
  });
});
