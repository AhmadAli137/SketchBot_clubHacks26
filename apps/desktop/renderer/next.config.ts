import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  outputFileTracingRoot: path.join(__dirname, '..', '..', '..'),
};

export default nextConfig;
