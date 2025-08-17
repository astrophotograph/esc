import { withSentryConfig } from "@sentry/nextjs"

// Get backend host from environment or default to localhost:8000
const backendHost = process.env.BACKEND_HOST || 'localhost:8000'
const backendUrl = `http://${backendHost}`

/** @type {import('next').NextConfig} */
const nextConfig = {
  // experimental: {
  //   instrumentationHook: true,
  // },
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
        destination: `${backendUrl}/api/telescopes/:path*`,
      },
      {
        source: '/api/telescopes',
        destination: `${backendUrl}/api/telescopes`,
      },
      // Remote controllers
      {
        source: '/api/remote-controllers/:path*',
        destination: `${backendUrl}/api/remote-controllers/:path*`,
      },
      {
        source: '/api/remote-controllers',
        destination: `${backendUrl}/api/remote-controllers`,
      },
      // Image processing endpoints
      {
        source: '/processed/:path*',
        destination: `${backendUrl}/api/processing/processed/:path*`,
      },
      // System administration endpoints
      {
        source: '/api/system/:path*',
        destination: `${backendUrl}/api/system/:path*`,
      },
      // Sky map endpoints
      {
        source: '/api/skymap/:path*',
        destination: `${backendUrl}/api/skymap/:path*`,
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
export default withSentryConfig(withSentryConfig(nextConfig, sentryWebpackPluginOptions), {
// For all available options, see:
// https://www.npmjs.com/package/@sentry/webpack-plugin#options

org: "steven-byrnes",
project: "esc-nextjs",

// Only print logs for uploading source maps in CI
silent: !process.env.CI,

// For all available options, see:
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

// Upload a larger set of source maps for prettier stack traces (increases build time)
widenClientFileUpload: true,

// Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
// This can increase your server load as well as your hosting bill.
// Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
// side errors will fail.
tunnelRoute: "/monitoring",

// Automatically tree-shake Sentry logger statements to reduce bundle size
disableLogger: true,

// Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
// See the following for more information:
// https://docs.sentry.io/product/crons/
// https://vercel.com/docs/cron-jobs
automaticVercelMonitors: true,
});
