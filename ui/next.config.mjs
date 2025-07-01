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
  // Enable standalone output for Docker production builds
  output: 'standalone',
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
