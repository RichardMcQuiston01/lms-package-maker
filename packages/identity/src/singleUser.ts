import type { Identity, IdentityProvider, IdentityResult } from './types.js';

/**
 * Everyone is the same person and nobody signs in. For one person running the
 * app on their own machine, such as a desktop build. Never use it on a server
 * that other people can reach.
 */
export function createSingleUserIdentityProvider(
  who: { id?: string; displayName?: string } = {}
): IdentityProvider {
  const identity: Identity = {
    id: `single:${who.id ?? 'local'}`,
    displayName: who.displayName ?? 'Local user',
  };
  return {
    name: 'single-user',
    identify: async (): Promise<IdentityResult> => ({
      ok: true,
      value: identity,
    }),
    signInUrl: null,
    signOutUrl: null,
  };
}
