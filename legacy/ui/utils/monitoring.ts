import * as Sentry from "@sentry/nextjs"

// Performance monitoring for critical operations
export function startTransaction(name: string, op: string = "custom") {
  return Sentry.startInactiveSpan({
    name,
    op,
  })
}

// Monitor telescope operations
export function monitorTelescopeOperation(
  telescopeName: string,
  operation: string,
  fn: () => Promise<any>
) {
  return Sentry.startSpan(
    {
      name: `telescope.${operation}`,
      op: "telescope",
      attributes: {
        telescope: telescopeName,
        operation,
      },
    },
    async () => {
      try {
        const result = await fn()
        return result
      } catch (error) {
        Sentry.captureException(error, {
          tags: {
            telescope: telescopeName,
            operation,
          },
        })
        throw error
      }
    }
  )
}

// Monitor API calls
export function monitorApiCall(
  endpoint: string,
  method: string,
  fn: () => Promise<Response>
) {
  return Sentry.startSpan(
    {
      name: `${method} ${endpoint}`,
      op: "http.client",
      attributes: {
        "http.method": method,
        "http.url": endpoint,
      },
    },
    async () => {
      try {
        const response = await fn()
        
        // Capture non-successful responses
        if (!response.ok) {
          Sentry.captureMessage(`API call failed: ${method} ${endpoint}`, {
            level: "warning",
            tags: {
              endpoint,
              method,
              status: response.status,
            },
          })
        }
        
        return response
      } catch (error) {
        Sentry.captureException(error, {
          tags: {
            endpoint,
            method,
          },
        })
        throw error
      }
    }
  )
}

// Console error interceptor
export function setupConsoleInterceptor() {
  if (typeof window === "undefined") return
  
  const originalError = console.error
  const originalWarn = console.warn
  
  // Intercept console.error
  console.error = (...args: any[]) => {
    // Call original console.error
    originalError.apply(console, args)
    
    // Send to Sentry if it's not a development environment
    if (process.env.NODE_ENV === "production") {
      const message = args
        .map(arg => {
          if (typeof arg === "object") {
            try {
              return JSON.stringify(arg)
            } catch {
              return String(arg)
            }
          }
          return String(arg)
        })
        .join(" ")
      
      // Check if it's an actual error object
      const error = args.find(arg => arg instanceof Error)
      
      if (error) {
        Sentry.captureException(error, {
          tags: {
            source: "console.error",
          },
        })
      } else {
        Sentry.captureMessage(message, {
          level: "error",
          tags: {
            source: "console.error",
          },
        })
      }
    }
  }
  
  // Intercept console.warn for critical warnings
  console.warn = (...args: any[]) => {
    // Call original console.warn
    originalWarn.apply(console, args)
    
    // Only capture specific warnings in production
    if (process.env.NODE_ENV === "production") {
      const message = args.join(" ")
      
      // Capture critical warnings
      if (
        message.includes("Critical") ||
        message.includes("Security") ||
        message.includes("Deprecated") ||
        message.includes("telescope error")
      ) {
        Sentry.captureMessage(message, {
          level: "warning",
          tags: {
            source: "console.warn",
          },
        })
      }
    }
  }
}

// Network error monitoring
export function setupNetworkErrorMonitoring() {
  if (typeof window === "undefined") return
  
  // Monitor failed fetch requests
  const originalFetch = window.fetch
  window.fetch = async (...args) => {
    const [url, options] = args
    const method = options?.method || "GET"
    
    try {
      const response = await originalFetch(...args)
      
      // Log failed requests to Sentry
      if (!response.ok && response.status >= 500) {
        Sentry.captureMessage(`Network request failed: ${method} ${url}`, {
          level: "warning",
          tags: {
            url: String(url),
            method,
            status: response.status,
          },
        })
      }
      
      return response
    } catch (error) {
      // Network errors (connection refused, timeout, etc.)
      Sentry.captureException(error, {
        tags: {
          url: String(url),
          method,
          type: "network_error",
        },
      })
      throw error
    }
  }
}

// WebSocket error monitoring
export function monitorWebSocket(url: string): WebSocket {
  const ws = new WebSocket(url)
  
  ws.addEventListener("error", (event) => {
    Sentry.captureMessage(`WebSocket error: ${url}`, {
      level: "error",
      tags: {
        url,
        type: "websocket_error",
      },
      extra: {
        event,
      },
    })
  })
  
  ws.addEventListener("close", (event) => {
    // Only capture unexpected closes
    if (!event.wasClean) {
      Sentry.captureMessage(`WebSocket closed unexpectedly: ${url}`, {
        level: "warning",
        tags: {
          url,
          code: event.code,
          reason: event.reason,
        },
      })
    }
  })
  
  return ws
}

// Initialize all monitoring
export function initializeMonitoring() {
  if (typeof window === "undefined") return
  
  // Setup console interceptor
  setupConsoleInterceptor()
  
  // Setup network monitoring
  setupNetworkErrorMonitoring()
  
  // Monitor unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    Sentry.captureException(event.reason, {
      tags: {
        type: "unhandled_promise_rejection",
      },
    })
  })
  
  // Monitor page performance
  if ("performance" in window && "PerformanceObserver" in window) {
    try {
      // Monitor long tasks
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            // Tasks longer than 50ms
            Sentry.addBreadcrumb({
              category: "performance",
              message: `Long task detected: ${entry.duration}ms`,
              level: "warning",
              data: {
                duration: entry.duration,
                startTime: entry.startTime,
              },
            })
          }
        }
      })
      
      observer.observe({ entryTypes: ["longtask"] })
    } catch (e) {
      // PerformanceObserver might not be supported
      console.debug("PerformanceObserver not supported:", e)
    }
  }
}