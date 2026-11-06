import { describe, expect, test } from 'bun:test';
import {
  generateSessionToken,
  hashToken,
  signPreviewToken,
  verifyPreviewToken,
} from './tokens';

const SECRET = 'a-test-secret-that-is-at-least-32-characters';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

describe('session tokens', () => {
  test('are long, unique and stored only as a hash', () => {
    const token: string = generateSessionToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(generateSessionToken()).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('preview tokens', () => {
  const now = 1_000_000;

  test('verify for the project and user they were signed for', () => {
    const token: string = signPreviewToken(SECRET, PROJECT, USER, now);
    expect(verifyPreviewToken(SECRET, PROJECT, token, now + 1000)).toEqual({
      ok: true,
      value: { userId: USER },
    });
  });

  test('fail for another project, another secret or a changed user', () => {
    const token: string = signPreviewToken(SECRET, PROJECT, USER, now);
    expect(
      verifyPreviewToken(
        SECRET,
        '33333333-3333-4333-8333-333333333333',
        token,
        now
      ).ok
    ).toBe(false);
    expect(
      verifyPreviewToken(
        'different-secret-that-is-long-enough-1234',
        PROJECT,
        token,
        now
      ).ok
    ).toBe(false);
    const parts: string[] = token.split('.');
    const swapped = [
      parts[0],
      '44444444-4444-4444-8444-444444444444',
      parts[2],
    ].join('.');
    expect(verifyPreviewToken(SECRET, PROJECT, swapped, now).ok).toBe(false);
  });

  test('expire after fifteen minutes with a message that says so', () => {
    const token: string = signPreviewToken(SECRET, PROJECT, USER, now);
    const result = verifyPreviewToken(
      SECRET,
      PROJECT,
      token,
      now + 16 * 60 * 1000
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('expired');
    }
  });

  test('reject garbage without throwing', () => {
    for (const garbage of ['', 'a.b', 'x.y.z', '1.2.3.4']) {
      expect(verifyPreviewToken(SECRET, PROJECT, garbage, now).ok).toBe(false);
    }
  });
});
