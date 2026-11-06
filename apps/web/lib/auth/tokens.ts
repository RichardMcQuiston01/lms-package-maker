import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { Result } from '@richardmcquiston01/lms-package-maker-model';

/** A random cookie value. Only its hash is ever stored. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const PREVIEW_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

function previewSignature(
  secret: string,
  projectId: string,
  userId: string,
  expiresAtMs: number
): Buffer {
  return createHmac('sha256', secret)
    .update(`preview|${projectId}|${userId}|${expiresAtMs}`)
    .digest();
}

/**
 * The course preview runs in a sandboxed frame that cannot send the session
 * cookie, so it carries a short-lived signed token in its URL instead. The
 * token only allows reading one project's preview.
 */
export function signPreviewToken(
  secret: string,
  projectId: string,
  userId: string,
  nowMs: number
): string {
  const expiresAtMs: number = nowMs + PREVIEW_TOKEN_LIFETIME_MS;
  const signature: string = previewSignature(
    secret,
    projectId,
    userId,
    expiresAtMs
  ).toString('base64url');
  // The owner id is encoded because hosts may use any text, including dots and slashes.
  return `${expiresAtMs}.${Buffer.from(userId, 'utf8').toString('base64url')}.${signature}`;
}

export function verifyPreviewToken(
  secret: string,
  projectId: string,
  token: string,
  nowMs: number
): Result<{ userId: string }> {
  const parts: string[] = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, errors: ['the preview link is malformed'] };
  }
  const expiresAtMs = Number(parts[0]);
  const userId: string = Buffer.from(parts[1] ?? '', 'base64url').toString(
    'utf8'
  );
  const signature: Buffer = Buffer.from(parts[2] ?? '', 'base64url');
  if (!Number.isFinite(expiresAtMs)) {
    return { ok: false, errors: ['the preview link is malformed'] };
  }
  const expected: Buffer = previewSignature(
    secret,
    projectId,
    userId,
    expiresAtMs
  );
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  ) {
    return {
      ok: false,
      errors: ['the preview link is not valid for this project'],
    };
  }
  if (nowMs > expiresAtMs) {
    return {
      ok: false,
      errors: ['the preview link has expired; reload the editor'],
    };
  }
  return { ok: true, value: { userId } };
}

/** Builds the preview helpers around one secret and clock. */
export interface PreviewAccess {
  /** Path to open a project's preview, valid for a few minutes. */
  urlFor(projectId: string, userId: string): string;
  verify(projectId: string, token: string): Result<{ userId: string }>;
}

export function createPreviewAccess(
  secret: string,
  now: () => number = Date.now
): PreviewAccess {
  return {
    urlFor(projectId: string, userId: string): string {
      const token: string = signPreviewToken(secret, projectId, userId, now());
      return `/api/projects/${projectId}/preview/${token}/index.html`;
    },
    verify(projectId: string, token: string): Result<{ userId: string }> {
      return verifyPreviewToken(secret, projectId, token, now());
    },
  };
}
