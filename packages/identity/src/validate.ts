import type { Identity, Result } from './types.js';

export const IDENTITY_LIMITS = {
  maxIdLength: 255,
  maxDisplayNameLength: 100,
  maxEmailLength: 254,
} as const;

const CONTROL_CHARACTERS: RegExp = new RegExp('[\\u0000-\\u001f\\u007f]');

/** True when text has no control characters (new lines, tabs, NUL and so on). */
export function hasNoControlCharacters(text: string): boolean {
  return !CONTROL_CHARACTERS.test(text);
}

/** Removes control characters and surrounding space. */
export function cleanText(text: string): string {
  return text.replace(new RegExp('[\\u0000-\\u001f\\u007f]', 'g'), '').trim();
}

/**
 * Checks an identity from any provider before the app trusts it. Every problem
 * is listed, with what was wrong, so a host can fix its provider quickly.
 */
export function validateIdentity(identity: Identity): Result<Identity> {
  const errors: string[] = [];
  if (typeof identity.id !== 'string' || identity.id === '') {
    errors.push('identity.id must be a non-empty string');
  } else {
    if (identity.id.length > IDENTITY_LIMITS.maxIdLength) {
      errors.push(
        `identity.id must be at most ${IDENTITY_LIMITS.maxIdLength} characters, got ${identity.id.length}`
      );
    }
    if (!hasNoControlCharacters(identity.id)) {
      errors.push('identity.id must not contain control characters');
    }
  }
  if (
    typeof identity.displayName !== 'string' ||
    identity.displayName.trim() === ''
  ) {
    errors.push('identity.displayName must be a non-empty string');
  } else if (
    identity.displayName.length > IDENTITY_LIMITS.maxDisplayNameLength
  ) {
    errors.push(
      `identity.displayName must be at most ${IDENTITY_LIMITS.maxDisplayNameLength} characters, got ${identity.displayName.length}`
    );
  }
  if (identity.email !== undefined) {
    if (
      typeof identity.email !== 'string' ||
      identity.email.length > IDENTITY_LIMITS.maxEmailLength ||
      !hasNoControlCharacters(identity.email)
    ) {
      errors.push(
        `identity.email must be text of at most ${IDENTITY_LIMITS.maxEmailLength} characters without control characters`
      );
    }
  }
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: identity };
}

/**
 * Compares two strings in time that depends only on their length, so a
 * secret cannot be guessed one character at a time. Portable: no Node APIs.
 */
export function constantTimeEqual(left: string, right: string): boolean {
  const length: number = Math.max(left.length, right.length);
  let difference: number = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
