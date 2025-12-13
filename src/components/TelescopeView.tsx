import { useState, useRef } from 'react'
import { ZoomIn, ZoomOut, Maximize2, Sparkles, Filter } from 'lucide-react'
import { Button } from './ui/button'
import { VideoFeed } from './VideoFeed'
import { AllskyPanel } from './AllskyPanel'
import { TelescopeStatusOverlay } from './TelescopeStatusOverlay'
import { TelescopeControlsOverlay } from './TelescopeControlsOverlay'
import { useTelescopeStore } from '../stores/telescopeStore'

type ViewMode = 'telescope' | 'allsky'

export function TelescopeView() {
  const [viewMode, setViewMode] = useState<ViewMode>('telescope')
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)

  const { currentTelescopeId } = useTelescopeStore()

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 4))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5))
  }

  const handleResetZoom = () => {
    setZoom(1)
  }

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        containerRef.current.requestFullscreen()
      }
    }
  }

  return (
    <div ref={containerRef} className="relative h-full bg-black overflow-hidden">
      {/* Left Sidebar Controls */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2">
        {/* View Mode Toggle */}
        <div className="flex flex-col bg-card/90 backdrop-blur rounded-lg border border-border overflow-hidden">
          <Button
            variant={viewMode === 'telescope' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('telescope')}
            className="rounded-none justify-start gap-2 px-3"
          >
            <span className="w-4 h-4 flex items-center justify-center">🔭</span>
            <span className="text-sm">Telescope</span>
          </Button>
          <Button
            variant={viewMode === 'allsky' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('allsky')}
            className="rounded-none justify-start gap-2 px-3"
          >
            <span className="w-4 h-4 flex items-center justify-center">🌐</span>
            <span className="text-sm">All-Sky</span>
          </Button>
        </div>

        {/* Zoom Controls */}
        <div className="flex flex-col bg-card/90 backdrop-blur rounded-lg border border-border">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleResetZoom}
            className="rounded-t-lg rounded-b-none h-9 w-9"
            title="Reset zoom"
          >
            <span className="text-xs font-mono">{Math.round(zoom * 100)}%</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            className="rounded-none h-9 w-9"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            className="rounded-none h-9 w-9"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFullscreen}
            className="rounded-none h-9 w-9"
            title="Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-none h-9 w-9"
            title="Enhance"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-b-lg rounded-t-none h-9 w-9"
            title="Filter"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Video Area */}
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
        }}
      >
        {viewMode === 'telescope' ? (
          <VideoFeed
            telescopeId={currentTelescopeId || undefined}
            className="w-full h-full"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <p>All-Sky View</p>
          </div>
        )}
      </div>

      {/* Allsky Camera Panel */}
      <AllskyPanel />

      {/* Telescope Status Overlay */}
      <TelescopeStatusOverlay />

      {/* Telescope Controls Overlay */}
      <TelescopeControlsOverlay />
    </div>
  )
}
