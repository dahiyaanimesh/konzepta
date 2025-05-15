/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5050',
  },
  // Ensure we can handle the Python backend in a different location
  async rewrites() {
    return process.env.NODE_ENV === 'development'
      ? [
          {
            source: '/api/:path*',
            destination: 'http://localhost:5050/:path*',
          },
        ]
      : [];
  },
  // Skip pre-rendering the API routes to avoid SSR issues
  exportPathMap: async function() {
    return {
      '/': { page: '/' },
    };
  },
  // Force dynamic rendering for routes to avoid SSG issues
  experimental: {
    appDir: true,
  },
}

module.exports = nextConfig 