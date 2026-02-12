import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingExcludes: {
    '*': ['./data/**'],
  },
};

export default nextConfig;
