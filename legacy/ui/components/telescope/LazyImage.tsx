"use client"

import React, { useState, useRef, useEffect } from 'react'
import { EnhancedImage } from './EnhancedImage'
import { ImageSkeleton } from './ImageSkeleton'
import { cn } from '@/lib/utils'

interface LazyImageProps {
  src: string
  alt?: string
  className?: string
  style?: React.CSSProperties
  
  // Lazy loading options
  rootMargin?: string
  threshold?: number
  placeholder?: string
  
  // Pass through to EnhancedImage
  onLoad?: () => void
  onError?: (error: string) => void
  showTimestamp?: boolean
  staleThreshold?: number
  autoRefresh?: boolean
  maxRetries?: number
  showRetryButton?: boolean
  fallbackSrc?: string
  
  // Image processing
  brightness?: number[]
  contrast?: number[]
  rotationAngle?: number
  zoomLevel?: number
  panPosition?: { x: number; y: number }
}

export function LazyImage({
  src,
  alt = 'Lazy loaded image',
  className,
  style,
  
  // Lazy loading options
  rootMargin = '50px',
  threshold = 0.1,
  placeholder,
  
  // Enhanced image props
  onLoad,
  onError,
  showTimestamp,
  staleThreshold,
  autoRefresh,
  maxRetries,
  showRetryButton,
  fallbackSrc,
  
  // Image processing
  brightness,
  contrast,
  rotationAngle,
  zoomLevel,
  panPosition
}: LazyImageProps) {
  
  const [isInView, setIsInView] = useState(false)
  const [shouldLoad, setShouldLoad] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Intersection Observer for lazy loading
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting) {
          setIsInView(true)
          setShouldLoad(true)
          observer.unobserve(container)
        }
      },
      {
        rootMargin,
        threshold
      }
    )

    observer.observe(container)

    return () => {
      observer.unobserve(container)
    }
  }, [rootMargin, threshold])

  // Force load if src changes and we're already in view
  useEffect(() => {
    if (isInView) {
      setShouldLoad(true)
    }
  }, [src, isInView])

  return (
    <div 
      ref={containerRef}
      className={cn("w-full h-full", className)}
      style={style}
    >
      {shouldLoad ? (
        <EnhancedImage
          src={src}
          alt={alt}
          className="w-full h-full"
          onLoad={onLoad}
          onError={onError}
          showTimestamp={showTimestamp}
          staleThreshold={staleThreshold}
          autoRefresh={autoRefresh}
          maxRetries={maxRetries}
          showRetryButton={showRetryButton}
          fallbackSrc={fallbackSrc}
          brightness={brightness}
          contrast={contrast}
          rotationAngle={rotationAngle}
          zoomLevel={zoomLevel}
          panPosition={panPosition}
        />
      ) : (
        <div className="w-full h-full">
          {placeholder ? (
            <img 
              src={placeholder} 
              alt={`${alt} placeholder`}
              className="w-full h-full object-cover opacity-50"
            />
          ) : (
            <ImageSkeleton 
              type="loading" 
              message="Preparing to load image..."
              className="w-full h-full"
            />
          )}
        </div>
      )}
    </div>
  )
}

// Image caching utility
class ImageCache {
  private cache = new Map<string, HTMLImageElement>()
  private maxSize = 50 // Maximum number of cached images
  
  preload(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      // Check if already cached
      if (this.cache.has(src)) {
        resolve(this.cache.get(src)!)
        return
      }
      
      const img = new Image()
      img.onload = () => {
        // Add to cache
        this.addToCache(src, img)
        resolve(img)
      }
      img.onerror = reject
      img.src = src
    })
  }
  
  private addToCache(src: string, img: HTMLImageElement) {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    
    this.cache.set(src, img)
  }
  
  clear() {
    this.cache.clear()
  }
  
  remove(src: string) {
    this.cache.delete(src)
  }
  
  has(src: string): boolean {
    return this.cache.has(src)
  }
}

export const imageCache = new ImageCache()

// Hook for image preloading
export function useImagePreloader(urls: string[]) {
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  
  const preloadImages = async (urlsToLoad: string[]) => {
    setLoading(true)
    setErrors([])
    
    const promises = urlsToLoad.map(async (url) => {
      try {
        await imageCache.preload(url)
        setLoadedUrls(prev => new Set([...prev, url]))
        return { url, success: true }
      } catch (error) {
        const errorMsg = `Failed to preload ${url}`
        setErrors(prev => [...prev, errorMsg])
        return { url, success: false, error: errorMsg }
      }
    })
    
    await Promise.allSettled(promises)
    setLoading(false)
  }
  
  useEffect(() => {
    if (urls.length > 0) {
      const urlsToLoad = urls.filter(url => !imageCache.has(url))
      if (urlsToLoad.length > 0) {
        preloadImages(urlsToLoad)
      }
    }
  }, [urls])
  
  return {
    loadedUrls,
    loading,
    errors,
    preloadImages
  }
}