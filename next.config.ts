import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    optimizeCss: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Forwarded-Proto', value: 'https' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
    {
      source: '/_next/static/(.*)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    {
      source: '/favicon.(png|svg|ico)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=86400' },
      ],
    },
    {
      source: '/logo.png',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=86400' },
      ],
    },
    {
      source: '/manifest.json',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=3600' },
      ],
    },
    {
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
      ],
    },
  ],
};

export default nextConfig;
