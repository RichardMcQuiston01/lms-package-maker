import { describe, expect, test } from 'bun:test';
import {
  createSingleUserIdentityProvider,
  type IdentityProvider,
  type IdentityResult,
} from '@richardmcquiston01/lms-package-maker-identity';
import { authenticateRequest } from './session';

function providerReturning(
  result: () => Promise<IdentityResult> | IdentityResult,
  signInUrl: string | null = null
): IdentityProvider {
  return {
    name: 'test-host',
    signInUrl,
    signOutUrl: null,
    identify: async () => result(),
  };
}

const get = (): Request => new Request('http://app.test/api/projects');

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('authenticateRequest with any identity provider', () => {
  test('accepts the person a provider names', async () => {
    const result = await authenticateRequest(
      providerReturning(() => ({
        ok: true,
        value: { id: 'host:7', displayName: 'Ada' },
      })),
      get()
    );
    expect(result).toEqual({
      ok: true,
      user: { id: 'host:7', displayName: 'Ada' },
    });
  });

  test('works with the single-user provider', async () => {
    const result = await authenticateRequest(
      createSingleUserIdentityProvider(),
      get()
    );
    expect(result.ok && result.user.id).toBe('single:local');
  });

  test('nobody signed in gives 401 that says where to sign in', async () => {
    const result = await authenticateRequest(
      providerReturning(
        () => ({ ok: true, value: null }),
        'https://login.example.com'
      ),
      get()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await body(result.response)).toMatchObject({
        error: 'You need to sign in to do this.',
        signInUrl: 'https://login.example.com',
      });
    }
  });

  test('a provider that cannot tell is a 401 naming the provider and the reason', async () => {
    const result = await authenticateRequest(
      providerReturning(() => ({ ok: false, errors: ['directory is down'] })),
      get()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect((await body(result.response))['error'] as string).toContain(
        "'test-host' identity provider could not tell who you are: directory is down"
      );
    }
  });

  test('a provider that throws does not crash the request', async () => {
    const result = await authenticateRequest(
      providerReturning(() => {
        throw new Error('boom');
      }),
      get()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect((await body(result.response))['error'] as string).toContain(
        'failed: boom'
      );
    }
  });

  test('refuses an identity the app cannot use, listing why', async () => {
    const result = await authenticateRequest(
      providerReturning(() => ({
        ok: true,
        value: { id: 'line\nbreak', displayName: '' },
      })),
      get()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const details = (await body(result.response))['details'] as string[];
      expect(details.join(' ')).toContain('control characters');
      expect(details.join(' ')).toContain('displayName');
    }
  });

  test('refuses writes from another site whatever the provider says', async () => {
    const result = await authenticateRequest(
      createSingleUserIdentityProvider(),
      new Request('http://app.test/api/projects', {
        method: 'POST',
        headers: { origin: 'http://evil.test', host: 'app.test' },
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});
