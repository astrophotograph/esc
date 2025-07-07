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
      // Status stream endpoints
      {
        source: '/api/:scope/status/stream',
        destination: 'http://localhost:8000/api/telescopes/:scope/status/stream',
      },
      // WebRTC endpoints
      {
        source: '/api/webrtc/:path*',
        destination: 'http://localhost:8000/api/webrtc/:path*',
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
      // Health check
      {
        source: '/api/health',
        destination: 'http://localhost:8000/api/health',
      },
      // Catch-all for any other API endpoints
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ]
  },
}

export default nextConfig
