import { describe, expect, test } from 'bun:test';
import nextConfig, { SERVER_EXTERNAL_PACKAGES } from './next.config';

describe('next.config', () => {
  test('keeps the adapter packages out of the server bundle', () => {
    // See the comment in next.config.ts: bundled, the error log cannot write its file.
    expect(nextConfig.serverExternalPackages).toEqual(SERVER_EXTERNAL_PACKAGES);
    expect(SERVER_EXTERNAL_PACKAGES).toContain(
      '@richardmcquiston01/error-log-adapter'
    );
    expect(SERVER_EXTERNAL_PACKAGES).toContain(
      '@richardmcquiston01/storage-adapters'
    );
  });
});
