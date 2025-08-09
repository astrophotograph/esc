"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, RefreshCw, Bug, Home } from "lucide-react"
import { useRouter } from "next/navigation"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    // Log the error to Sentry
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
          <Card className="max-w-2xl w-full bg-gray-800 border-gray-700">
            <CardHeader>
              <div className="flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-red-500" />
                <div>
                  <CardTitle className="text-2xl text-white">Application Error</CardTitle>
                  <CardDescription className="text-gray-400">
                    A critical error occurred in the application
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error message */}
              <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
                <p className="text-sm font-mono text-red-400">
                  {error.message || "An unexpected error occurred"}
                </p>
              </div>

              {/* Error digest for support */}
              {error.digest && (
                <div className="text-sm text-gray-500">
                  Error ID: <span className="font-mono text-gray-400">{error.digest}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={reset}
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
                
                <Button
                  onClick={() => {
                    Sentry.showReportDialog({ 
                      eventId: Sentry.lastEventId(),
                      user: {
                        email: "user@example.com", // You can get this from user context
                      }
                    })
                  }}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Bug className="h-4 w-4" />
                  Report Issue
                </Button>
              </div>

              {/* Development mode - show stack trace */}
              {process.env.NODE_ENV === "development" && (
                <div className="mt-4">
                  <details className="space-y-2">
                    <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
                      Technical Details (Development Only)
                    </summary>
                    <div className="p-4 bg-gray-900 rounded-lg overflow-auto max-h-64">
                      <pre className="text-xs text-gray-400 whitespace-pre-wrap">
                        {error.stack}
                      </pre>
                    </div>
                  </details>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </body>
    </html>
  )
}