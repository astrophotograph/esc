"use client"

import { useEffect, useState } from "react"
import { X, Map, Minimize2, Maximize2, Expand, Minimize } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface StarmapWindowProps {
  ra: number | null
  dec: number | null
  visible: boolean
  onClose: () => void
  size: "small" | "medium" | "large" | "extra-large"
  onSizeChange: (size: "small" | "medium" | "large" | "extra-large") => void
  fullscreen: boolean
  onFullscreenChange: (fullscreen: boolean) => void
  minimized: boolean
  onMinimizedChange: (minimized: boolean) => void
  className?: string
}

export function StarmapWindow({ 
  ra, 
  dec, 
  visible, 
  onClose, 
  size, 
  onSizeChange, 
  fullscreen, 
  onFullscreenChange, 
  minimized, 
  onMinimizedChange, 
  className = "" 
}: StarmapWindowProps) {
  const [starmapImage, setStarmapImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0)
  const [lastCoordinates, setLastCoordinates] = useState<{ ra: number | null, dec: number | null }>({ ra: null, dec: null })

  // Size configurations
  const sizeConfig = {
    small: { width: 200, height: 150, imageWidth: 300, imageHeight: 225 },
    medium: { width: 320, height: 240, imageWidth: 400, imageHeight: 300 },
    large: { width: 480, height: 360, imageWidth: 600, imageHeight: 450 },
    "extra-large": { width: 640, height: 480, imageWidth: 800, imageHeight: 600 },
  }

  const currentSize = fullscreen 
    ? { width: window.innerWidth, height: window.innerHeight, imageWidth: 800, imageHeight: 600 } 
    : sizeConfig[size]

  useEffect(() => {
    // Only fetch starmap when RA and Dec are not zero/null and window is visible
    if (!visible || ra === null || dec === null || (ra === 0 && dec === 0)) {
      setStarmapImage(null)
      return
    }

    // Check if coordinates have actually changed (avoid unnecessary updates)
    // Note: Size changes will trigger a re-fetch through useEffect dependencies
    const coordinatesChanged = lastCoordinates.ra !== ra || lastCoordinates.dec !== dec
    if (!coordinatesChanged && starmapImage) {
      return
    }

    // Throttle updates to prevent excessive API calls when telescope is moving
    const now = Date.now()
    const timeSinceLastUpdate = now - lastUpdateTime
    const THROTTLE_DELAY = 2000 // 2 seconds

    const fetchStarmap = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const response = await fetch(`/api/starmap?ra=${ra}&dec=${dec}&width=${currentSize.imageWidth}&height=${currentSize.imageHeight}`)
        
        if (!response.ok) {
          throw new Error(`Failed to fetch starmap: ${response.status}`)
        }
        
        const data = await response.json()
        setStarmapImage(data.image)
        setLastUpdateTime(Date.now())
        setLastCoordinates({ ra, dec })
      } catch (err) {
        console.error('Error fetching starmap:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    if (timeSinceLastUpdate >= THROTTLE_DELAY) {
      fetchStarmap()
    } else {
      // Schedule fetch after remaining throttle time
      const timeoutId = setTimeout(fetchStarmap, THROTTLE_DELAY - timeSinceLastUpdate)
      return () => clearTimeout(timeoutId)
    }
  }, [ra, dec, visible, lastUpdateTime, size, fullscreen])

  // Don't render anything if not visible
  if (!visible) {
    return null
  }

  return (
    <div 
      className={`${fullscreen 
        ? "fixed inset-0 z-50 bg-black/95 backdrop-blur-sm" 
        : "absolute bottom-4 left-4 bg-black/90 backdrop-blur-sm rounded-lg border border-gray-600"
      } ${className}`}
      style={fullscreen ? {} : { width: currentSize.width }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-600">
        <h3 className="font-semibold text-blue-400 flex items-center gap-2">
          <Map className="w-4 h-4" />
          Star Map
        </h3>
        
        <div className="flex items-center gap-1 flex-shrink-0">
          {!minimized && (
            <>
              {/* Size Selector */}
              <Select value={size} onValueChange={onSizeChange}>
                <SelectTrigger className={`h-6 text-xs bg-gray-600 border-gray-500 ${
                  size === "small" ? "w-12" : size === "medium" ? "w-14" : "w-16"
                }`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  <SelectItem value="small">S</SelectItem>
                  <SelectItem value="medium">M</SelectItem>
                  <SelectItem value="large">L</SelectItem>
                  <SelectItem value="extra-large">XL</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          {/* Fullscreen Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFullscreenChange(!fullscreen)}
            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
            title={fullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {fullscreen ? <Minimize className="h-3 w-3" /> : <Expand className="h-3 w-3" />}
          </Button>

          {/* Minimize/Maximize Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMinimizedChange(!minimized)}
            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
            title={minimized ? "Maximize" : "Minimize"}
          >
            {minimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
          </Button>

          {/* Close Button */}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
            title="Close Star Map"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {!minimized && (
        <div className={`p-3 ${fullscreen ? 'h-full flex flex-col' : ''}`}>
          {ra === null || dec === null || (ra === 0 && dec === 0) ? (
            <div className="text-center text-gray-400 py-4">
              <Map className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No telescope coordinates</p>
              <p className="text-xs text-gray-500">Point telescope to see star map</p>
            </div>
          ) : (
            <>
              {loading && (
                <div className="text-center text-gray-300 py-4">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <p className="text-sm">Loading star map...</p>
                </div>
              )}
              
              {error && (
                <div className="text-center text-red-300 py-4">
                  <p className="text-sm">Error loading star map</p>
                  <p className="text-xs text-gray-400">{error}</p>
                </div>
              )}
              
              {starmapImage && !loading && (
                <div className={`space-y-3 ${fullscreen ? 'flex-1 flex flex-col' : ''}`}>
                  <div className={`relative bg-gray-800 rounded-md overflow-hidden ${fullscreen ? 'flex-1' : ''}`}>
                    <img
                      src={starmapImage}
                      alt={`Star map for RA: ${ra?.toFixed(4)}, Dec: ${dec?.toFixed(4)}`}
                      className={`w-full object-cover ${fullscreen ? 'h-full' : ''}`}
                      style={fullscreen ? {} : { height: currentSize.height - 120 }} // Account for header and padding
                    />
                  </div>
                  <div className="text-center text-gray-300 text-xs">
                    RA: {ra?.toFixed(4)}°, Dec: {dec?.toFixed(4)}°
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Export both names for backward compatibility
export { StarmapWindow as StarmapOverlay }