/**
 * Who is using the app. The app never looks inside an id: it only compares
 * ids for equality and uses them to decide whose courses to show. So a host
 * can use whatever stable id it already has.
 */
export interface Identity {
  /** Stable and unique per person, 1 to 255 characters, no control characters. */
  readonly id: string;
  /** Shown in the app, 1 to 100 characters. */
  readonly displayName: string;
  readonly email?: string;
}

/** The part of a request an identity provider may look at. */
export interface IdentityRequest {
  readonly headers: HeaderReader;
}

/** What `Headers` offers that providers need; any object with `get` works. */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * `value` is null when nobody is signed in, which is normal and not an
 * error. `ok: false` means the provider could not tell, for example because
 * the proxy sent an id the app cannot accept.
 */
export type IdentityResult =
  | { readonly ok: true; readonly value: Identity | null }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Implement this to make the app use your login instead of its own.
 * `identify` is called for every request and must not throw; report a
 * problem with `ok: false`.
 */
export interface IdentityProvider {
  /** Short label for logs and messages, such as `builtin` or `header`. */
  readonly name: string;
  identify(request: IdentityRequest): Promise<IdentityResult>;
  /** Where people who are not signed in are sent (a path or full URL), or null. */
  readonly signInUrl: string | null;
  /** Where "Sign out" leads (a path or full URL), or null when the app signs out itself or cannot. */
  readonly signOutUrl: string | null;
}

/** Success or a list of problems, for functions that build providers. */
export type Result<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly errors: readonly string[] };
