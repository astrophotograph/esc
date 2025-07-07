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
      // Status stream endpoints (must come before general telescope endpoints)
      {
        source: '/api/:scope/status/stream',
        destination: 'http://localhost:8000/api/telescopes/:scope/status/stream',
      },
      // General API proxy - telescopes and other endpoints
      {
        source: '/api/telescopes/:path*',
        destination: 'http://localhost:8000/api/telescopes/:path*',
      },
      {
        source: '/api/telescopes',
        destination: 'http://localhost:8000/api/telescopes',
      },
      // WebRTC endpoints (proxy to backend since we removed catch-all)
      {
        source: '/api/webrtc/config',
        destination: 'http://localhost:8000/api/webrtc/config',
      },
      {
        source: '/api/webrtc/sessions/:path*',
        destination: 'http://localhost:8000/api/webrtc/sessions/:path*',
      },
      {
        source: '/api/webrtc/sessions',
        destination: 'http://localhost:8000/api/webrtc/sessions',
      },
      {
        source: '/api/webrtc/test/:path*',
        destination: 'http://localhost:8000/api/webrtc/test/:path*',
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
    ]
  },
}

export default nextConfig
