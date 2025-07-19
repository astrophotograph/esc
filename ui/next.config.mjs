/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Enable standalone output for production builds
  output: 'standalone',
  env: {
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString().split('T')[0],
  },
  async rewrites() {
    return [
      // General API proxy - telescopes and other endpoints
      {
        source: '/api/telescopes/:path*',
        destination: 'http://localhost:8000/api/telescopes/:path*',
      },
      {
        source: '/api/telescopes',
        destination: 'http://localhost:8000/api/telescopes',
      },
      // Remote controllers
      {
        source: '/api/remote-controllers/:path*',
        destination: 'http://localhost:8000/api/remote-controllers/:path*',
      },
      {
        source: '/api/remote-controllers',
        destination: 'http://localhost:8000/api/remote-controllers',
      },
      // Image processing endpoints
      {
        source: '/processed/:path*',
        destination: 'http://localhost:8000/api/processing/processed/:path*',
      },
      // System administration endpoints
      {
        source: '/api/system/:path*',
        destination: 'http://localhost:8000/api/system/:path*',
      },
      // Sky map endpoints
      {
        source: '/api/skymap/:path*',
        destination: 'http://localhost:8000/api/skymap/:path*',
      },
    ]
  },
}

export default nextConfig
