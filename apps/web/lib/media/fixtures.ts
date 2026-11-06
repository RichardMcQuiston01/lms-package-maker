/** A real 1x1 PNG, for tests. */
export const TINY_PNG: Uint8Array = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  )
);

/** Builds bytes that start with the given text and numbers, padded to a length. */
export function bytesStartingWith(
  prefix: readonly (string | number)[],
  length = 64
): Uint8Array {
  const bytes: number[] = [];
  for (const part of prefix) {
    if (typeof part === 'number') {
      bytes.push(part);
    } else {
      for (const char of part) bytes.push(char.charCodeAt(0));
    }
  }
  while (bytes.length < length) bytes.push(0);
  return new Uint8Array(bytes);
}
