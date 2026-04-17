import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  outputFileTracingRoot: path.join(__dirname, '..', '..', '..'),

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Prevent Node-only ONNX runtime from being bundled in the browser
      config.resolve.alias = {
        ...config.resolve.alias,
        'sharp$': false,
        'onnxruntime-node$': false,
      };
    }
    return config;
  },
};

export default nextConfig;
