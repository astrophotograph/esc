import * as Sentry from "@sentry/nextjs"

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;

// export async function register() {
//   if (process.env.NEXT_RUNTIME === "nodejs") {
//     // Server-side configuration
//     const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
//
//     if (SENTRY_DSN) {
//       Sentry.init({
//         dsn: SENTRY_DSN,
//
//         // Performance Monitoring
//         tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
//
//         // Release tracking
//         release: process.env.NEXT_PUBLIC_APP_VERSION,
//
//         // Environment
//         environment: process.env.NODE_ENV,
//
//         // Server-specific configuration
//         integrations: [
//           // Captures console.error() calls
//           Sentry.captureConsoleIntegration({
//             levels: ["error", "warn"],
//           }),
//
//           // HTTP integration for API errors
//           Sentry.httpIntegration({
//             tracing: true,
//             breadcrumbs: true,
//           }),
//
//           // Captures unhandled errors
//           Sentry.onUncaughtExceptionIntegration(),
//
//           // Captures unhandled promise rejections
//           Sentry.onUnhandledRejectionIntegration(),
//         ],
//
//         // Error filtering
//         beforeSend(event, hint) {
//           // Filter out certain errors that we don't want to track
//           const error = hint.originalException
//
//           // Don't report expected API errors
//           if (error && error instanceof Error) {
//             // Filter out telescope connection errors (expected during disconnects)
//             if (error.message?.includes("telescope") || error.message?.includes("ECONNREFUSED")) {
//               return null
//             }
//
//             // Filter out abort errors (user navigation)
//             if (error.name === "AbortError") {
//               return null
//             }
//           }
//
//           return event
//         },
//
//         // Ignore certain errors
//         ignoreErrors: [
//           // Next.js specific
//           "NEXT_NOT_FOUND",
//           "NEXT_REDIRECT",
//
//           // Common server errors
//           "ECONNREFUSED",
//           "ECONNRESET",
//           "ETIMEDOUT",
//           "EPIPE",
//
//           // Expected errors
//           "AbortError",
//         ],
//
//         // Don't send errors from localhost development
//         enabled: process.env.NODE_ENV === "production" || process.env.SENTRY_DEBUG === "true",
//
//         // Debug mode for development
//         debug: process.env.NODE_ENV === "development",
//
//         // Set server context
//         initialScope: {
//           tags: {
//             component: "backend",
//             framework: "nextjs",
//             runtime: "nodejs",
//           },
//         },
//       })
//
//       console.log("Sentry initialized for Node.js runtime")
//     } else {
//       console.log("Sentry DSN not configured, error tracking disabled")
//     }
//   }
//
//   if (process.env.NEXT_RUNTIME === "edge") {
//     // Edge runtime configuration
//     const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
//
//     if (SENTRY_DSN) {
//       Sentry.init({
//         dsn: SENTRY_DSN,
//
//         // Performance Monitoring
//         tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
//
//         // Release tracking
//         release: process.env.NEXT_PUBLIC_APP_VERSION,
//
//         // Environment
//         environment: process.env.NODE_ENV,
//
//         // Edge-specific configuration
//         integrations: [
//           // Captures console.error() calls
//           Sentry.captureConsoleIntegration({
//             levels: ["error", "warn"],
//           }),
//         ],
//
//         // Error filtering
//         beforeSend(event, hint) {
//           // Filter out certain errors that we don't want to track
//           const error = hint.originalException
//
//           // Don't report expected API errors
//           if (error && error instanceof Error) {
//             // Filter out telescope connection errors (expected during disconnects)
//             if (error.message?.includes("telescope") || error.message?.includes("ECONNREFUSED")) {
//               return null
//             }
//
//             // Filter out abort errors (user navigation)
//             if (error.name === "AbortError") {
//               return null
//             }
//           }
//
//           return event
//         },
//
//         // Don't send errors from localhost development
//         enabled: process.env.NODE_ENV === "production" || process.env.SENTRY_DEBUG === "true",
//
//         // Debug mode for development
//         debug: process.env.NODE_ENV === "development",
//
//         // Set edge context
//         initialScope: {
//           tags: {
//             component: "edge",
//             framework: "nextjs",
//             runtime: "edge",
//           },
//         },
//       })
//
//       console.log("Sentry initialized for Edge runtime")
//     } else {
//       console.log("Sentry DSN not configured, error tracking disabled")
//     }
//   }
// }
