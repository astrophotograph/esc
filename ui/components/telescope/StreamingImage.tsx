"use client"

import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface StreamingImageProps {
  src: string
  alt?: string
  className?: string
  style?: React.CSSProperties
  fallbackSrc?: string
  onError?: () => void
  onLoad?: () => void
}

/**
 * Component for displaying multipart streaming images
 * Handles connection management to prevent stream interruptions
 */
export function StreamingImage({
  src,
  alt = 'Streaming image',
  className,
  style,
  fallbackSrc = '/placeholder.svg',
  onError,
  onLoad
}: StreamingImageProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
  const [currentSrc, setCurrentSrc] = useState(src)

  // Update source when it changes, but with debouncing to prevent rapid reconnects
  useEffect(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    // Debounce source changes
    reconnectTimeoutRef.current = setTimeout(() => {
      setCurrentSrc(src)
      setError(false)
      setLoaded(false)
    }, 100)

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [src])

  const handleError = () => {
    console.warn(`Stream error for ${src}, will retry...`)
    setError(true)
    onError?.()

    // Attempt to reconnect after a delay
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    reconnectTimeoutRef.current = setTimeout(() => {
      // Force reload by adding timestamp
      setCurrentSrc(`${src}${src.includes('?') ? '&' : '?'}_retry=${Date.now()}`)
      setError(false)
    }, 2000) // Wait 2 seconds before retry
  }

  const handleLoad = () => {
    setLoaded(true)
    setError(false)
    onLoad?.()
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [])

  if (error && fallbackSrc) {
    return (
      <img
        src={fallbackSrc}
        alt={alt}
        className={cn(className, 'opacity-50')}
        style={style}
      />
    )
  }

  return (
    <>
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        className={cn(
          className,
          !loaded && 'opacity-0',
          loaded && 'opacity-100 transition-opacity duration-300'
        )}
        style={style}
        onError={handleError}
        onLoad={handleLoad}
      />
      {!loaded && !error && (
        <div
          className={cn(
            "absolute inset-0 bg-muted animate-pulse",
            className
          )}
          style={style}
        />
      )}
    </>
  )
}