import { useState, useRef, useCallback } from 'react'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Sparkles,
  Filter,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Play,
  Loader2,
} from 'lucide-react'
import { Button } from './ui/button'
import { VideoFeed } from './VideoFeed'
import { AllskyPanel } from './AllskyPanel'
import { AllskyImage } from './AllskyImage'
import { TelescopeStatusOverlay } from './TelescopeStatusOverlay'
import { TelescopeControlsOverlay } from './TelescopeControlsOverlay'
import { useTelescopeStore } from '../stores/telescopeStore'
import { useUIStore } from '../stores/uiStore'
import { useImaging } from '../hooks'

type ViewMode = 'telescope' | 'allsky'

export function TelescopeView() {
  const [viewMode, setViewMode] = useState<ViewMode>('telescope')
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 640,
  )

  const { currentTelescopeId } = useTelescopeStore()
  const { isFullscreen, setIsFullscreen } = useUIStore()
  const { startImaging } = useImaging()

  // Whether the scope is connected and whether a live view / imaging session is
  // already running. When connected but idle, the video feed only shows the dark
  // placeholder, so we surface a "Start Live View" call-to-action.
  const isConnected = useTelescopeStore(
    (s) => s.telescopes.find((t) => t.id === s.currentTelescopeId)?.status === 'connected',
  )
  const stage = useTelescopeStore((s) =>
    s.currentTelescopeId ? s.telescopeStatus[s.currentTelescopeId]?.stage : undefined,
  )
  const hasActiveView = !!stage && stage !== 'Idle'
  const [startingView, setStartingView] = useState(false)

  const handleStartView = useCallback(async () => {
    if (!currentTelescopeId) return
    setStartingView(true)
    try {
      const settings = useTelescopeStore.getState().telescopeSettings[currentTelescopeId]
      await startImaging(currentTelescopeId, settings?.exposure ?? 1000, settings?.gain ?? 80)
    } catch {
      // startImaging already records the failure in the activity log
    } finally {
      setStartingView(false)
    }
  }, [currentTelescopeId, startImaging])

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 4))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5))
  }

  const handleResetZoom = () => {
    setZoom(1)
    setPanPosition({ x: 0, y: 0 })
  }

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360)
  }

  const handlePanChange = useCallback((newPan: { x: number; y: number }) => {
    setPanPosition(newPan)
  }, [])

  const handleFullscreen = () => setIsFullscreen(!isFullscreen)

  return (
    <div ref={containerRef} className="relative h-full bg-black overflow-hidden">
      {/* Left Sidebar Controls */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex flex-row items-center gap-0">
        {/* Controls panel — hidden when collapsed */}
        {sidebarOpen && (
          <div className="ml-2 flex flex-col gap-2">
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
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRotate}
                className="rounded-none h-9 w-9"
                title={`Rotate (${rotation}°)`}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-none h-9 w-9" title="Enhance">
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
        )}

        {/* Toggle tab — always visible */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="ml-1 flex items-center justify-center w-5 h-12 bg-card/80 backdrop-blur border border-border rounded-r-md text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          title={sidebarOpen ? 'Hide controls' : 'Show controls'}
        >
          {sidebarOpen ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </div>

      {/* Main Video Area */}
      <div className="w-full h-full flex items-center justify-center">
        {viewMode === 'telescope' ? (
          <VideoFeed
            telescopeId={currentTelescopeId || undefined}
            className="w-full h-full"
            zoom={zoom}
            rotation={rotation}
            panPosition={panPosition}
            onPanChange={handlePanChange}
          />
        ) : (
          <AllskyImage className="w-full h-full" fit="contain" />
        )}

        {/* Start Live View call-to-action: shown over the (dark) feed when the
            scope is connected but no imaging session is running. */}
        {viewMode === 'telescope' && isConnected && !hasActiveView && (
          <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="flex flex-col items-center gap-3 rounded-xl bg-card/80 backdrop-blur px-6 py-5 border border-border shadow-xl pointer-events-auto">
              <p className="text-sm text-muted-foreground">No live view running</p>
              <Button onClick={handleStartView} disabled={startingView} className="gap-2">
                {startingView ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {startingView ? 'Starting…' : 'Start Live View'}
              </Button>
            </div>
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
