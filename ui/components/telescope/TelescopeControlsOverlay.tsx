"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useTelescopeContext } from "@/context/TelescopeContext"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { formatRaDec } from "@/utils/telescope-utils"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface TelescopeControlsOverlayProps {
  isVisible: boolean
  onClose?: () => void
}

export function TelescopeControlsOverlay({ isVisible, onClose }: TelescopeControlsOverlayProps) {
  const {
    handleTelescopeMove,
    handleTelescopePark,
    focusPosition,
    setFocusPosition,
    handleFocusAdjust,
    streamStatus,
    isImaging,
    currentTelescope,
  } = useTelescopeContext()

  // Use persistent state for overlay position and minimized state
  const [overlayPosition, setOverlayPosition] = usePersistentState<{ x: number; y: number } | undefined>(
    'telescope-controls-overlay-position',
    undefined
  )

  const [isMinimized, setIsMinimized] = usePersistentState<boolean>(
    'telescope-controls-overlay-minimized',
    false
  )

  const overlayRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // Movement control refs - matching the working panel
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMouseDownRef = useRef<boolean>(false)

  // Helper function to ensure position is within screen bounds
  const ensureWithinBounds = useCallback((pos: { x: number; y: number }) => {
    const overlayWidth = isMinimized ? 200 : 320
    const overlayHeight = isMinimized ? 60 : 400
    const padding = 20

    const maxX = window.innerWidth - overlayWidth - padding
    const maxY = window.innerHeight - overlayHeight - padding

    return {
      x: Math.min(Math.max(padding, pos.x), maxX),
      y: Math.min(Math.max(padding, pos.y), maxY)
    }
  }, [isMinimized])

  // Initialize overlay position or ensure it's within bounds
  useEffect(() => {
    if (isVisible && typeof window !== 'undefined') {
      if (overlayPosition === undefined) {
        // Position in upper right corner by default
        const overlayWidth = 320
        const padding = 20

        const initialX = window.innerWidth - overlayWidth - padding
        const initialY = padding

        setOverlayPosition({ x: initialX, y: initialY })
      } else {
        // Ensure stored position is still within bounds
        const boundedPos = ensureWithinBounds(overlayPosition)
        if (boundedPos.x !== overlayPosition.x || boundedPos.y !== overlayPosition.y) {
          setOverlayPosition(boundedPos)
        }
      }
    }
  }, [isVisible, overlayPosition, setOverlayPosition, ensureWithinBounds])

  // Handle window resize to keep overlay in bounds
  useEffect(() => {
    const handleResize = () => {
      if (overlayPosition && isVisible) {
        const boundedPos = ensureWithinBounds(overlayPosition)
        if (boundedPos.x !== overlayPosition.x || boundedPos.y !== overlayPosition.y) {
          setOverlayPosition(boundedPos)
        }
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [overlayPosition, isVisible, setOverlayPosition, ensureWithinBounds])

  // Handle dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start dragging if clicking on the drag handle area
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

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return

    const newX = e.clientX - dragOffset.x
    const newY = e.clientY - dragOffset.y

    const boundedPos = ensureWithinBounds({ x: newX, y: newY })
    setOverlayPosition(boundedPos)
  }, [isDragging, dragOffset.x, dragOffset.y, setOverlayPosition, ensureWithinBounds])

  useEffect(() => {
    if (isDragging) {
      const handleDragMouseUp = () => {
        setIsDragging(false)
      }

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleDragMouseUp)

      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleDragMouseUp)
      }
    }
  }, [isDragging, handleMouseMove])

  // Movement control handlers - exactly matching the working panel
  const startContinuousMove = useCallback((direction: string) => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    // Send the initial move command immediately
    handleTelescopeMove(direction)

    // Set up an interval to send move commands every 500 ms
    intervalRef.current = setInterval(() => {
      handleTelescopeMove(direction)
    }, 500)
  }, [handleTelescopeMove])

  const stopContinuousMove = useCallback((fromMouseLeave = false) => {
    // Clear the interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // Only send stop command if this is from an actual button release, not a mouse leave
    // Mouse leave should only stop if the mouse was actually pressed down
    if (!fromMouseLeave || isMouseDownRef.current) {
      handleTelescopeMove("stop")
    }
  }, [handleTelescopeMove])

  const handleMoveMouseDown = useCallback((direction: string) => {
    isMouseDownRef.current = true
    startContinuousMove(direction)
  }, [startContinuousMove])

  const handleMoveMouseUp = useCallback(() => {
    isMouseDownRef.current = false
    stopContinuousMove(false)
  }, [stopContinuousMove])

  const handleMoveMouseLeave = useCallback(() => {
    // Only stop if mouse was pressed down (dragging out of button)
    if (isMouseDownRef.current) {
      isMouseDownRef.current = false
      stopContinuousMove(true)
    }
  }, [stopContinuousMove])

  const handleTouchStart = useCallback((direction: string) => {
    startContinuousMove(direction)
  }, [startContinuousMove])

  const handleTouchEnd = useCallback(() => {
    stopContinuousMove(false)
  }, [stopContinuousMove])

  // Cleanup on unmounting
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  if (!isVisible || !overlayPosition) return null

  // Don't show controls if telescope is stacking
  const isStacking = streamStatus?.status?.stage === 'Stack'
  const stage = streamStatus?.status?.stage || ''

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
          cursor: isDragging ? "grabbing" : "default"
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
              title={isMinimized ? "Expand" : "Minimize"}
            >
              {isMinimized ? (
                <Maximize2 className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Minimize2 className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-6 w-6 p-0 hover:bg-accent"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>

        {/* Content - only show if not minimized */}
        {!isMinimized && (
          <div className="p-4 space-y-4">
            {/* Current Coordinates */}
            {streamStatus?.status && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Current Position
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">RA:</span>{" "}
                    <span className="font-mono">
                      {streamStatus.status.ra !== undefined
                        ? formatRaDec(streamStatus.status.ra, 'ra')
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Dec:</span>{" "}
                    <span className="font-mono">
                      {streamStatus.status.dec !== undefined
                        ? formatRaDec(streamStatus.status.dec, 'dec')
                        : '—'}
                    </span>
                  </div>
                </div>
                {stage && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Mode:</span>{" "}
                    <span className="font-mono">
                      {stage === 'RTSP' ? 'Streaming' :
                       stage === 'Stack' ? 'Stacking' :
                       stage === 'ContinuousExposure' ? 'Live View' :
                       stage === 'AutoGoto' ? 'Auto Goto' :
                       stage}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Movement Controls - only show if not stacking */}
            {!isStacking && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Navigation className="w-3 h-3" />
                  Movement
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <div />
                  <Button
                    size="sm"
                    variant="outline"
                    onMouseDown={() => handleMoveMouseDown("north")}
                    onMouseUp={handleMoveMouseUp}
                    onMouseLeave={handleMoveMouseLeave}
                    onTouchStart={() => handleTouchStart("north")}
                    onTouchEnd={handleTouchEnd}
                    disabled={!currentTelescope}
                    className="h-10"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <div />

                  <Button
                    size="sm"
                    variant="outline"
                    onMouseDown={() => handleMoveMouseDown("west")}
                    onMouseUp={handleMoveMouseUp}
                    onMouseLeave={handleMoveMouseLeave}
                    onTouchStart={() => handleTouchStart("west")}
                    onTouchEnd={handleTouchEnd}
                    disabled={!currentTelescope}
                    className="h-10"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleTelescopeMove("stop")}
                    disabled={!currentTelescope}
                    className="h-10"
                  >
                    Stop
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onMouseDown={() => handleMoveMouseDown("east")}
                    onMouseUp={handleMoveMouseUp}
                    onMouseLeave={handleMoveMouseLeave}
                    onTouchStart={() => handleTouchStart("east")}
                    onTouchEnd={handleTouchEnd}
                    disabled={!currentTelescope}
                    className="h-10"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>

                  <div />
                  <Button
                    size="sm"
                    variant="outline"
                    onMouseDown={() => handleMoveMouseDown("south")}
                    onMouseUp={handleMoveMouseUp}
                    onMouseLeave={handleMoveMouseLeave}
                    onTouchStart={() => handleTouchStart("south")}
                    onTouchEnd={handleTouchEnd}
                    disabled={!currentTelescope}
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
                  disabled={!currentTelescope || isImaging}
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
                    <span className="text-sm font-mono text-muted-foreground">
                      {focusPosition}
                    </span>
                  </div>
                  <Slider
                    value={[focusPosition]}
                    onValueChange={([value]) => setFocusPosition(value)}
                    onValueCommit={([value]) => handleFocusAdjust(value)}
                    min={0}
                    max={100}
                    step={1}
                    disabled={!currentTelescope}
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
                          disabled={!currentTelescope}
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
                          disabled={!currentTelescope}
                          className="flex-1"
                        >
                          <ZoomIn className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Focus In (+5)</p>
                      </TooltipContent>
                    </Tooltip>
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