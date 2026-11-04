import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    '@richardmcquiston01/lms-package-maker-model',
    '@richardmcquiston01/lms-package-maker-exporters',
  ],
  output: 'standalone',
};

export default nextConfig;
