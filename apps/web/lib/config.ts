import path from 'node:path';

/** Resolves the data directory from LMS_DATA_DIR, defaulting to ./data. */
export function getDataDirectory(): string {
  const configured: string | undefined = process.env['LMS_DATA_DIR'];
  return path.resolve(
    configured !== undefined && configured !== '' ? configured : './data'
  );
}

const MIN_SECRET_LENGTH = 32;

/**
 * The key that signs preview links. Set AUTH_SECRET to a random string of at
 * least 32 characters. Outside production a random key is made at start-up,
 * which only means preview links stop working after a restart.
 */
export function getAuthSecret(): string {
  const configured: string | undefined = process.env['AUTH_SECRET'];
  if (configured !== undefined && configured.length >= MIN_SECRET_LENGTH) {
    return configured;
  }
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      `AUTH_SECRET must be set to a random string of at least ${MIN_SECRET_LENGTH} characters (got ${configured?.length ?? 0}). Generate one with: openssl rand -base64 48`
    );
  }
  return `development-${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

/** Whether anyone may create an account, not only the first person. */
export function isSignUpAllowed(): boolean {
  return process.env['ALLOW_SIGN_UP'] === 'true';
}
