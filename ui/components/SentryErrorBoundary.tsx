"use client"

import React from "react"
import * as Sentry from "@sentry/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, RefreshCw, Bug, Home } from "lucide-react"
import { useRouter } from "next/navigation"

interface Props {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  eventId: string | null
}

class SentryErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console for debugging
    console.error("Error caught by boundary:", error, errorInfo)
    
    // Send error to Sentry
    const eventId = Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
      tags: {
        component: "error-boundary",
      },
    })
    
    this.setState({
      error,
      errorInfo,
      eventId,
    })
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback
        return <FallbackComponent error={this.state.error} resetError={this.resetError} />
      }

      // Default error UI
      return <DefaultErrorFallback 
        error={this.state.error} 
        errorInfo={this.state.errorInfo}
        eventId={this.state.eventId}
        resetError={this.resetError} 
      />
    }

    return this.props.children
  }
}

interface DefaultErrorFallbackProps {
  error: Error
  errorInfo: React.ErrorInfo | null
  eventId: string | null
  resetError: () => void
}

function DefaultErrorFallback({ error, errorInfo, eventId, resetError }: DefaultErrorFallbackProps) {
  const router = useRouter()
  const [showDetails, setShowDetails] = React.useState(false)
  const isDevelopment = process.env.NODE_ENV === "development"

  const handleReportIssue = () => {
    if (eventId) {
      Sentry.showReportDialog({ eventId })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
      <Card className="max-w-2xl w-full bg-gray-800 border-gray-700">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <div>
              <CardTitle className="text-2xl text-white">Something went wrong</CardTitle>
              <CardDescription className="text-gray-400">
                An unexpected error occurred in the application
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Error message */}
          <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
            <p className="text-sm font-mono text-red-400">
              {error.message || "An unknown error occurred"}
            </p>
          </div>

          {/* Event ID for support */}
          {eventId && (
            <div className="text-sm text-gray-500">
              Error ID: <span className="font-mono text-gray-400">{eventId}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={resetError}
              variant="default"
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
            
            <Button
              onClick={() => router.push("/")}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Home className="h-4 w-4" />
              Go Home
            </Button>
            
            {eventId && (
              <Button
                onClick={handleReportIssue}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Bug className="h-4 w-4" />
                Report Issue
              </Button>
            )}
          </div>

          {/* Detailed error info (development only) */}
          {isDevelopment && (
            <>
              <Button
                onClick={() => setShowDetails(!showDetails)}
                variant="ghost"
                className="text-sm text-gray-400"
              >
                {showDetails ? "Hide" : "Show"} Technical Details
              </Button>
              
              {showDetails && (
                <div className="space-y-4">
                  {/* Stack trace */}
                  <div className="p-4 bg-gray-900 rounded-lg overflow-auto max-h-64">
                    <p className="text-xs font-mono text-gray-500 mb-2">Stack Trace:</p>
                    <pre className="text-xs text-gray-400 whitespace-pre-wrap">
                      {error.stack}
                    </pre>
                  </div>
                  
                  {/* Component stack */}
                  {errorInfo?.componentStack && (
                    <div className="p-4 bg-gray-900 rounded-lg overflow-auto max-h-64">
                      <p className="text-xs font-mono text-gray-500 mb-2">Component Stack:</p>
                      <pre className="text-xs text-gray-400 whitespace-pre-wrap">
                        {errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default SentryErrorBoundary