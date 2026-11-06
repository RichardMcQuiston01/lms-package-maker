import { describe, expect, test } from 'bun:test';
import {
  hashPassword,
  validatePassword,
  verifyAgainstDummy,
  verifyPassword,
} from './password';

describe('passwords', () => {
  test('hash and verify round-trip, with a different hash each time', async () => {
    const first: string = await hashPassword('correct horse battery');
    const second: string = await hashPassword('correct horse battery');
    expect(first).not.toBe(second);
    expect(first.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(await verifyPassword('correct horse battery', first)).toBe(true);
    expect(await verifyPassword('wrong horse battery', first)).toBe(false);
  });

  test('never matches a malformed or hostile stored hash', async () => {
    for (const stored of [
      '',
      'plain-text-password',
      'bcrypt$12$abc$def',
      'scrypt$1$8$1$AAAA$AAAA',
      'scrypt$999999999$8$1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'scrypt$32768$8$1$AAAA$AA',
    ]) {
      expect(await verifyPassword('anything long enough', stored)).toBe(false);
    }
  });

  test('treats equivalent unicode spellings as the same password', async () => {
    const stored: string = await hashPassword('café-password');
    expect(await verifyPassword('café-password', stored)).toBe(true);
  });

  test('enforces length limits with descriptive messages', () => {
    expect(validatePassword('short')).toEqual({
      ok: false,
      errors: ['password must be at least 10 characters, got 5'],
    });
    const tooLong = validatePassword('x'.repeat(129));
    expect(tooLong.ok).toBe(false);
    expect(validatePassword('long enough password').ok).toBe(true);
  });

  test('the dummy check completes without throwing', async () => {
    await verifyAgainstDummy('whatever');
  });
});
