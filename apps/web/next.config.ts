import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Los paquetes del monorepo se publican como TypeScript fuente.
  transpilePackages: ['@celmi/core', '@celmi/ui', '@celmi/validation'],
};

export default nextConfig;
