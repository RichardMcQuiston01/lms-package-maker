import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Result } from '@richardmcquiston01/lms-package-maker-model';

/**
 * Passwords are hashed with scrypt (built into Node, no native add-on). The
 * stored form is `scrypt$N$r$p$salt$hash` so the cost can be raised later and
 * old hashes still verify.
 */
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** scrypt needs 128 * N * r bytes; allow double for headroom. */
const MAX_MEMORY_BYTES = 128 * COST * BLOCK_SIZE * 2;

/** Upper bound on the cost read back from storage, so a bad row cannot exhaust memory. */
const MAX_ACCEPTED_COST = 2 ** 17;

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

function deriveKey(
  password: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelism: number,
  keyLength: number
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject): void => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      keyLength,
      {
        N: cost,
        r: blockSize,
        p: parallelism,
        maxmem: 128 * cost * blockSize * 2,
      },
      (error: Error | null | undefined, key: Buffer): void => {
        // Node passes null when there is no error; Bun passes undefined.
        if (error !== null && error !== undefined) {
          reject(error);
        } else {
          resolve(key);
        }
      }
    );
  });
}

export function validatePassword(password: string): Result<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      errors: [
        `password must be at least ${MIN_PASSWORD_LENGTH} characters, got ${password.length}`,
      ],
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      errors: [
        `password must be at most ${MAX_PASSWORD_LENGTH} characters, got ${password.length}`,
      ],
    };
  }
  return { ok: true, value: password };
}

export async function hashPassword(password: string): Promise<string> {
  const salt: Buffer = randomBytes(SALT_LENGTH);
  const key: Buffer = await deriveKey(
    password,
    salt,
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    KEY_LENGTH
  );
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/** True only when the password matches. A malformed stored hash never matches. */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts: string[] = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelism = Number(parts[3]);
  const salt: Buffer = Buffer.from(parts[4] ?? '', 'base64');
  const expected: Buffer = Buffer.from(parts[5] ?? '', 'base64');
  if (
    !Number.isInteger(cost) ||
    cost < 2 ||
    cost > MAX_ACCEPTED_COST ||
    (cost & (cost - 1)) !== 0 ||
    !Number.isInteger(blockSize) ||
    blockSize < 1 ||
    blockSize > 32 ||
    !Number.isInteger(parallelism) ||
    parallelism < 1 ||
    parallelism > 16 ||
    expected.length < 16 ||
    expected.length > 128
  ) {
    return false;
  }
  try {
    const actual: Buffer = await deriveKey(
      password,
      salt,
      cost,
      blockSize,
      parallelism,
      expected.length
    );
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/**
 * Spends the same time as a real check. Sign-in calls it for unknown emails
 * so response time does not reveal which emails have accounts.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('not-a-real-password');
  await verifyPassword(password, await dummyHash);
}

export { MAX_MEMORY_BYTES as SCRYPT_MAX_MEMORY_BYTES };
