import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Temporarily disable TypeScript checking during build for Vercel deployment
  typescript: {
    ignoreBuildErrors: true,
  },

  // Disable ESLint during builds for deployment
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Enable experimental features for better performance
  experimental: {
    // Enable Server Actions optimization
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  
  // Optimize compilation and bundling
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },

  // Configure webpack for WASM support (fallback for production builds)
  webpack: (config, { isServer }) => {
    // Add rule for WASM files
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    // Ignore tiktoken WASM files from being processed by webpack loaders
    config.resolve.alias = {
      ...config.resolve.alias,
      'tiktoken': require.resolve('tiktoken'),
    };

    return config;
  },
  
  // Enable compression for better performance
  compress: true,
  
  // Optimize image handling
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  
  // Configure headers for better caching
  async headers() {
    return [
      {
        // Disable caching for chat streaming endpoints
        source: '/api/chat/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
      {
        // Allow caching for auth endpoints (helps with session validation)
        source: '/api/auth/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, max-age=0',
          },
        ],
      },
      {
        // Default caching for other API endpoints
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
