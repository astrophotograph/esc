"use client"

import React, { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  children: ReactNode
  fallbackTitle?: string
  fallbackDescription?: string
  onRetry?: () => void
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
}

export class ImageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error to console for debugging
    console.error('ImageErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error boundary when children change (e.g., telescope switch)
    if (prevProps.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false, error: undefined, errorInfo: undefined })
    }
  }

  handleRetry = () => {
    // Reset the error boundary
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
    
    // Call optional retry callback
    if (this.props.onRetry) {
      this.props.onRetry()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="bg-gray-800 border-red-500/50">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-red-500/20 rounded-full">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
            </div>
            <CardTitle className="text-red-400">
              {this.props.fallbackTitle || 'Image Component Error'}
            </CardTitle>
            <CardDescription className="text-gray-400">
              {this.props.fallbackDescription || 
                'Something went wrong while displaying the image. This could be due to a network issue or a problem with the image source.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <Button 
              onClick={this.handleRetry}
              variant="outline"
              className="border-red-500 text-red-400 hover:bg-red-500/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-left mt-4">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                  Error Details (Development Only)
                </summary>
                <pre className="mt-2 p-2 bg-gray-900 rounded text-xs text-red-300 overflow-auto max-h-32">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack && (
                    <>
                      {'\n\nComponent Stack:'}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}

// Higher-order component wrapper for easy use
export function withImageErrorBoundary<T extends object>(
  Component: React.ComponentType<T>,
  fallbackProps?: Partial<Props>
) {
  const WrappedComponent = (props: T) => (
    <ImageErrorBoundary {...fallbackProps}>
      <Component {...props} />
    </ImageErrorBoundary>
  )
  
  WrappedComponent.displayName = `withImageErrorBoundary(${Component.displayName || Component.name})`
  
  return WrappedComponent
}