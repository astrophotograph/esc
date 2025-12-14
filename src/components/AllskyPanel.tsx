import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Maximize2, Minimize2, RefreshCw, Clock, Eye } from 'lucide-react'
import { Button } from './ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { useUIStore } from '../stores/uiStore'

type PanelSize = 'S' | 'M' | 'L'

const SIZE_CONFIG = {
  S: { width: 320, height: 240 },
  M: { width: 480, height: 360 },
  L: { width: 640, height: 480 },
}

export function AllskyPanel() {
  const { showAllskyPanel: show, setShowAllskyPanel: setShow } = useUIStore()
  const [size, setSize] = useState<PanelSize>('M')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null) // Initialized on first show
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [minimized, setMinimized] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)

  const currentSize = SIZE_CONFIG[size]

  // Initialize position on first show
  useEffect(() => {
    if (show && position === null && typeof window !== 'undefined') {
      // Position in bottom-left area by default
      const initialY = window.innerHeight - currentSize.height - 100
      setPosition({ x: 16, y: Math.max(60, initialY) })
    }
  }, [show, position, currentSize.height])

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      setLastUpdate(new Date())
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [autoRefresh])

  // Dragging handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    const rect = panelRef.current?.getBoundingClientRect()
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
    }
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return

    const panelWidth = minimized ? 140 : currentSize.width
    const panelHeight = minimized ? 40 : currentSize.height + 80 // header + footer
    const maxX = window.innerWidth - panelWidth - 16
    const maxY = window.innerHeight - panelHeight - 16

    setPosition({
      x: Math.max(16, Math.min(maxX, e.clientX - dragOffset.x)),
      y: Math.max(60, Math.min(maxY, e.clientY - dragOffset.y)),
    })
  }, [isDragging, dragOffset, currentSize, minimized])

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

  if (!show || position === null) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setShow(true)}
        className="absolute bottom-4 left-4 z-20 gap-2"
      >
        <Eye className="h-4 w-4" />
        Show Allsky
      </Button>
    )
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
  }

  return (
    <div
      ref={panelRef}
      className="absolute z-20 bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: minimized ? 140 : currentSize.width,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-2 py-1.5 bg-muted cursor-grab"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">📷</span>
          <span className="text-sm font-medium">{minimized ? 'Allsky' : 'Allsky Camera'}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Only show selectors when not minimized */}
          {!minimized && (
            <>
              {/* View Mode Selector */}
              <Select defaultValue="All-Sky">
                <SelectTrigger className="h-6 w-[70px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All-Sky">All-Sky</SelectItem>
                  <SelectItem value="Polar">Polar</SelectItem>
                  <SelectItem value="Fish">Fish</SelectItem>
                </SelectContent>
              </Select>

              {/* Size Selector */}
              <Select value={size} onValueChange={(v: PanelSize) => setSize(v)}>
                <SelectTrigger className="h-6 w-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="S">S</SelectItem>
                  <SelectItem value="M">M</SelectItem>
                  <SelectItem value="L">L</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          {/* Expand/Minimize */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMinimized(!minimized)}
            className="h-6 w-6 p-0"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
          </Button>

          {/* Fullscreen - only show when not minimized */}
          {!minimized && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              title="Fullscreen"
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          )}

          {/* Close */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShow(false)}
            className="h-6 w-6 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Camera View */}
      {!minimized && (
        <>
          {/* Time and Auto-refresh indicator */}
          <div className="flex items-center justify-between px-2 py-1 bg-muted/50 text-xs">
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3" />
              <span className="font-mono">{formatTime(lastUpdate)}</span>
            </div>
            <Button
              variant={autoRefresh ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="h-5 px-2 text-xs gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
              Auto-refresh
            </Button>
          </div>

          {/* Image Area */}
          <div
            className="relative bg-black"
            style={{
              width: currentSize.width,
              height: currentSize.height,
            }}
          >
            {/* Placeholder for allsky camera feed */}
            <div className="w-full h-full flex items-center justify-center">
              <img
                src={`/placeholder.svg?height=${currentSize.height}&width=${currentSize.width}&text=Allsky`}
                alt="Allsky camera feed"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Visibility indicator */}
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/50 px-2 py-1 rounded text-xs">
              <Eye className="h-3 w-3" />
              <span>1</span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-2 py-1 bg-muted/50 text-xs text-muted-foreground">
            <span className="font-mono">{currentSize.width}×{currentSize.height}</span>
            <span>• Allsky</span>
          </div>
        </>
      )}
    </div>
  )
}
