import type { NextConfig } from 'next';

const config: NextConfig = {
  // Cera ships TypeScript source for now (no build step yet), so Next compiles it.
  transpilePackages: ['@lateraltranslucence/cera'],
};

export default config;
