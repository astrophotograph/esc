import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
  Circle,
  Target,
  Power,
  Mountain,
} from 'lucide-react'
import { Button } from './ui/button'
import { Slider } from './ui/slider'
import { Label } from './ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'
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

export function TelescopeControlsOverlay() {
  const { showTelescopeControls, setShowTelescopeControls, setIsManuallyMoving } = useUIStore()
  const { currentTelescopeId } = useTelescopeStore()
  const currentTelescope = useTelescopeStore((state) =>
    state.telescopes.find((t) => t.id === state.currentTelescopeId)
  )

  const storeStatus = useTelescopeStore((s) =>
    currentTelescopeId ? s.telescopeStatus[currentTelescopeId] : null
  )
  const streamStatus = useMemo(() => storeStatus ? {
    ra: storeStatus.ra,
    dec: storeStatus.dec,
    stage: storeStatus.stage,
    focusPosition: storeStatus.focuserPosition,
    mountType: storeStatus.mountType,
  } : null, [storeStatus?.ra, storeStatus?.dec, storeStatus?.stage, storeStatus?.focuserPosition, storeStatus?.mountType])

  // Track local focus position for UI, sync from status
  const [localFocusPosition, setLocalFocusPosition] = useState<number | null>(null)
  const [overlayPosition, setOverlayPosition] = useState<{ x: number; y: number } | undefined>(undefined)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const overlayRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMouseDownRef = useRef<boolean>(false)

  // Reboot confirmation dialog state
  const [showRebootConfirm, setShowRebootConfirm] = useState(false)
  // Mount mode confirmation: null = closed, true = switching to EQ, false = switching to Alt-Az
  const [pendingMountMode, setPendingMountMode] = useState<boolean | null>(null)
  // Recording state
  const [isRecording, setIsRecording] = useState(false)

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

  // Sync focus position from store when we don't have a local override
  useEffect(() => {
    if (streamStatus?.focusPosition != null && localFocusPosition === null) {
      setLocalFocusPosition(streamStatus.focusPosition)
    }
  }, [streamStatus?.focusPosition, localFocusPosition])

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

  const handleMoveToHorizon = useCallback(async () => {
    if (!currentTelescopeId) return
    try {
      await invoke('telescope_move_to_horizon', { telescopeId: currentTelescopeId })
    } catch (error) {
      console.error('Move to horizon failed:', error)
    }
  }, [currentTelescopeId])

  const handleFocusAdjust = useCallback(
    async (value: number) => {
      if (!currentTelescopeId) return
      try {
        await invoke('telescope_focus', {
          telescopeId: currentTelescopeId,
          position: value,
        })
        setLocalFocusPosition(value)
      } catch (error) {
        console.error('Focus adjust failed:', error)
      }
    },
    [currentTelescopeId]
  )

  const handleFocusIncrement = useCallback(
    async (increment: number) => {
      if (!currentTelescopeId) return
      try {
        await invoke('telescope_focus_increment', {
          telescopeId: currentTelescopeId,
          increment,
        })
        // Update local position optimistically
        setLocalFocusPosition((prev) => (prev !== null ? prev + increment : increment))
      } catch (error) {
        console.error('Focus increment failed:', error)
      }
    },
    [currentTelescopeId]
  )

  const handleAutoFocus = useCallback(async () => {
    if (!currentTelescopeId) return
    try {
      await invoke('telescope_auto_focus', {
        telescopeId: currentTelescopeId,
      })
    } catch (error) {
      console.error('Auto focus failed:', error)
    }
  }, [currentTelescopeId])

  const handleRecord = useCallback(async () => {
    if (!currentTelescopeId) return
    try {
      if (isRecording) {
        await invoke('telescope_stop_recording', {
          telescopeId: currentTelescopeId,
        })
        setIsRecording(false)
      } else {
        await invoke('telescope_start_recording', {
          telescopeId: currentTelescopeId,
        })
        setIsRecording(true)
      }
    } catch (error) {
      console.error('Record toggle failed:', error)
    }
  }, [currentTelescopeId, isRecording])

  const handlePlateSolve = useCallback(async () => {
    if (!currentTelescopeId) return
    try {
      await invoke('telescope_plate_solve', {
        telescopeId: currentTelescopeId,
      })
    } catch (error) {
      console.error('Plate solve failed:', error)
    }
  }, [currentTelescopeId])

  const handleRebootConfirm = useCallback(async () => {
    if (!currentTelescopeId) return
    try {
      await invoke('telescope_reboot', {
        telescopeId: currentTelescopeId,
      })
      setShowRebootConfirm(false)
    } catch (error) {
      console.error('Reboot failed:', error)
      setShowRebootConfirm(false)
    }
  }, [currentTelescopeId])

  const handleMountModeConfirm = useCallback(async () => {
    if (!currentTelescopeId || pendingMountMode === null) return
    try {
      await invoke('telescope_set_mount_mode', {
        telescopeId: currentTelescopeId,
        eqMode: pendingMountMode,
      })
    } catch (error) {
      console.error('Mount mode switch failed:', error)
    } finally {
      setPendingMountMode(null)
    }
  }, [currentTelescopeId, pendingMountMode])

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

                {/* Park / Horizon Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleTelescopePark}
                        disabled={!isConnected}
                        className="w-full"
                      >
                        <Home className="h-4 w-4 mr-2" />
                        Park
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Park telescope (stow position)</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleMoveToHorizon}
                        disabled={!isConnected}
                        className="w-full"
                      >
                        <Mountain className="h-4 w-4 mr-2" />
                        Horizon
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Move to horizon (storage position)</p></TooltipContent>
                  </Tooltip>
                </div>

                {/* Mount Mode */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    Mount:{' '}
                    <span className="font-mono text-foreground">
                      {streamStatus?.mountType ?? '—'}
                    </span>
                  </span>
                  <div className="flex gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant={streamStatus?.mountType === 'Equatorial' ? 'default' : 'outline'}
                          onClick={() => setPendingMountMode(true)}
                          disabled={!isConnected || streamStatus?.mountType === 'Equatorial'}
                          className="h-7 text-xs px-2"
                        >
                          EQ
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Switch to Equatorial mode (parks mount)</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant={streamStatus?.mountType === 'Alt-Az' ? 'default' : 'outline'}
                          onClick={() => setPendingMountMode(false)}
                          disabled={!isConnected || streamStatus?.mountType === 'Alt-Az'}
                          className="h-7 text-xs px-2"
                        >
                          Alt-Az
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Switch to Alt-Az mode (parks mount)</p></TooltipContent>
                    </Tooltip>
                  </div>
                </div>
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
                      {localFocusPosition ?? streamStatus?.focusPosition ?? '—'}
                    </span>
                  </div>
                  <Slider
                    value={[localFocusPosition ?? streamStatus?.focusPosition ?? 0]}
                    onValueChange={([value]) => setLocalFocusPosition(value)}
                    onValueCommit={([value]) => handleFocusAdjust(value)}
                    min={0}
                    max={10000}
                    step={10}
                    disabled={!isConnected}
                    className="w-full"
                  />

                  <div className="flex gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleFocusIncrement(-50)}
                          disabled={!isConnected}
                          className="flex-1"
                        >
                          <ZoomOut className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Focus Out (-50 steps)</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleFocusIncrement(50)}
                          disabled={!isConnected}
                          className="flex-1"
                        >
                          <ZoomIn className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Focus In (+50 steps)</p>
                      </TooltipContent>
                    </Tooltip>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleAutoFocus}
                      disabled={!isConnected}
                      className="flex-1"
                    >
                      Auto Focus
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* System Controls - Record, Plate Solve, Reboot */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Power className="w-3 h-3" />
                System Controls
              </h4>

              <div className="grid grid-cols-2 gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={isRecording ? 'destructive' : 'outline'}
                      onClick={handleRecord}
                      disabled={!isConnected}
                      className="w-full"
                    >
                      <Circle
                        className={`h-4 w-4 mr-2 ${isRecording ? 'fill-current animate-pulse' : ''}`}
                      />
                      {isRecording ? 'Stop' : 'Record'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isRecording ? 'Stop recording video' : 'Start recording video'}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handlePlateSolve}
                      disabled={!isConnected || isStacking}
                      className="w-full"
                    >
                      <Target className="h-4 w-4 mr-2" />
                      Plate Solve
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Solve current image position</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowRebootConfirm(true)}
                    disabled={!isConnected}
                    className="w-full text-orange-500 hover:text-orange-400 hover:border-orange-500"
                  >
                    <Power className="h-4 w-4 mr-2" />
                    Reboot Telescope
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Restart the telescope system</p>
                </TooltipContent>
              </Tooltip>
            </div>

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

      {/* Mount Mode Confirmation Dialog */}
      <AlertDialog open={pendingMountMode !== null} onOpenChange={(open) => { if (!open) setPendingMountMode(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Switch to {pendingMountMode ? 'Equatorial' : 'Alt-Az'} Mode?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The telescope will park before switching mount modes. Any active imaging session will be interrupted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMountModeConfirm}>
              Switch Mode
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reboot Confirmation Dialog */}
      <AlertDialog open={showRebootConfirm} onOpenChange={setShowRebootConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reboot Telescope?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restart the telescope system. The connection will be lost and you will need
              to reconnect after the telescope has rebooted. This typically takes 1-2 minutes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRebootConfirm}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Reboot
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
