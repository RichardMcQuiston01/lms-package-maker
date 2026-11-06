import type { MediaKind } from './types';

export interface SniffedMedia {
  readonly contentType: string;
  readonly extension: string;
  readonly kind: MediaKind;
}

function startsWith(
  bytes: Uint8Array,
  signature: readonly number[],
  offset = 0
): boolean {
  return signature.every(
    (value: number, index: number): boolean => bytes[offset + index] === value
  );
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

/** Allowed types, for messages shown to people. */
export const ALLOWED_MEDIA_DESCRIPTION =
  'PNG, JPEG, GIF, WebP images; MP3, WAV, OGG, M4A audio; MP4 and WebM video';

/**
 * Decides what a file really is from its first bytes. The name and the type
 * the browser sent are never trusted, because both are chosen by the sender.
 * SVG is deliberately not accepted: it can carry script.
 */
export function sniffMedia(bytes: Uint8Array): SniffedMedia | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: 'image/png', extension: 'png', kind: 'image' };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { contentType: 'image/jpeg', extension: 'jpg', kind: 'image' };
  }
  const head: string = ascii(bytes, 0, 6);
  if (head === 'GIF87a' || head === 'GIF89a') {
    return { contentType: 'image/gif', extension: 'gif', kind: 'image' };
  }
  if (ascii(bytes, 0, 4) === 'RIFF') {
    const form: string = ascii(bytes, 8, 4);
    if (form === 'WEBP') {
      return { contentType: 'image/webp', extension: 'webp', kind: 'image' };
    }
    if (form === 'WAVE') {
      return { contentType: 'audio/wav', extension: 'wav', kind: 'audio' };
    }
    return null;
  }
  if (ascii(bytes, 0, 4) === 'OggS') {
    return { contentType: 'audio/ogg', extension: 'ogg', kind: 'audio' };
  }
  if (
    ascii(bytes, 0, 3) === 'ID3' ||
    (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
  ) {
    return { contentType: 'audio/mpeg', extension: 'mp3', kind: 'audio' };
  }
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand: string = ascii(bytes, 8, 4);
    return brand === 'M4A '
      ? { contentType: 'audio/mp4', extension: 'm4a', kind: 'audio' }
      : { contentType: 'video/mp4', extension: 'mp4', kind: 'video' };
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { contentType: 'video/webm', extension: 'webm', kind: 'video' };
  }
  return null;
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

/** File extension for a stored content type. */
export function extensionFor(contentType: string): string {
  return EXTENSIONS[contentType] ?? 'bin';
}

const CONTROL_CHARACTERS: RegExp = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');
const MAX_FILE_NAME_LENGTH = 120;

/**
 * A file name that is safe to show and to put in a download header. It is for
 * display only; stored files are named by their id.
 */
export function cleanFileName(name: string): string {
  const lastSegment: string = name.split(/[\\/]/).pop() ?? '';
  const cleaned: string = lastSegment
    .replace(CONTROL_CHARACTERS, '')
    .replace(/["<>:*?|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '' || cleaned === '.' || cleaned === '..') {
    return 'upload';
  }
  return cleaned.length > MAX_FILE_NAME_LENGTH
    ? cleaned.slice(0, MAX_FILE_NAME_LENGTH)
    : cleaned;
}
