import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Packages that must be loaded by Node itself instead of being bundled.
 * The adapter packages pick their file-system module at run time
 * (`import(moduleName)`), which the bundler cannot follow: bundled, the error
 * log's file sink fails with "Cannot find module 'node:fs/promises'" and logs
 * silently go to the console only.
 */
export const SERVER_EXTERNAL_PACKAGES: string[] = [
  '@richardmcquiston01/error-log-adapter',
  '@richardmcquiston01/storage-adapters',
];

const nextConfig: NextConfig = {
  serverExternalPackages: SERVER_EXTERNAL_PACKAGES,
  output: 'standalone',
  // Trace files from the repository root so the standalone output includes the
  // workspace packages (and lands at apps/web/server.js).
  outputFileTracingRoot: path.resolve(import.meta.dirname, '../..'),
};

export default nextConfig;
