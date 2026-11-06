import { describe, expect, test } from 'bun:test';
import { createBuiltInIdentityProvider } from '../identity/builtIn';
import { createTestAuth } from '../testSupport';
import { signInHandler, signOutHandler, signUpHandler } from './authHandlers';
import { authenticateRequest } from './session';

function post(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const ACCOUNT = {
  email: 'ada@example.com',
  password: 'a long enough password',
  displayName: 'Ada',
};

function cookieOf(response: Response): string {
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

describe('auth handlers', () => {
  test('sign-up sets an HttpOnly cookie that authenticates later requests', async () => {
    const auth = createTestAuth();
    const response = await signUpHandler(
      auth.service,
      post('http://app.test/api/auth/sign-up', ACCOUNT)
    );
    expect(response.status).toBe(201);
    const header: string = response.headers.get('set-cookie') ?? '';
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    const body = (await response.json()) as {
      user: { email: string; passwordHash?: string };
    };
    expect(body.user.email).toBe('ada@example.com');
    expect(JSON.stringify(body)).not.toContain('passwordHash');

    const next = new Request('http://app.test/api/projects', {
      headers: { cookie: cookieOf(response) },
    });
    const who = await authenticateRequest(
      createBuiltInIdentityProvider(auth.service),
      next
    );
    expect(who.ok && who.user.displayName).toBe('Ada');
  });

  test('requests without a valid cookie get 401 with a helpful message', async () => {
    const auth = createTestAuth();
    for (const headers of [{}, { cookie: 'lpm_session=forged' }]) {
      const who = await authenticateRequest(
        createBuiltInIdentityProvider(auth.service),
        new Request('http://app.test/api/projects', { headers })
      );
      expect(who.ok).toBe(false);
      if (!who.ok) {
        expect(who.response.status).toBe(401);
        expect(
          ((await who.response.json()) as { error: string }).error
        ).toContain('sign in');
      }
    }
  });

  test('writes from another site are refused even with a valid cookie', async () => {
    const auth = createTestAuth();
    const signedUp = await signUpHandler(
      auth.service,
      post('http://app.test/api/auth/sign-up', ACCOUNT)
    );
    const forged = post(
      'http://app.test/api/projects',
      {},
      {
        cookie: cookieOf(signedUp),
        origin: 'http://evil.test',
        host: 'app.test',
      }
    );
    const who = await authenticateRequest(
      createBuiltInIdentityProvider(auth.service),
      forged
    );
    expect(who.ok).toBe(false);
    if (!who.ok) {
      expect(who.response.status).toBe(403);
    }
    const signOutForged = await signOutHandler(
      auth.service,
      post(
        'http://app.test/api/auth/sign-out',
        {},
        {
          cookie: cookieOf(signedUp),
          origin: 'http://evil.test',
          host: 'app.test',
        }
      )
    );
    expect(signOutForged.status).toBe(403);
  });

  test('sign-in answers 401 for bad credentials and 429 with Retry-After when locked out', async () => {
    const auth = createTestAuth();
    await signUpHandler(auth.service, post('http://app.test/x', ACCOUNT));
    const bad = { email: ACCOUNT.email, password: 'wrong password!' };
    const first = await signInHandler(
      auth.service,
      post('http://app.test/x', bad)
    );
    expect(first.status).toBe(401);
    expect(((await first.json()) as { error: string }).error).toBe(
      'Email or password is incorrect.'
    );
    await signInHandler(auth.service, post('http://app.test/x', bad));
    await signInHandler(auth.service, post('http://app.test/x', bad));
    const locked = await signInHandler(
      auth.service,
      post('http://app.test/x', bad)
    );
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  test('sign-up shows validation problems and the closed message', async () => {
    const auth = createTestAuth();
    const invalid = await signUpHandler(
      auth.service,
      post('http://app.test/x', { ...ACCOUNT, password: 'short' })
    );
    expect(invalid.status).toBe(400);
    await signUpHandler(auth.service, post('http://app.test/x', ACCOUNT));
    const closed = await signUpHandler(
      auth.service,
      post('http://app.test/x', { ...ACCOUNT, email: 'bob@example.com' })
    );
    expect(closed.status).toBe(403);
  });

  test('missing fields and broken JSON are explained', async () => {
    const auth = createTestAuth();
    const missing = await signInHandler(
      auth.service,
      post('http://app.test/x', { email: 'a@b.co' })
    );
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: string }).error).toContain(
      "'password'"
    );
    const broken = await signInHandler(
      auth.service,
      post('http://app.test/x', '{nope')
    );
    expect(((await broken.json()) as { error: string }).error).toContain(
      'valid JSON'
    );
  });

  test('sign-out ends the session and clears the cookie', async () => {
    const auth = createTestAuth();
    const signedUp = await signUpHandler(
      auth.service,
      post('http://app.test/x', ACCOUNT)
    );
    const cookie: string = cookieOf(signedUp);
    const out = await signOutHandler(
      auth.service,
      post('http://app.test/api/auth/sign-out', {}, { cookie })
    );
    expect(out.status).toBe(200);
    expect(out.headers.get('set-cookie')).toContain('lpm_session=;');
    const who = await authenticateRequest(
      createBuiltInIdentityProvider(auth.service),
      new Request('http://app.test/api/projects', { headers: { cookie } })
    );
    expect(who.ok).toBe(false);
  });
});
