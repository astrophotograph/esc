"use client"

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { RefreshCw, Clock, WifiOff, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ImageSkeleton } from './ImageSkeleton'
import { toast } from 'sonner'

interface EnhancedImageProps {
  src: string
  alt?: string
  className?: string
  style?: React.CSSProperties
  onLoad?: () => void
  onError?: (error: string) => void
  onLoadStart?: () => void
  
  // Enhanced features
  showTimestamp?: boolean
  staleThreshold?: number // minutes
  autoRefresh?: boolean
  refreshInterval?: number // minutes
  maxRetries?: number
  retryDelay?: number // milliseconds
  showProgress?: boolean
  showRetryButton?: boolean
  fallbackSrc?: string
  
  // Image processing
  brightness?: number[]
  contrast?: number[]
  rotationAngle?: number
  zoomLevel?: number
  panPosition?: { x: number; y: number }
}

interface ImageState {
  loading: boolean
  error: string | null
  retryCount: number
  lastLoadTime: Date | null
  isStale: boolean
  progress: number
}

export function EnhancedImage({
  src,
  alt = 'Enhanced image',
  className,
  style,
  onLoad,
  onError,
  onLoadStart,
  
  // Enhanced features
  showTimestamp = true,
  staleThreshold = 5, // 5 minutes default
  autoRefresh = false,
  refreshInterval = 30, // 30 seconds default
  maxRetries = 3,
  retryDelay = 1000,
  showProgress = true,
  showRetryButton = true,
  fallbackSrc,
  
  // Image processing
  brightness = [0],
  contrast = [0],
  rotationAngle = 0,
  zoomLevel = 1,
  panPosition = { x: 0, y: 0 }
}: EnhancedImageProps) {
  
  const imgRef = useRef<HTMLImageElement>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const staleCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  const [state, setState] = useState<ImageState>({
    loading: true,
    error: null,
    retryCount: 0,
    lastLoadTime: null,
    isStale: false,
    progress: 0
  })

  // Calculate if image is stale
  const checkStaleStatus = useCallback(() => {
    if (!state.lastLoadTime) return false
    const now = new Date()
    const timeDiff = (now.getTime() - state.lastLoadTime.getTime()) / (1000 * 60) // minutes
    return timeDiff > staleThreshold
  }, [state.lastLoadTime, staleThreshold])

  // Update stale status
  useEffect(() => {
    const updateStaleStatus = () => {
      const isStale = checkStaleStatus()
      if (isStale !== state.isStale) {
        setState(prev => ({ ...prev, isStale }))
      }
    }

    // Check stale status every minute
    staleCheckIntervalRef.current = setInterval(updateStaleStatus, 60000)
    updateStaleStatus() // Check immediately

    return () => {
      if (staleCheckIntervalRef.current) {
        clearInterval(staleCheckIntervalRef.current)
      }
    }
  }, [checkStaleStatus, state.isStale])

  // Auto refresh functionality
  useEffect(() => {
    if (!autoRefresh || state.loading || state.error) return

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
      
      refreshTimeoutRef.current = setTimeout(() => {
        handleRefresh()
      }, refreshInterval * 1000)
    }

    scheduleRefresh()

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [autoRefresh, refreshInterval, state.loading, state.error])

  // Handle image load success
  const handleLoad = useCallback(() => {
    setState(prev => ({
      ...prev,
      loading: false,
      error: null,
      retryCount: 0,
      lastLoadTime: new Date(),
      isStale: false,
      progress: 100
    }))
    
    onLoad?.()
  }, [onLoad])

  // Handle image load error with retry logic
  const handleError = useCallback(() => {
    const errorMessage = `Failed to load image (attempt ${state.retryCount + 1}/${maxRetries})`
    
    setState(prev => ({
      ...prev,
      loading: false,
      error: errorMessage,
      progress: 0
    }))

    // Retry logic
    if (state.retryCount < maxRetries) {
      const delay = retryDelay * Math.pow(2, state.retryCount) // Exponential backoff
      
      retryTimeoutRef.current = setTimeout(() => {
        setState(prev => ({
          ...prev,
          loading: true,
          error: null,
          retryCount: prev.retryCount + 1,
          progress: 0
        }))
        
        // Force reload with cache busting
        if (imgRef.current) {
          const timestamp = Date.now()
          const separator = src.includes('?') ? '&' : '?'
          imgRef.current.src = `${src}${separator}_t=${timestamp}`
        }
      }, delay)
    } else {
      // Max retries exceeded
      const finalError = `Failed to load image after ${maxRetries} attempts`
      setState(prev => ({ ...prev, error: finalError }))
      onError?.(finalError)
      
      // Try fallback if available
      if (fallbackSrc && imgRef.current) {
        imgRef.current.src = fallbackSrc
      }
    }
  }, [state.retryCount, maxRetries, retryDelay, src, fallbackSrc, onError])

  // Handle load start
  const handleLoadStart = useCallback(() => {
    setState(prev => ({ ...prev, loading: true, progress: 10 }))
    onLoadStart?.()
  }, [onLoadStart])

  // Manual refresh function
  const handleRefresh = useCallback(() => {
    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      retryCount: 0,
      progress: 0
    }))
    
    if (imgRef.current) {
      const timestamp = Date.now()
      const separator = src.includes('?') ? '&' : '?'
      imgRef.current.src = `${src}${separator}_refresh=${timestamp}`
    }
  }, [src])

  // Progress simulation (since we can't get real progress from img elements)
  useEffect(() => {
    if (!state.loading || state.error) return

    const interval = setInterval(() => {
      setState(prev => {
        if (prev.progress < 90) {
          return { ...prev, progress: prev.progress + Math.random() * 10 }
        }
        return prev
      })
    }, 200)

    return () => clearInterval(interval)
  }, [state.loading, state.error])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
      if (staleCheckIntervalRef.current) clearInterval(staleCheckIntervalRef.current)
    }
  }, [])

  // Calculate transform styles
  const getTransformStyle = () => {
    const brightnessValue = brightness[0] || 0
    const contrastValue = contrast[0] || 0
    
    return {
      transform: `
        translate(${panPosition.x}px, ${panPosition.y}px) 
        scale(${zoomLevel}) 
        rotate(${rotationAngle}deg)
      `,
      filter: `
        brightness(${100 + brightnessValue}%) 
        contrast(${100 + contrastValue}%)
      `,
      ...style
    }
  }

  return (
    <div className={cn("relative", className)}>
      {/* Always render the image element */}
      <img
        ref={imgRef}
        src={state.error && fallbackSrc ? fallbackSrc : src}
        alt={alt}
        className="w-full h-full object-cover"
        style={getTransformStyle()}
        onLoad={handleLoad}
        onError={handleError}
        onLoadStart={handleLoadStart}
      />

      {/* Only show loading overlay on initial load, not on refresh */}
      {state.loading && !state.lastLoadTime && showProgress && (
        <div className="absolute inset-0">
          <ImageSkeleton 
            type="loading" 
            showProgress={showProgress}
            progress={state.progress}
            message={state.retryCount > 0 ? `Retrying... (${state.retryCount}/${maxRetries})` : undefined}
          />
        </div>
      )}

      {/* Show error overlay when error occurs and no fallback */}
      {state.error && !fallbackSrc && (
        <div className="absolute inset-0">
          <ImageSkeleton type="error" message={state.error} />
          {showRetryButton && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Button
                onClick={handleRefresh}
                variant="outline"
                size="sm"
                className="bg-gray-800/80 backdrop-blur-sm border-red-500/50 text-red-400 hover:bg-red-500/10"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Timestamp and status indicators */}
      {showTimestamp && state.lastLoadTime && (
        <div className="absolute top-2 left-2 flex items-center gap-2">
          <Badge 
            variant={state.isStale ? "destructive" : "secondary"}
            className="text-xs bg-black/50 backdrop-blur-sm"
          >
            <Clock className="w-3 h-3 mr-1" />
            {state.lastLoadTime.toLocaleTimeString()}
          </Badge>
          
          {state.isStale && (
            <Badge variant="outline" className="text-xs bg-orange-500/20 border-orange-500 text-orange-400">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Stale
            </Badge>
          )}
          
          {autoRefresh && (
            <Badge variant="outline" className="text-xs bg-blue-500/20 border-blue-500 text-blue-400">
              Auto-refresh
            </Badge>
          )}
        </div>
      )}

      {/* Manual refresh button */}
      {showRetryButton && (
        <Button
          onClick={handleRefresh}
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm hover:bg-black/70"
          disabled={state.loading}
        >
          <RefreshCw className={cn("w-4 h-4", state.loading && "animate-spin")} />
        </Button>
      )}

      {/* Connection lost overlay */}
      {state.error && fallbackSrc && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="text-center text-white">
            <WifiOff className="w-8 h-8 mx-auto mb-2 text-red-400" />
            <p className="text-sm">Using fallback image</p>
          </div>
        </div>
      )}
    </div>
  )
}