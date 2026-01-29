import { useState, useEffect, useRef } from 'react'
import { Settings } from 'lucide-react'
import { useTelescopeStore } from '@/stores/telescopeStore'
import { VideoOverlays, defaultOverlaySettings, type OverlaySettings } from './VideoOverlays'
import { VideoOverlayControls } from './VideoOverlayControls'
import { Button } from './ui/button'

interface VideoFeedProps {
  telescopeId?: string
  className?: string
}

export function VideoFeed({ telescopeId, className = '' }: VideoFeedProps) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(defaultOverlaySettings)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
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

  const streamUrl = `/api/stream/${activeTelescopeId}`

  return (
    <div ref={containerRef} className={`relative bg-gray-900 rounded-lg overflow-hidden ${className}`}>
      {/* Video stream */}
      <img
        src={streamUrl}
        alt="Telescope live feed"
        className="w-full h-full object-contain"
        onError={() => {
          setError('Failed to load video stream')
          setIsStreaming(false)
        }}
        onLoad={() => {
          setIsStreaming(true)
          setError(null)
        }}
      />

      {/* Video Overlays */}
      {dimensions.width > 0 && dimensions.height > 0 && (
        <VideoOverlays width={dimensions.width} height={dimensions.height} settings={overlaySettings} />
      )}

      {/* Overlay Controls Dialog */}
      <VideoOverlayControls
        open={showControls}
        onOpenChange={setShowControls}
        settings={overlaySettings}
        onSettingsChange={setOverlaySettings}
      />

      {/* Status indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 px-3 py-2 rounded-lg">
        <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
        <span className="text-white text-sm font-medium">
          {isStreaming ? 'LIVE' : 'CONNECTING...'}
        </span>
      </div>

      {/* Overlay Controls Button */}
      <div className="absolute top-4 left-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowControls(true)}
          className="bg-black/50 hover:bg-black/70 text-white"
        >
          <Settings className="h-4 w-4" />
        </Button>
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
