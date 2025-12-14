import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X,
  Minimize2,
  Maximize2,
  Move,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Home,
  Focus,
  ZoomIn,
  ZoomOut,
  Navigation,
} from 'lucide-react'
import { Button } from './ui/button'
import { Slider } from './ui/slider'
import { Label } from './ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { useUIStore } from '../stores/uiStore'
import { useTelescopeStore } from '../stores/telescopeStore'
import { invoke } from '../services/api'

// Helper function to convert RA degrees to HMS format
function raToHMS(raDegrees: number): string {
  const raHours = raDegrees / 15
  const hours = Math.floor(raHours)
  const minutesDecimal = (raHours - hours) * 60
  const minutes = Math.floor(minutesDecimal)
  const seconds = ((minutesDecimal - minutes) * 60).toFixed(1)
  return `${hours}h ${minutes}m ${seconds}s`
}

// Helper function to convert Dec degrees to DMS format
function decToDMS(decDegrees: number): string {
  const sign = decDegrees < 0 ? '-' : '+'
  const absDec = Math.abs(decDegrees)
  const degrees = Math.floor(absDec)
  const minutesDecimal = (absDec - degrees) * 60
  const minutes = Math.floor(minutesDecimal)
  const seconds = ((minutesDecimal - minutes) * 60).toFixed(1)
  return `${sign}${degrees}° ${minutes}' ${seconds}"`
}

interface StreamStatus {
  ra?: number
  dec?: number
  stage?: string
}

export function TelescopeControlsOverlay() {
  const { showTelescopeControls, setShowTelescopeControls, setIsManuallyMoving } = useUIStore()
  const { currentTelescopeId } = useTelescopeStore()
  const currentTelescope = useTelescopeStore((state) =>
    state.telescopes.find((t) => t.id === state.currentTelescopeId)
  )

  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null)
  const [focusPosition, setFocusPosition] = useState(50)
  const [overlayPosition, setOverlayPosition] = useState<{ x: number; y: number } | undefined>(undefined)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const overlayRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMouseDownRef = useRef<boolean>(false)

  const isConnected = currentTelescope?.status === 'connected'
  const isStacking = streamStatus?.stage === 'Stack'

  // Helper function to ensure position is within screen bounds
  const ensureWithinBounds = useCallback(
    (pos: { x: number; y: number }) => {
      const overlayWidth = isMinimized ? 200 : 320
      const overlayHeight = isMinimized ? 60 : 400
      const padding = 20

      const maxX = window.innerWidth - overlayWidth - padding
      const maxY = window.innerHeight - overlayHeight - padding

      return {
        x: Math.min(Math.max(padding, pos.x), maxX),
        y: Math.min(Math.max(padding, pos.y), maxY),
      }
    },
    [isMinimized]
  )

  // Initialize overlay position
  useEffect(() => {
    if (showTelescopeControls && typeof window !== 'undefined') {
      if (overlayPosition === undefined) {
        const overlayWidth = 320
        const padding = 20
        const initialX = window.innerWidth - overlayWidth - padding - 340 // Left of status panel
        const initialY = padding + 60
        setOverlayPosition({ x: initialX, y: initialY })
      } else {
        const boundedPos = ensureWithinBounds(overlayPosition)
        if (boundedPos.x !== overlayPosition.x || boundedPos.y !== overlayPosition.y) {
          setOverlayPosition(boundedPos)
        }
      }
    }
  }, [showTelescopeControls, overlayPosition, ensureWithinBounds])

  // Fetch status periodically - only when connected
  useEffect(() => {
    if (!currentTelescopeId) {
      setStreamStatus(null)
      return
    }

    const fetchStatus = async () => {
      try {
        const result = await invoke<StreamStatus>('get_telescope_status', {
          telescopeId: currentTelescopeId,
        })
        setStreamStatus(result)
      } catch (error) {
        // Silently ignore errors - telescope may not be in backend state yet
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [currentTelescopeId])

  // Handle dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
      const rect = overlayRef.current?.getBoundingClientRect()
      if (rect) {
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        })
      }
    }
  }

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return
      const newX = e.clientX - dragOffset.x
      const newY = e.clientY - dragOffset.y
      const boundedPos = ensureWithinBounds({ x: newX, y: newY })
      setOverlayPosition(boundedPos)
    },
    [isDragging, dragOffset.x, dragOffset.y, ensureWithinBounds]
  )

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

  // Movement control handlers
  const handleTelescopeMove = useCallback(
    async (direction: string) => {
      if (!currentTelescopeId) return
      try {
        await invoke('telescope_move', {
          telescopeId: currentTelescopeId,
          params: {
            direction,
            speed: 1.0,
            duration_sec: 5.0,
          },
        })
      } catch (error) {
        console.error('Move failed:', error)
      }
    },
    [currentTelescopeId]
  )

  const handleTelescopePark = useCallback(async () => {
    if (!currentTelescopeId) return
    try {
      await invoke('park_telescope', { telescopeId: currentTelescopeId })
    } catch (error) {
      console.error('Park failed:', error)
    }
  }, [currentTelescopeId])

  const handleFocusAdjust = useCallback(
    async (value: number) => {
      if (!currentTelescopeId) return
      try {
        await invoke('set_focus', {
          telescopeId: currentTelescopeId,
          position: value,
        })
      } catch (error) {
        console.error('Focus adjust failed:', error)
      }
    },
    [currentTelescopeId]
  )

  const startContinuousMove = useCallback(
    (direction: string) => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      // Signal that we're manually moving for fast coordinate polling
      setIsManuallyMoving(true)
      handleTelescopeMove(direction)
      intervalRef.current = setInterval(() => {
        handleTelescopeMove(direction)
      }, 500)
    },
    [handleTelescopeMove, setIsManuallyMoving]
  )

  const stopContinuousMove = useCallback(
    (fromMouseLeave = false) => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      // Clear manual moving state
      setIsManuallyMoving(false)
      if (!fromMouseLeave || isMouseDownRef.current) {
        handleTelescopeMove('stop')
      }
    },
    [handleTelescopeMove, setIsManuallyMoving]
  )

  const handleMoveMouseDown = useCallback(
    (direction: string) => {
      isMouseDownRef.current = true
      startContinuousMove(direction)
    },
    [startContinuousMove]
  )

  const handleMoveMouseUp = useCallback(() => {
    isMouseDownRef.current = false
    stopContinuousMove(false)
  }, [stopContinuousMove])

  const handleMoveMouseLeave = useCallback(() => {
    if (isMouseDownRef.current) {
      isMouseDownRef.current = false
      stopContinuousMove(true)
    }
  }, [stopContinuousMove])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  if (!showTelescopeControls || !overlayPosition) return null

  return (
    <TooltipProvider>
      <div
        ref={overlayRef}
        className={`fixed bg-card/95 backdrop-blur-sm rounded-lg shadow-xl border-2 border-border transition-all ${
          isMinimized ? 'w-auto' : 'w-80'
        }`}
        style={{
          left: overlayPosition.x,
          top: overlayPosition.y,
          zIndex: 9998,
          cursor: isDragging ? 'grabbing' : 'default',
        }}
      >
        {/* Header with drag handle */}
        <div
          className="drag-handle cursor-move bg-background/80 px-4 py-2 rounded-t-lg border-b border-border flex items-center justify-between select-none"
          onMouseDown={handleMouseDown}
        >
          <h3 className="font-semibold text-blue-400 flex items-center gap-2">
            <Move className="w-4 h-4" />
            {isMinimized ? 'Controls' : 'Telescope Controls'}
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="h-6 w-6 p-0 hover:bg-accent"
              title={isMinimized ? 'Expand' : 'Minimize'}
            >
              {isMinimized ? (
                <Maximize2 className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Minimize2 className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTelescopeControls(false)}
              className="h-6 w-6 p-0 hover:bg-accent"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Content - only show if not minimized */}
        {!isMinimized && (
          <div className="p-4 space-y-4">
            {/* Current Coordinates */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current Position
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">RA:</span>{' '}
                  <span className="font-mono">
                    {streamStatus?.ra != null ? raToHMS(streamStatus.ra) : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Dec:</span>{' '}
                  <span className="font-mono">
                    {streamStatus?.dec != null ? decToDMS(streamStatus.dec) : '—'}
                  </span>
                </div>
              </div>
              {streamStatus?.stage && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Mode:</span>{' '}
                  <span className="font-mono">
                    {streamStatus.stage === 'RTSP'
                      ? 'Streaming'
                      : streamStatus.stage === 'Stack'
                        ? 'Stacking'
                        : streamStatus.stage === 'ContinuousExposure'
                          ? 'Live View'
                          : streamStatus.stage === 'AutoGoto'
                            ? 'Auto Goto'
                            : streamStatus.stage}
                  </span>
                </div>
              )}
            </div>

            {/* Movement Controls - only show if not stacking */}
            {!isStacking && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Navigation className="w-3 h-3" />
                  Movement & Tracking
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <div />
                  <Button
                    size="sm"
                    variant="outline"
                    onMouseDown={() => handleMoveMouseDown('north')}
                    onMouseUp={handleMoveMouseUp}
                    onMouseLeave={handleMoveMouseLeave}
                    disabled={!isConnected}
                    className="h-10"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <div />

                  <Button
                    size="sm"
                    variant="outline"
                    onMouseDown={() => handleMoveMouseDown('west')}
                    onMouseUp={handleMoveMouseUp}
                    onMouseLeave={handleMoveMouseLeave}
                    disabled={!isConnected}
                    className="h-10"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleTelescopeMove('stop')}
                    disabled={!isConnected}
                    className="h-10"
                  >
                    Stop
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onMouseDown={() => handleMoveMouseDown('east')}
                    onMouseUp={handleMoveMouseUp}
                    onMouseLeave={handleMoveMouseLeave}
                    disabled={!isConnected}
                    className="h-10"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>

                  <div />
                  <Button
                    size="sm"
                    variant="outline"
                    onMouseDown={() => handleMoveMouseDown('south')}
                    onMouseUp={handleMoveMouseUp}
                    onMouseLeave={handleMoveMouseLeave}
                    disabled={!isConnected}
                    className="h-10"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <div />
                </div>

                {/* Park Button */}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleTelescopePark}
                  disabled={!isConnected}
                  className="w-full"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Park Telescope
                </Button>
              </div>
            )}

            {/* Focus Controls - only show if not stacking */}
            {!isStacking && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Focus className="w-3 h-3" />
                  Focus Control
                </h4>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Position</Label>
                    <span className="text-sm font-mono text-muted-foreground">{focusPosition}</span>
                  </div>
                  <Slider
                    value={[focusPosition]}
                    onValueChange={([value]) => setFocusPosition(value)}
                    onValueCommit={([value]) => handleFocusAdjust(value)}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!isConnected}
                    className="w-full"
                  />

                  <div className="flex gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const newPos = Math.max(0, focusPosition - 5)
                            setFocusPosition(newPos)
                            handleFocusAdjust(newPos)
                          }}
                          disabled={!isConnected}
                          className="flex-1"
                        >
                          <ZoomOut className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Focus Out (-5)</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const newPos = Math.min(100, focusPosition + 5)
                            setFocusPosition(newPos)
                            handleFocusAdjust(newPos)
                          }}
                          disabled={!isConnected}
                          className="flex-1"
                        >
                          <ZoomIn className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Focus In (+5)</p>
                      </TooltipContent>
                    </Tooltip>

                    <Button size="sm" variant="secondary" disabled={!isConnected} className="flex-1">
                      Auto Focus
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Show message when stacking */}
            {isStacking && (
              <div className="p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
                <p className="text-sm text-yellow-400">
                  Movement and focus controls are disabled during stacking
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
