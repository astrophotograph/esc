import { useState, useEffect, useRef } from 'react'
import { useTelescopeStore } from '@/stores/telescopeStore'
import { VideoOverlays, defaultOverlaySettings, type OverlaySettings } from './VideoOverlays'
import { RandomTestPattern } from './RandomTestPattern'
import { invoke } from '@/services/api'

interface StreamStatus {
  ra?: number
  dec?: number
  stage?: string
  focusPosition?: number
}

interface VideoFeedProps {
  telescopeId?: string
  className?: string
  zoom?: number
  rotation?: number
  panPosition?: { x: number; y: number }
  onPanChange?: (pan: { x: number; y: number }) => void
}

export function VideoFeed({
  telescopeId,
  className = '',
  zoom = 1,
  rotation = 0,
  panPosition = { x: 0, y: 0 },
  onPanChange
}: VideoFeedProps) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [overlaySettings] = useState<OverlaySettings>(defaultOverlaySettings)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const currentTelescopeId = useTelescopeStore(state => state.currentTelescopeId)
  const telescopes = useTelescopeStore(state => state.telescopes)

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  const activeTelescopeId = telescopeId || currentTelescopeId

  // Fetch stream status periodically to check for Idle state
  useEffect(() => {
    if (!activeTelescopeId) {
      setStreamStatus(null)
      return
    }

    const fetchStatus = async () => {
      try {
        const result = await invoke<StreamStatus>('get_telescope_status', {
          telescopeId: activeTelescopeId,
        })
        setStreamStatus(result)
      } catch (error) {
        // Silently ignore errors - telescope may not be in backend state yet
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 2000)

    return () => clearInterval(interval)
  }, [activeTelescopeId])

  // Get connection status of the active telescope
  const activeTelescope = telescopes.find(t => t.id === activeTelescopeId)
  const isConnected = activeTelescope?.status === 'connected'
  const isConnecting = activeTelescope?.status === 'connecting'

  useEffect(() => {
    if (!activeTelescopeId) {
      setError('No telescope selected')
      setIsStreaming(false)
      return
    }

    if (!isConnected) {
      // Don't try to stream if not connected
      setIsStreaming(false)
      if (isConnecting) {
        setError(null) // Clear error while connecting
      }
      return
    }

    // Clear error when starting stream (only when connected)
    setError(null)
    setIsStreaming(true)

    // Cleanup function
    return () => {
      setIsStreaming(false)
    }
  }, [activeTelescopeId, isConnected, isConnecting])

  if (!activeTelescopeId) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 rounded-lg ${className}`}>
        <div className="text-center text-gray-400">
          <p className="text-lg">No telescope selected</p>
          <p className="text-sm mt-2">Please add and connect a telescope to view live feed</p>
        </div>
      </div>
    )
  }

  // Show connecting state
  if (isConnecting) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 rounded-lg ${className}`}>
        <div className="text-center text-gray-400">
          <div className="animate-spin w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-lg">Connecting to telescope...</p>
          <p className="text-sm mt-2 font-mono">{activeTelescopeId}</p>
        </div>
      </div>
    )
  }

  // Show not connected state
  if (!isConnected) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 rounded-lg ${className}`}>
        <div className="text-center text-gray-400">
          <p className="text-lg">Telescope not connected</p>
          <p className="text-sm mt-2">Select the telescope and click to connect</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 rounded-lg ${className}`}>
        <div className="text-center text-red-400">
          <p className="text-lg">Stream Error</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    )
  }

  // Check if telescope is in Idle state (or similar non-imaging states) - show test pattern
  // Only show for specific idle stages, NOT for active imaging modes like ContinuousExposure, Stack, RTSP
  const isIdle = streamStatus?.stage === 'Idle'

  const streamUrl = `/api/stream/${encodeURIComponent(activeTelescopeId)}`

  // Debug logging
  console.log(`[VideoFeed] Rendering: isIdle=${isIdle}, isConnected=${isConnected}, url=${streamUrl}`)

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    console.log(`[VideoFeed] Image loaded: ${img.naturalWidth}x${img.naturalHeight}`)
    if (img.naturalWidth && img.naturalHeight) {
      const ratio = img.naturalWidth / img.naturalHeight
      setImageAspectRatio(ratio)
    }
    setIsStreaming(true)
    setError(null)
  }

  // Calculate pan boundaries based on zoom level
  const calculateBoundaries = () => {
    if (!containerRef.current) return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
    const containerWidth = containerRef.current.clientWidth
    const containerHeight = containerRef.current.clientHeight
    const maxPanX = (containerWidth / 2) * (zoom - 1)
    const maxPanY = (containerHeight / 2) * (zoom - 1)
    return {
      minX: -maxPanX,
      maxX: maxPanX,
      minY: -maxPanY,
      maxY: maxPanY
    }
  }

  // Constrain pan position within boundaries
  const constrainPan = (x: number, y: number) => {
    const boundaries = calculateBoundaries()
    return {
      x: Math.max(boundaries.minX, Math.min(boundaries.maxX, x)),
      y: Math.max(boundaries.minY, Math.min(boundaries.maxY, y))
    }
  }

  // Transform delta coordinates based on rotation angle
  const transformDeltaForRotation = (dx: number, dy: number) => {
    const angleRad = (rotation * Math.PI) / 180
    const cos = Math.cos(angleRad)
    const sin = Math.sin(angleRad)
    return {
      x: dx * cos + dy * sin,
      y: -dx * sin + dy * cos
    }
  }

  // Handle mouse down for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  // Handle mouse move for panning
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return
    e.preventDefault()

    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    const transformedDelta = transformDeltaForRotation(dx, dy)

    const newPan = constrainPan(
      panPosition.x + transformedDelta.x / zoom,
      panPosition.y + transformedDelta.y / zoom
    )

    onPanChange?.(newPan)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  // Handle mouse up for panning
  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Handle touch events for mobile panning
  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoom <= 1 || e.touches.length !== 1) return
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || zoom <= 1 || e.touches.length !== 1) return
    e.preventDefault()

    const dx = e.touches[0].clientX - dragStart.x
    const dy = e.touches[0].clientY - dragStart.y
    const transformedDelta = transformDeltaForRotation(dx, dy)

    const newPan = constrainPan(
      panPosition.x + transformedDelta.x / zoom,
      panPosition.y + transformedDelta.y / zoom
    )

    onPanChange?.(newPan)
    setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY })
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  // Get status text for test pattern
  const getStatusText = () => {
    if (streamStatus?.stage === 'Idle') {
      return 'Telescope is idle - waiting for imaging to start'
    }
    return undefined
  }

  return (
    <div
      ref={containerRef}
      className={`bg-black rounded-lg overflow-hidden ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Show test pattern when idle, otherwise show video stream */}
      {isIdle ? (
        <RandomTestPattern
          width={dimensions.width || 800}
          height={dimensions.height || 600}
          className="w-full h-full"
          statusText={getStatusText()}
        />
      ) : (
        <>
          {/* Video stream - uses flexbox centering with constrained dimensions */}
          <img
            ref={imgRef}
            src={streamUrl}
            alt="Telescope live feed"
            draggable={false}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              transform: `scale(${zoom}) rotate(${rotation}deg) translate(${panPosition.x}px, ${panPosition.y}px)`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              userSelect: 'none'
            }}
            onError={(e) => {
              console.error('[VideoFeed] Stream error:', e, 'URL:', streamUrl)
              setError('Failed to load video stream')
              setIsStreaming(false)
            }}
            onLoad={handleImageLoad}
          />

          {/* Video Overlays - positioned over the image area */}
          {imageAspectRatio && dimensions.width > 0 && dimensions.height > 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div
                style={{
                  width: imageAspectRatio > (dimensions.width / dimensions.height)
                    ? '100%'
                    : `${dimensions.height * imageAspectRatio}px`,
                  height: imageAspectRatio > (dimensions.width / dimensions.height)
                    ? `${dimensions.width / imageAspectRatio}px`
                    : '100%',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  position: 'relative'
                }}
              >
                <VideoOverlays
                  width={imageAspectRatio > (dimensions.width / dimensions.height)
                    ? dimensions.width
                    : dimensions.height * imageAspectRatio}
                  height={imageAspectRatio > (dimensions.width / dimensions.height)
                    ? dimensions.width / imageAspectRatio
                    : dimensions.height}
                  settings={overlaySettings}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Status indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 px-3 py-2 rounded-lg">
        <div className={`w-2 h-2 rounded-full ${isIdle ? 'bg-yellow-500' : isStreaming ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-white text-sm font-medium">
          {isIdle ? 'IDLE' : isStreaming ? 'LIVE' : 'CONNECTING...'}
        </span>
      </div>

      {/* Telescope ID badge */}
      <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-2 rounded-lg">
        <span className="text-white text-sm font-mono">
          {activeTelescopeId}
        </span>
      </div>
    </div>
  )
}
