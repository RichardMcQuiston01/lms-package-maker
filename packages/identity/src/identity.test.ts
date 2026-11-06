import { describe, expect, test } from 'bun:test';
import {
  constantTimeEqual,
  createSingleUserIdentityProvider,
  createTrustedHeaderIdentityProvider,
  validateIdentity,
  type IdentityProvider,
  type TrustedHeaderOptions,
} from './index.js';

const SECRET = 'a-shared-secret-of-enough-length';

const options: TrustedHeaderOptions = {
  userHeader: 'x-forwarded-user',
  nameHeader: 'x-forwarded-name',
  emailHeader: 'x-forwarded-email',
  secretHeader: 'x-proxy-secret',
  secret: SECRET,
};

function provider(
  overrides: Partial<TrustedHeaderOptions> = {}
): IdentityProvider {
  const created = createTrustedHeaderIdentityProvider({
    ...options,
    ...overrides,
  });
  if (!created.ok) throw new Error(created.errors.join('; '));
  return created.value;
}

function request(headers: Record<string, string>): { headers: Headers } {
  return { headers: new Headers(headers) };
}

describe('validateIdentity', () => {
  test('accepts a normal identity', () => {
    expect(
      validateIdentity({
        id: 'u1',
        displayName: 'Ada',
        email: 'ada@example.com',
      }).ok
    ).toBe(true);
  });

  test('lists every problem', () => {
    const result = validateIdentity({
      id: 'a\nb',
      displayName: ' ',
      email: 'x'.repeat(300),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(3);
      expect(result.errors.join('\n')).toContain('control characters');
    }
    expect(validateIdentity({ id: '', displayName: 'A' }).ok).toBe(false);
    expect(validateIdentity({ id: 'x'.repeat(256), displayName: 'A' }).ok).toBe(
      false
    );
  });
});

describe('constantTimeEqual', () => {
  test('is true only for identical strings of the same length', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(constantTimeEqual('', 'a')).toBe(false);
  });
});

describe('trusted header provider', () => {
  test('refuses weak or invalid settings with every reason', () => {
    const bad = createTrustedHeaderIdentityProvider({
      ...options,
      secret: 'short',
      userHeader: 'bad header',
      nameHeader: 'x y',
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      const text: string = bad.errors.join('\n');
      expect(text).toContain(
        "userHeader 'bad header' is not a valid HTTP header name"
      );
      expect(text).toContain("nameHeader 'x y'");
      expect(text).toContain('secret must be at least 16 characters, got 5');
    }
  });

  test('signs a person in when the proxy secret and user header are present', async () => {
    const result = await provider().identify(
      request({
        'x-proxy-secret': SECRET,
        'x-forwarded-user': 'ada@example.com',
        'x-forwarded-name': 'Ada Lovelace',
        'x-forwarded-email': 'ada@example.com',
      })
    );
    expect(result).toEqual({
      ok: true,
      value: {
        id: 'header:ada@example.com',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    });
  });

  test('falls back to the id as the name and works without optional headers', async () => {
    const result = await provider().identify(
      request({ 'x-proxy-secret': SECRET, 'x-forwarded-user': 'u-17' })
    );
    expect(result).toEqual({
      ok: true,
      value: { id: 'header:u-17', displayName: 'u-17' },
    });
  });

  test('treats a forged request as signed out: no secret, wrong secret, or no user', async () => {
    const forged = provider();
    for (const headers of [
      { 'x-forwarded-user': 'admin' },
      {
        'x-proxy-secret': 'wrong-secret-of-the-same-len!',
        'x-forwarded-user': 'admin',
      },
      { 'x-proxy-secret': SECRET.slice(0, -1), 'x-forwarded-user': 'admin' },
      { 'x-proxy-secret': SECRET },
      { 'x-proxy-secret': SECRET, 'x-forwarded-user': '   ' },
    ]) {
      expect(await forged.identify(request(headers))).toEqual({
        ok: true,
        value: null,
      });
    }
  });

  test('reports an unusable id instead of guessing', async () => {
    const result = await provider().identify(
      request({ 'x-proxy-secret': SECRET, 'x-forwarded-user': 'x'.repeat(300) })
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors[0]).toContain(
        "'x-forwarded-user' header is not a usable id"
      );
  });

  test('keeps ids from different providers apart with a prefix, and shortens long names', async () => {
    const result = await provider({ idPrefix: 'sso' }).identify(
      request({
        'x-proxy-secret': SECRET,
        'x-forwarded-user': 'u1',
        'x-forwarded-name': 'N'.repeat(500),
      })
    );
    expect(result.ok && result.value?.id).toBe('sso:u1');
    expect(result.ok && result.value?.displayName.length).toBe(100);
  });

  test('carries the sign-in and sign-out addresses', () => {
    const configured = provider({
      signInUrl: 'https://login.example.com',
      signOutUrl: '/oauth2/sign_out',
    });
    expect(configured.signInUrl).toBe('https://login.example.com');
    expect(configured.signOutUrl).toBe('/oauth2/sign_out');
    expect(provider().signInUrl).toBeNull();
  });
});

describe('single-user provider', () => {
  test('always answers with the same person', async () => {
    const single = createSingleUserIdentityProvider({ displayName: 'Me' });
    const first = await single.identify(request({}));
    const second = await single.identify(
      request({ 'x-forwarded-user': 'someone else' })
    );
    expect(first).toEqual({
      ok: true,
      value: { id: 'single:local', displayName: 'Me' },
    });
    expect(second).toEqual(first);
    expect(single.signInUrl).toBeNull();
  });
});
