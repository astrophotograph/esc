import * as Sentry from "@sentry/nextjs"

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    
    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    
    // Session Replay
    replaysSessionSampleRate: 0.1, // 10% of sessions will be recorded
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors will be recorded
    
    // Release tracking
    release: process.env.NEXT_PUBLIC_APP_VERSION,
    
    // Environment
    environment: process.env.NODE_ENV,
    
    // Error filtering
    beforeSend(event, hint) {
      // Filter out certain errors that we don't want to track
      const error = hint.originalException
      
      // Don't report ResizeObserver errors (common and usually harmless)
      if (error && error instanceof Error && error.message?.includes("ResizeObserver")) {
        return null
      }
      
      // Don't report network errors for telescope connections (expected during disconnects)
      if (error && error instanceof Error && error.message?.includes("telescope connection")) {
        return null
      }
      
      // Don't report WebRTC connection failures (will fallback to MJPEG)
      if (error && error instanceof Error && error.message?.includes("WebRTC")) {
        return null
      }
      
      return event
    },
    
    // Integrations
    integrations: [
      // Captures console.error() calls
      Sentry.captureConsoleIntegration({
        levels: ["error", "warn"],
      }),
      
      // Captures unhandled promise rejections
      Sentry.globalHandlersIntegration({
        onerror: true,
        onunhandledrejection: true,
      }),
      
      // Session replay
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
        maskAllInputs: true, // Mask sensitive input fields
        mask: ['.sensitive'], // CSS selector for elements to mask
        unmask: ['.unmask'], // CSS selector for elements to unmask
      }),
      
      // Browser tracing
      Sentry.browserTracingIntegration(),
      
      // HTTP client errors
      Sentry.httpIntegration({
        failedRequestStatusCodes: [400, 599],
        failedRequestTargets: [/^\/api/],
      }),
    ],
    
    // Ignore certain errors
    ignoreErrors: [
      // Browser extensions
      "chrome-extension://",
      "firefox-extension://",
      "moz-extension://",
      
      // Common browser errors
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      
      // Network errors that are expected
      "NetworkError",
      "Failed to fetch",
      "Load failed",
      
      // WebRTC errors (we have fallback to MJPEG)
      "RTCPeerConnection",
      "RTCDataChannel",
    ],
    
    // Don't send errors from localhost development
    enabled: process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SENTRY_DEBUG === "true",
    
    // Debug mode for development
    debug: process.env.NODE_ENV === "development",
    
    // Set user context
    initialScope: {
      tags: {
        component: "frontend",
        framework: "nextjs",
      },
    },
  })
  
  // Log that Sentry is initialized
  console.log("Sentry initialized for client-side error tracking")
} else {
  console.log("Sentry DSN not configured, error tracking disabled")
}