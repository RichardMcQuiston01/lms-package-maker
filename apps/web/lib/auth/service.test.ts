import { describe, expect, test } from 'bun:test';
import { createTestAuth } from '../testSupport';
import { SESSION_LIFETIME_MS } from './service';

const NEW_ACCOUNT = {
  email: 'Ada@Example.com ',
  password: 'a long enough password',
  displayName: ' Ada ',
};

describe('sign-up', () => {
  test('creates the first account, normalises it and starts a session', async () => {
    const auth = createTestAuth();
    const result = await auth.service.signUp(NEW_ACCOUNT, '1.1.1.1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.user.email).toBe('ada@example.com');
      expect(result.value.user.displayName).toBe('Ada');
      expect(
        result.value.expiresAt.getTime() - Date.parse('2030-01-01T00:00:00Z')
      ).toBe(SESSION_LIFETIME_MS);
      expect(await auth.service.authenticate(result.value.token)).toEqual(
        result.value.user
      );
    }
    expect(auth.repository.claimed.length).toBe(1);
  });

  test('closes after the first account unless sign-up is allowed', async () => {
    const closed = createTestAuth();
    await closed.service.signUp(NEW_ACCOUNT, '1.1.1.1');
    expect(await closed.service.isSignUpOpen()).toBe(false);
    const second = await closed.service.signUp(
      { ...NEW_ACCOUNT, email: 'bob@example.com' },
      '2.2.2.2'
    );
    expect(second).toMatchObject({ ok: false, kind: 'forbidden' });
    if (!second.ok) {
      expect(second.errors[0]).toContain('ALLOW_SIGN_UP=true');
    }

    const open = createTestAuth({ allowSignUp: true });
    await open.service.signUp(NEW_ACCOUNT, '1.1.1.1');
    expect(await open.service.isSignUpOpen()).toBe(true);
    const bob = await open.service.signUp(
      { ...NEW_ACCOUNT, email: 'bob@example.com' },
      '2.2.2.2'
    );
    expect(bob.ok).toBe(true);
    // Only the very first account takes over projects that existed before sign-in.
    expect(open.repository.claimed.length).toBe(1);
  });

  test('reports every problem at once', async () => {
    const auth = createTestAuth();
    const result = await auth.service.signUp(
      { email: 'nope', password: 'short', displayName: ' ' },
      '1.1.1.1'
    );
    expect(result).toMatchObject({ ok: false, kind: 'invalid' });
    if (!result.ok) {
      expect(result.errors.length).toBe(3);
    }
  });

  test('refuses a second account with the same email, ignoring case', async () => {
    const auth = createTestAuth({ allowSignUp: true });
    await auth.service.signUp(NEW_ACCOUNT, '1.1.1.1');
    const again = await auth.service.signUp(
      { ...NEW_ACCOUNT, email: 'ADA@example.com' },
      '2.2.2.2'
    );
    expect(again).toMatchObject({ ok: false, kind: 'invalid' });
    if (!again.ok) {
      expect(again.errors[0]).toContain('already exists');
    }
  });
});

describe('sign-in', () => {
  async function accountReady() {
    const auth = createTestAuth();
    await auth.service.signUp(NEW_ACCOUNT, '1.1.1.1');
    return auth;
  }

  test('works with the right password, whatever the email case', async () => {
    const auth = await accountReady();
    const result = await auth.service.signIn(
      { email: 'ADA@example.com', password: NEW_ACCOUNT.password },
      '1.1.1.1'
    );
    expect(result.ok).toBe(true);
  });

  test('gives the same answer for a wrong password and an unknown email', async () => {
    const auth = await accountReady();
    const wrongPassword = await auth.service.signIn(
      { email: 'ada@example.com', password: 'not the password' },
      '1.1.1.1'
    );
    const unknownEmail = await auth.service.signIn(
      { email: 'nobody@example.com', password: 'not the password' },
      '2.2.2.2'
    );
    expect(wrongPassword).toEqual(unknownEmail);
    expect(wrongPassword).toMatchObject({
      ok: false,
      kind: 'unauthorized',
      errors: ['Email or password is incorrect.'],
    });
  });

  test('locks out after repeated failures, then recovers', async () => {
    const auth = await accountReady();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await auth.service.signIn(
        { email: 'ada@example.com', password: 'wrong password!' },
        '9.9.9.9'
      );
    }
    const blocked = await auth.service.signIn(
      { email: 'ada@example.com', password: NEW_ACCOUNT.password },
      '9.9.9.9'
    );
    expect(blocked).toMatchObject({ ok: false, kind: 'rateLimited' });
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.errors[0]).toContain('Try again in');
    }
    auth.advanceMinutes(16);
    const later = await auth.service.signIn(
      { email: 'ada@example.com', password: NEW_ACCOUNT.password },
      '9.9.9.9'
    );
    expect(later.ok).toBe(true);
  });

  test('a success clears the failure count', async () => {
    const auth = await accountReady();
    for (let round = 0; round < 3; round += 1) {
      await auth.service.signIn(
        { email: 'ada@example.com', password: 'wrong password!' },
        '8.8.8.8'
      );
      const good = await auth.service.signIn(
        { email: 'ada@example.com', password: NEW_ACCOUNT.password },
        '8.8.8.8'
      );
      expect(good.ok).toBe(true);
    }
  });
});

describe('sessions', () => {
  test('sign-out ends the session, and unknown or empty tokens are nobody', async () => {
    const auth = createTestAuth();
    const started = await auth.service.signUp(NEW_ACCOUNT, '1.1.1.1');
    if (!started.ok) throw new Error('sign-up failed');
    await auth.service.signOut(started.value.token);
    expect(await auth.service.authenticate(started.value.token)).toBeNull();
    expect(await auth.service.authenticate('made-up-token')).toBeNull();
    expect(await auth.service.authenticate('')).toBeNull();
    expect(await auth.service.authenticate(null)).toBeNull();
  });

  test('expire after their lifetime', async () => {
    const auth = createTestAuth();
    const started = await auth.service.signUp(NEW_ACCOUNT, '1.1.1.1');
    if (!started.ok) throw new Error('sign-up failed');
    auth.advanceMinutes(60 * 24 * 13);
    expect(await auth.service.authenticate(started.value.token)).not.toBeNull();
    auth.advanceMinutes(60 * 24 * 2);
    expect(await auth.service.authenticate(started.value.token)).toBeNull();
  });

  test('two sign-ins give two independent sessions', async () => {
    const auth = createTestAuth();
    await auth.service.signUp(NEW_ACCOUNT, '1.1.1.1');
    const first = await auth.service.signIn(
      { email: 'ada@example.com', password: NEW_ACCOUNT.password },
      '1.1.1.1'
    );
    const second = await auth.service.signIn(
      { email: 'ada@example.com', password: NEW_ACCOUNT.password },
      '1.1.1.1'
    );
    if (!first.ok || !second.ok) throw new Error('sign-in failed');
    expect(first.value.token).not.toBe(second.value.token);
    await auth.service.signOut(first.value.token);
    expect(await auth.service.authenticate(second.value.token)).not.toBeNull();
  });
});
