import { describe, expect, test } from 'bun:test';
import {
  clientAddress,
  isSameOriginRequest,
  isSecureRequest,
  readSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from './http';

function post(headers: Record<string, string>): Request {
  return new Request('http://app.test/api/projects', {
    method: 'POST',
    headers,
  });
}

describe('session cookie', () => {
  test('is HttpOnly and SameSite=Lax, and Secure only over HTTPS', () => {
    const expires = new Date('2030-01-01T00:00:00Z');
    const plain: string = serializeSessionCookie('tok', expires, false);
    expect(plain).toContain('HttpOnly');
    expect(plain).toContain('SameSite=Lax');
    expect(plain).toContain('Path=/');
    expect(plain).not.toContain('Secure');
    expect(serializeSessionCookie('tok', expires, true)).toContain('Secure');
    expect(serializeClearedSessionCookie(false)).toContain('lpm_session=;');
  });

  test('is found among other cookies and ignored when empty', () => {
    expect(readSessionToken('a=1; lpm_session=abc; b=2')).toBe('abc');
    expect(readSessionToken('a=1')).toBeNull();
    expect(readSessionToken('lpm_session=')).toBeNull();
    expect(readSessionToken(null)).toBeNull();
  });

  test('knows when the request was secure, also behind a proxy', () => {
    expect(isSecureRequest(new Request('https://app.test/'))).toBe(true);
    expect(isSecureRequest(new Request('http://app.test/'))).toBe(false);
    expect(
      isSecureRequest(
        new Request('http://app.test/', {
          headers: { 'x-forwarded-proto': 'https' },
        })
      )
    ).toBe(true);
  });
});

describe('same-origin check', () => {
  test('allows reads, scripts without browser headers, and the same host', () => {
    expect(
      isSameOriginRequest(
        new Request('http://app.test/', {
          headers: { origin: 'http://evil.test' },
        })
      )
    ).toBe(true);
    expect(isSameOriginRequest(post({}))).toBe(true);
    expect(
      isSameOriginRequest(post({ origin: 'http://app.test', host: 'app.test' }))
    ).toBe(true);
  });

  test('refuses writes from another site', () => {
    expect(
      isSameOriginRequest(
        post({ origin: 'http://evil.test', host: 'app.test' })
      )
    ).toBe(false);
    expect(isSameOriginRequest(post({ 'sec-fetch-site': 'cross-site' }))).toBe(
      false
    );
    expect(
      isSameOriginRequest(post({ origin: 'not a url', host: 'app.test' }))
    ).toBe(false);
  });

  test('uses the forwarded host behind a proxy', () => {
    expect(
      isSameOriginRequest(
        post({
          origin: 'https://public.test',
          host: 'internal:3000',
          'x-forwarded-host': 'public.test',
        })
      )
    ).toBe(true);
  });
});

describe('clientAddress', () => {
  test('takes the first forwarded address, or unknown', () => {
    expect(
      clientAddress(
        new Request('http://a/', {
          headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
        })
      )
    ).toBe('1.2.3.4');
    expect(clientAddress(new Request('http://a/'))).toBe('unknown');
  });
});
