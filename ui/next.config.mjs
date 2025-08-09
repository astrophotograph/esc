import { withSentryConfig } from "@sentry/nextjs"

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
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

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // Suppresses source map uploading logs during build
  silent: true,
  
  // Organization and project from your Sentry account
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  
  // Auth token for uploading source maps
  authToken: process.env.SENTRY_AUTH_TOKEN,
  
  // Automatically release tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION,
  
  // Upload source maps only in production
  disabled: process.env.NODE_ENV !== 'production',
  
  // Additional options
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: true,
}

// Export the config with Sentry wrapper
export default withSentryConfig(nextConfig, sentryWebpackPluginOptions)
