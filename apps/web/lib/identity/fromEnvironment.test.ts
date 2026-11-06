import { describe, expect, test } from 'bun:test';
import { createTestAuth } from '../testSupport';
import {
  createIdentitySetup,
  type IdentitySetupResult,
} from './fromEnvironment';

function setup(env: Record<string, string | undefined>): IdentitySetupResult {
  return createIdentitySetup(env, () => createTestAuth().service);
}

function unwrapErrors(result: IdentitySetupResult): string {
  return result.ok ? '' : result.errors.join(' ');
}

describe('createIdentitySetup', () => {
  test('uses the built-in accounts by default', () => {
    for (const env of [
      {},
      { IDENTITY_PROVIDER: '' },
      { IDENTITY_PROVIDER: 'builtin' },
    ]) {
      const result = setup(env);
      expect(result.ok && result.value.identity.name).toBe('builtin');
      expect(result.ok && result.value.accounts !== null).toBe(true);
      expect(result.ok && result.value.identity.signInUrl).toBe('/sign-in');
    }
  });

  test('header mode needs a proxy secret and says why', () => {
    expect(unwrapErrors(setup({ IDENTITY_PROVIDER: 'header' }))).toContain(
      'needs IDENTITY_PROXY_SECRET'
    );
    expect(
      unwrapErrors(
        setup({ IDENTITY_PROVIDER: 'header', IDENTITY_PROXY_SECRET: 'short' })
      )
    ).toContain('at least 16 characters');
  });

  test('header mode reads its settings and turns the built-in screens off', async () => {
    const result = setup({
      IDENTITY_PROVIDER: 'header',
      IDENTITY_PROXY_SECRET: 'a-shared-secret-of-enough-length',
      IDENTITY_SIGN_IN_URL: 'https://login.example.com',
      IDENTITY_SIGN_OUT_URL: '/oauth2/sign_out',
      IDENTITY_USER_HEADER: 'x-user',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.accounts).toBeNull();
    expect(result.value.identity.signInUrl).toBe('https://login.example.com');
    expect(result.value.identity.signOutUrl).toBe('/oauth2/sign_out');
    const identified = await result.value.identity.identify({
      headers: new Headers({
        'x-identity-proxy-secret': 'a-shared-secret-of-enough-length',
        'x-user': 'ada',
      }),
    });
    expect(identified).toEqual({
      ok: true,
      value: { id: 'header:ada', displayName: 'ada' },
    });
  });

  test('header mode does not build the accounts service', () => {
    let built = false;
    createIdentitySetup(
      {
        IDENTITY_PROVIDER: 'header',
        IDENTITY_PROXY_SECRET: 'a-shared-secret-of-enough-length',
      },
      () => {
        built = true;
        return createTestAuth().service;
      }
    );
    expect(built).toBe(false);
  });

  test('single-user mode works locally but must be acknowledged in production', async () => {
    const local = setup({
      IDENTITY_PROVIDER: 'single-user',
      SINGLE_USER_NAME: 'Me',
    });
    expect(local.ok && local.value.accounts).toBeNull();
    const who = local.ok
      ? await local.value.identity.identify({ headers: new Headers() })
      : null;
    expect(who).toEqual({
      ok: true,
      value: { id: 'single:local', displayName: 'Me' },
    });

    const production = setup({
      IDENTITY_PROVIDER: 'single-user',
      NODE_ENV: 'production',
    });
    expect(unwrapErrors(production)).toContain(
      'IDENTITY_SINGLE_USER_ACKNOWLEDGED=true'
    );
    expect(
      setup({
        IDENTITY_PROVIDER: 'single-user',
        NODE_ENV: 'production',
        IDENTITY_SINGLE_USER_ACKNOWLEDGED: 'true',
      }).ok
    ).toBe(true);
  });

  test('an unknown provider is named with the valid choices', () => {
    const message: string = unwrapErrors(setup({ IDENTITY_PROVIDER: 'ldap' }));
    expect(message).toContain("'ldap' is not known");
    expect(message).toContain('builtin, header, single-user');
  });
});
