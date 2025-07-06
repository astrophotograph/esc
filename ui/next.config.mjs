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
  // Enable static export for Electron builds
  output: process.env.BUILD_TARGET === 'electron' ? 'export' : 'standalone',
  // async rewrites() {
  //   return [
  //     {
  //       source: '/api/v2/:path*',
  //       destination: 'http://localhost:8000/api/:path*',
  //     },
  //   ]
  // },
}

export default nextConfig
