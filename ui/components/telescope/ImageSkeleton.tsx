"use client"

import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Camera, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageSkeletonProps {
  className?: string
  type?: 'loading' | 'connecting' | 'error' | 'offline'
  message?: string
  showProgress?: boolean
  progress?: number
}

export function ImageSkeleton({ 
  className,
  type = 'loading',
  message,
  showProgress = false,
  progress = 0
}: ImageSkeletonProps) {
  const getIcon = () => {
    switch (type) {
      case 'connecting':
        return <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      case 'error':
        return <WifiOff className="w-8 h-8 text-red-400" />
      case 'offline':
        return <WifiOff className="w-8 h-8 text-gray-500" />
      default:
        return <Camera className="w-8 h-8 text-gray-400" />
    }
  }

  const getMessage = () => {
    if (message) return message
    
    switch (type) {
      case 'connecting':
        return 'Connecting to telescope...'
      case 'error':
        return 'Connection failed'
      case 'offline':
        return 'Telescope offline'
      default:
        return 'Loading image...'
    }
  }

  const getProgressColor = () => {
    switch (type) {
      case 'connecting':
        return 'bg-blue-500'
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className={cn(
      "flex flex-col items-center justify-center w-full h-full bg-gray-800 rounded-lg border-2 border-dashed border-gray-600",
      className
    )}>
      {/* Animated background pattern */}
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800 animate-pulse" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcz4KICAgIDxwYXR0ZXJuIGlkPSJncmlkIiB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPgogICAgICA8cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDEwNywgMTE0LCAxMjgsIDAuMSkiIHN0cm9rZS13aWR0aD0iMSIvPgogICAgPC9wYXR0ZXJuPgogIDwvZGVmcz4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIiAvPgo8L3N2Zz4=')] opacity-20" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center space-y-4 p-8 text-center">
        {/* Icon with pulse animation */}
        <div className="relative">
          {getIcon()}
          {type === 'loading' && (
            <div className="absolute inset-0 animate-ping">
              <Camera className="w-8 h-8 text-gray-400 opacity-30" />
            </div>
          )}
        </div>

        {/* Loading text */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-300">
            {getMessage()}
          </p>
          
          {/* Progress bar */}
          {showProgress && (
            <div className="w-48 bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div 
                className={cn(
                  "h-full transition-all duration-300 ease-out rounded-full",
                  getProgressColor()
                )}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          )}
          
          {/* Animated dots for loading */}
          {type === 'loading' && (
            <div className="flex items-center justify-center space-x-1">
              <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>

        {/* Shimmer skeleton elements */}
        <div className="w-full max-w-xs space-y-2 mt-4">
          <Skeleton className="h-2 w-3/4 mx-auto bg-gray-700" />
          <Skeleton className="h-2 w-1/2 mx-auto bg-gray-700" />
        </div>
      </div>
    </div>
  )
}

// Specialized skeleton components
export const ConnectingSkeleton = (props: Omit<ImageSkeletonProps, 'type'>) => (
  <ImageSkeleton {...props} type="connecting" />
)

export const ErrorSkeleton = (props: Omit<ImageSkeletonProps, 'type'>) => (
  <ImageSkeleton {...props} type="error" />
)

export const OfflineSkeleton = (props: Omit<ImageSkeletonProps, 'type'>) => (
  <ImageSkeleton {...props} type="offline" />
)

export const LoadingSkeleton = (props: Omit<ImageSkeletonProps, 'type'>) => (
  <ImageSkeleton {...props} type="loading" />
)