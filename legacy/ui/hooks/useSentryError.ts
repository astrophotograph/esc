import * as Sentry from "@sentry/nextjs"
import { useCallback } from "react"

interface ErrorContext {
  component?: string
  action?: string
  telescope?: string
  [key: string]: any
}

export function useSentryError() {
  // Capture a regular error
  const captureError = useCallback((error: Error | unknown, context?: ErrorContext) => {
    console.error("Capturing error:", error, context)
    
    const eventId = Sentry.captureException(error, {
      tags: context ? {
        component: context.component,
        action: context.action,
        telescope: context.telescope,
      } : undefined,
      extra: context,
    })
    
    return eventId
  }, [])
  
  // Capture a message (for non-error events)
  const captureMessage = useCallback((message: string, level: "info" | "warning" | "error" = "info", context?: ErrorContext) => {
    console.log(`Capturing ${level} message:`, message, context)
    
    const sentryLevel = level === "error" ? "error" : level === "warning" ? "warning" : "info"
    
    const eventId = Sentry.captureMessage(message, {
      level: sentryLevel,
      tags: context ? {
        component: context.component,
        action: context.action,
        telescope: context.telescope,
      } : undefined,
      extra: context,
    })
    
    return eventId
  }, [])
  
  // Add breadcrumb for tracking user actions
  const addBreadcrumb = useCallback((message: string, category: string, data?: Record<string, any>) => {
    Sentry.addBreadcrumb({
      message,
      category,
      level: "info",
      timestamp: Date.now() / 1000,
      data,
    })
  }, [])
  
  // Set user context
  const setUserContext = useCallback((userId?: string, email?: string, username?: string) => {
    Sentry.setUser({
      id: userId,
      email,
      username,
    })
  }, [])
  
  // Set additional context
  const setContext = useCallback((key: string, context: Record<string, any>) => {
    Sentry.setContext(key, context)
  }, [])
  
  // Show the Sentry feedback dialog
  const showFeedbackDialog = useCallback((eventId?: string) => {
    if (eventId) {
      Sentry.showReportDialog({ eventId })
    } else {
      Sentry.showReportDialog()
    }
  }, [])
  
  // Wrap an async function with error capturing
  const withErrorCapture = useCallback(<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    context?: ErrorContext
  ) => {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args)
      } catch (error) {
        captureError(error, context)
        throw error
      }
    }
  }, [captureError])
  
  return {
    captureError,
    captureMessage,
    addBreadcrumb,
    setUserContext,
    setContext,
    showFeedbackDialog,
    withErrorCapture,
  }
}