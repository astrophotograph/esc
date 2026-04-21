import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Minimize2, Maximize2, Expand, Minimize, Settings, Camera } from 'lucide-react'
import { Button } from './ui/button'
import { VideoOverlays, defaultOverlaySettings, type OverlaySettings } from './VideoOverlays'
import { VideoOverlayControls } from './VideoOverlayControls'
import { useTelescopeStore } from '@/stores/telescopeStore'
import { runtime } from '../services/api'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

type PipSize = 'small' | 'medium' | 'large' | 'extra-large'
type CameraSource = 'primary' | 'allsky' | 'guide' | 'finder'

interface PictureInPictureProps {
  show: boolean
  onClose: () => void
  telescopeId?: string
}

const SIZE_CONFIG = {
  small: { width: 200, height: 150 },
  medium: { width: 320, height: 240 },
  large: { width: 480, height: 360 },
  'extra-large': { width: 640, height: 480 },
}

export function PictureInPicture({ show, onClose, telescopeId }: PictureInPictureProps) {
  const [position, setPosition] = useState({ x: 100, y: 100 })
  const [size, setSize] = useState<PipSize>('medium')
  const [minimized, setMinimized] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [camera, setCamera] = useState<CameraSource>('primary')
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [showControls, setShowControls] = useState(false)
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(defaultOverlaySettings)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const pipRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLDivElement>(null)

  // Get telescope connection status
  const telescopes = useTelescopeStore(state => state.telescopes)
  const activeTelescope = telescopes.find(t => t.id === telescopeId)
  const isConnected = activeTelescope?.status === 'connected'

  const currentSize = fullscreen
    ? { width: window.innerWidth, height: window.innerHeight }
    : SIZE_CONFIG[size]

  // Update dimensions when size changes
  useEffect(() => {
    if (videoRef.current && !minimized) {
      setDimensions({
        width: videoRef.current.clientWidth,
        height: videoRef.current.clientHeight
      })
    }
  }, [size, minimized, fullscreen])

  // Handle escape key for fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) {
        setFullscreen(false)
      }
    }

    if (fullscreen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [fullscreen])

  // Dragging handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (minimized || fullscreen) return

    setIsDragging(true)
    const rect = pipRef.current?.getBoundingClientRect()
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
    }
  }, [minimized, fullscreen])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return

    const headerHeight = 40
    const totalHeight = minimized ? headerHeight : currentSize.height + headerHeight
    const maxX = window.innerWidth - currentSize.width
    const maxY = window.innerHeight - totalHeight

    setPosition({
      x: Math.max(0, Math.min(maxX, e.clientX - dragOffset.x)),
      y: Math.max(0, Math.min(maxY, e.clientY - dragOffset.y)),
    })
  }, [isDragging, dragOffset, minimized, currentSize])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Keep PiP in bounds on window resize
  useEffect(() => {
    const handleResize = () => {
      if (fullscreen) return

      const headerHeight = 40
      const totalHeight = minimized ? headerHeight : currentSize.height + headerHeight
      const maxX = window.innerWidth - currentSize.width
      const maxY = window.innerHeight - totalHeight

      setPosition(prev => ({
        x: Math.max(0, Math.min(maxX, prev.x)),
        y: Math.max(0, Math.min(maxY, prev.y)),
      }))
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => window.removeEventListener('resize', handleResize)
  }, [currentSize, fullscreen, minimized])

  // Get camera feed URL
  const getCameraFeed = () => {
    if (!telescopeId) return ''

    switch (camera) {
      case 'primary':
        // Only return stream URL if telescope is connected
        if (!isConnected) {
          return `/placeholder.svg?height=${currentSize.height}&width=${currentSize.width}&text=Not%20Connected`
        }
        return runtime.isTauri
          ? `http://localhost:9847/stream/${encodeURIComponent(telescopeId)}`
          : `/stream/${encodeURIComponent(telescopeId)}`
      case 'allsky':
        return `/placeholder.svg?height=${currentSize.height}&width=${currentSize.width}&text=All-Sky`
      case 'guide':
        return `/placeholder.svg?height=${currentSize.height}&width=${currentSize.width}&text=Guide`
      case 'finder':
        return `/placeholder.svg?height=${currentSize.height}&width=${currentSize.width}&text=Finder`
      default:
        return ''
    }
  }

  if (!show) return null

  return (
    <>
      <div
        ref={pipRef}
        className={`fixed z-[9999] bg-card shadow-2xl border border-border ${
          fullscreen ? 'inset-0 rounded-none' : 'rounded-lg'
        }`}
        style={fullscreen ? {
          left: 0,
          top: 0,
          width: '100vw',
          height: '100vh',
          cursor: 'default',
        } : {
          left: position.x,
          top: position.y,
          width: minimized ? 200 : currentSize.width,
          height: minimized ? 40 : currentSize.height + 40,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-1 bg-muted min-w-0 ${
            fullscreen ? 'rounded-none cursor-default' : 'rounded-t-lg cursor-grab'
          }`}
          onMouseDown={fullscreen ? undefined : handleMouseDown}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Camera className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {(size === 'large' || size === 'extra-large') && (
              <span className="text-sm text-muted-foreground font-medium truncate">
                {camera.charAt(0).toUpperCase() + camera.slice(1)} Camera
              </span>
            )}
            {size === 'medium' && (
              <span className="text-xs text-muted-foreground font-medium truncate">
                {camera.charAt(0).toUpperCase() + camera.slice(1)}
              </span>
            )}
            {!minimized && (size === 'large' || size === 'extra-large') && (
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                {overlaySettings.crosshairs.enabled && (
                  <div className="w-2 h-2 bg-red-400 rounded-full" title="Crosshairs Active" />
                )}
                {overlaySettings.grid.enabled && (
                  <div className="w-2 h-2 bg-green-400 rounded-full" title="Grid Active" />
                )}
                {overlaySettings.measurements.enabled && (
                  <div className="w-2 h-2 bg-yellow-400 rounded-full" title="Measurements Active" />
                )}
                {overlaySettings.compass.enabled && (
                  <div className="w-2 h-2 bg-cyan-400 rounded-full" title="Compass Active" />
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {!minimized && (
              <>
                {/* Camera Selector */}
                {(size === 'medium' || size === 'large' || size === 'extra-large') && (
                  <Select value={camera} onValueChange={(value: CameraSource) => setCamera(value)}>
                    <SelectTrigger className={`h-6 text-xs ${size === 'medium' ? 'w-14' : 'w-20'}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="primary">Primary</SelectItem>
                      <SelectItem value="allsky">All-Sky</SelectItem>
                      <SelectItem value="guide">Guide</SelectItem>
                      <SelectItem value="finder">Finder</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {/* Size Selector */}
                <Select value={size} onValueChange={(value: PipSize) => {
                  setSize(value)
                  const newSize = SIZE_CONFIG[value]
                  const maxX = window.innerWidth - newSize.width
                  const maxY = window.innerHeight - newSize.height - 40
                  setPosition(prev => ({
                    x: Math.max(0, Math.min(maxX, prev.x)),
                    y: Math.max(0, Math.min(maxY, prev.y)),
                  }))
                }}>
                  <SelectTrigger className={`h-6 text-xs bg-gray-600 border-gray-500 ${
                    size === 'small' ? 'w-12' : size === 'medium' ? 'w-14' : 'w-16'
                  }`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">S</SelectItem>
                    <SelectItem value="medium">M</SelectItem>
                    <SelectItem value="large">L</SelectItem>
                    <SelectItem value="extra-large">XL</SelectItem>
                  </SelectContent>
                </Select>

                {/* Settings Button */}
                {size === 'extra-large' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowControls(true)}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    title="Overlay Settings"
                  >
                    <Settings className="h-3 w-3" />
                  </Button>
                )}
              </>
            )}

            {/* Fullscreen Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFullscreen(!fullscreen)}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title={fullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {fullscreen ? <Minimize className="h-3 w-3" /> : <Expand className="h-3 w-3" />}
            </Button>

            {/* Minimize/Maximize Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMinimized(!minimized)}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title={minimized ? 'Maximize' : 'Minimize'}
            >
              {minimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
            </Button>

            {/* Close Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title="Close PiP"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Camera View */}
        {!minimized && (
          <div
            ref={videoRef}
            className={`relative bg-muted overflow-hidden ${
              fullscreen ? 'rounded-none' : 'rounded-b-lg'
            }`}
            style={{
              width: currentSize.width,
              height: currentSize.height,
            }}
          >
            {/* Camera Feed */}
            <img
              src={getCameraFeed() || '/placeholder.svg'}
              alt={`${camera} camera feed`}
              className="w-full h-full object-cover"
            />

            {/* Overlays */}
            {dimensions.width > 0 && dimensions.height > 0 && (
              <VideoOverlays
                width={dimensions.width}
                height={dimensions.height}
                settings={overlaySettings}
              />
            )}

            {/* Status Bar */}
            <div className="absolute bottom-2 left-2 right-2 bg-background/70 rounded px-2 py-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono">
                    {currentSize.width}×{currentSize.height}
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="capitalize">{camera}</span>
                </div>
                <div className="flex items-center gap-1">
                  {overlaySettings.crosshairs.enabled && <span className="text-red-400 text-xs">⊕</span>}
                  {overlaySettings.grid.enabled && <span className="text-green-400 text-xs">⊞</span>}
                  {overlaySettings.measurements.enabled && <span className="text-yellow-400 text-xs">📏</span>}
                  {overlaySettings.compass.enabled && <span className="text-cyan-400 text-xs">🧭</span>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Overlay Controls Dialog */}
      <VideoOverlayControls
        open={showControls}
        onOpenChange={setShowControls}
        settings={overlaySettings}
        onSettingsChange={setOverlaySettings}
      />
    </>
  )
}
