import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
