"use client"

import {useCallback, useEffect, useRef, useState} from "react"
import {Button} from "@/components/ui/button"
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card"
import {Slider} from "@/components/ui/slider"
import {Switch} from "@/components/ui/switch"
import {Separator} from "@/components/ui/separator"
import {ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Focus, Home, RotateCcw, Settings, Target, StopCircle, Moon, ZoomIn} from "lucide-react"
import {useTelescopeContext} from "@/context/TelescopeContext"
import {formatRaDec} from "@/utils/telescope-utils"
import {type PlateSolveResult, PlateSolveSyncDialog} from "../modals/PlateSolveSyncDialog"
import {getWebSocketService, MessageType, PlateSolveResultMessage, CommandAction} from "@/services/websocket-service"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function TelescopeControls() {
  const {
    isTracking,
    setIsTracking,
    handleTelescopeMove,
    handleTelescopePark,
    focusPosition,
    setFocusPosition,
    handleFocusAdjust,
    streamStatus,
    isImaging,
    setIsImaging,
    addStatusAlert,
    currentTelescope,
    handlePlateSolve,
    handleSyncTelescope,
    clientMode,
    handleStopImaging,
    selectedTarget,
  } = useTelescopeContext()

  // State for plate solve sync dialog
  const [showPlateSolveDialog, setShowPlateSolveDialog] = useState(false)
  const [plateSolveResult, setPlateSolveResult] = useState<PlateSolveResult | null>(null)
  
  // State for stop imaging confirmation dialog
  const [showStopImagingConfirm, setShowStopImagingConfirm] = useState(false)

  // Listen for plate solve results from WebSocket
  useEffect(() => {
    const wsService = getWebSocketService()

    const handlePlateSolveResult = (message: PlateSolveResultMessage) => {
      if (message.payload.success) {
        // Convert WebSocket message to PlateSolveResult format for the dialog
        setPlateSolveResult({
          success: true,
          ra: message.payload.ra!,
          dec: message.payload.dec!,
          orientation: message.payload.orientation,
          pixscale: message.payload.pixscale,
          field_width: message.payload.field_width,
          field_height: message.payload.field_height,
          job_id: message.payload.astrometry_job_id,
          submission_id: message.payload.submission_id,
        })

        // Show the sync dialog
        setShowPlateSolveDialog(true)
      }
      // For failures, the existing WebSocket toast notification is enough
    }

    wsService.on(MessageType.PLATE_SOLVE_RESULT, handlePlateSolveResult)

    return () => {
      wsService.off(MessageType.PLATE_SOLVE_RESULT, handlePlateSolveResult)
    }
  }, [])

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMouseDownRef = useRef<boolean>(false)

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

  const handleMouseDown = useCallback((direction: string) => {
    isMouseDownRef.current = true
    startContinuousMove(direction)
  }, [startContinuousMove])

  const handleMouseUp = useCallback(() => {
    isMouseDownRef.current = false
    stopContinuousMove(false)
  }, [stopContinuousMove])

  const handleMouseLeave = useCallback(() => {
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

  const handleImagingToggle = () => {
    setIsImaging(!isImaging)
    addStatusAlert({
      type: isImaging ? "info" : "success",
      title: isImaging ? "Imaging Stopped" : "Imaging Started",
      message: isImaging ? "Telescope imaging session ended" : "Telescope imaging session started",
    })
  }

  const handleAutoFocus = async () => {
    if (!currentTelescope) {
      addStatusAlert({
        type: "error",
        title: "No Telescope Selected",
        message: "Please select a telescope before using auto focus",
      })
      return
    }

    try {
      // Send auto focus command via WebSocket
      const wsService = getWebSocketService()
      await wsService.sendCommand(CommandAction.AUTO_FOCUS, {}, currentTelescope.id)

      addStatusAlert({
        type: "info",
        title: "Auto Focus Started",
        message: "Auto focus process has been initiated. This may take a few moments.",
      })
    } catch (error) {
      console.error('Error starting auto focus:', error)
      addStatusAlert({
        type: "error",
        title: "Auto Focus Failed",
        message: `Failed to start auto focus: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  const handleFocusSliderChange = async (value: number[]) => {
    const newPosition = value[0]
    const currentPosition = focusPosition[0]
    const step = newPosition - currentPosition

    if (step === 0) return

    if (!currentTelescope) {
      addStatusAlert({
        type: "error",
        title: "No Telescope Selected",
        message: "Please select a telescope before adjusting focus",
      })
      return
    }

    try {
      const response = await fetch(`/api/telescopes/${currentTelescope?.id}/focus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          step,
          ret_step: true,
        }),
      })

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`)
      }

      // Optimistically update position - will be overridden by a stream
      setFocusPosition(value)
    } catch (error) {
      console.error('Error setting focus position:', error)
      addStatusAlert({
        type: "error",
        title: "Focus Set Failed",
        message: `Failed to set focus position: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  const handlePlateSolveAndSync = async () => {
    if (!currentTelescope) {
      addStatusAlert({
        type: "error",
        title: "No Telescope Selected",
        message: "Please select a telescope before plate solving",
      })
      return
    }

    try {
      // Start plate solving - results will come via WebSocket
      await handlePlateSolve()
      // handlePlateSolve now shows its own "started" notification
      // Results will be shown via WebSocket toast notifications
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      addStatusAlert({
        type: "error",
        title: "Plate Solve Error",
        message: errorMessage,
      })
    }
  }

  const handleSync = async () => {
    if (!plateSolveResult?.success || !plateSolveResult.ra || !plateSolveResult.dec) {
      addStatusAlert({
        type: "error",
        title: "Sync Failed",
        message: "No valid plate solve coordinates available",
      })
      return
    }

    try {
      await handleSyncTelescope(plateSolveResult.ra, plateSolveResult.dec)

      addStatusAlert({
        type: "success",
        title: "Telescope Synced",
        message: `Telescope synced to RA=${plateSolveResult.ra.toFixed(4)}°, Dec=${plateSolveResult.dec.toFixed(4)}°`,
      })

      setShowPlateSolveDialog(false)
      setPlateSolveResult(null)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      addStatusAlert({
        type: "error",
        title: "Sync Failed",
        message: errorMessage,
      })
    }
  }

  const handleDialogCancel = () => {
    setShowPlateSolveDialog(false)
    setPlateSolveResult(null)
  }

  const handleStopImagingClick = () => {
    setShowStopImagingConfirm(true)
  }

  const handleConfirmStopImaging = async () => {
    setShowStopImagingConfirm(false)
    await handleStopImaging()
  }

  const handleCancelStopImaging = () => {
    setShowStopImagingConfirm(false)
  }

  // Handle Moon zoom levels
  const handleMoonZoom = async (zoomLevel: '1x' | '2x' | '4x') => {
    if (!currentTelescope) {
      addStatusAlert({
        type: "error",
        title: "No Telescope Selected",
        message: "Please select a telescope before adjusting zoom",
      })
      return
    }

    try {
      const wsService = getWebSocketService()
      const zoomValue = zoomLevel === '1x' ? 1 : zoomLevel === '2x' ? 2 : 4
      
      // Send zoom command to telescope
      // TODO: Replace with actual command when backend is ready
      console.log(`Setting Moon zoom to ${zoomLevel} (value: ${zoomValue})`)
      
      addStatusAlert({
        type: "success",
        title: "Zoom Adjusted",
        message: `Moon zoom set to ${zoomLevel}`,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      addStatusAlert({
        type: "error",
        title: "Zoom Adjustment Failed",
        message: errorMessage,
      })
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5"/>
            Telescope Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Coordinates */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Current Position</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">RA:</span>
                <span className="ml-2">{formatRaDec(streamStatus?.status?.ra, "ra") || "N/A"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Dec:</span>
                <span className="ml-2">{formatRaDec(streamStatus?.status?.dec, "dec") || "N/A"}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
              <div>
                <span className="text-muted-foreground">RA (deg):</span>
                <span className="ml-2 text-muted-foreground">
                {streamStatus?.status?.ra !== undefined && streamStatus?.status?.ra !== null ? `${streamStatus.status.ra.toFixed(4)}°` : "N/A"}
              </span>
              </div>
              <div>
                <span className="text-muted-foreground">Dec (deg):</span>
                <span className="ml-2 text-muted-foreground">
                {streamStatus?.status?.dec !== undefined && streamStatus?.status?.dec !== null ? `${streamStatus.status.dec.toFixed(4)}°` : "N/A"}
              </span>
              </div>
            </div>
          </div>

          {/* Moon Zoom Controls - Only visible when Moon is the current target */}
          {selectedTarget && (selectedTarget.id === 'moon' || selectedTarget.name?.toLowerCase() === 'moon') && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Moon className="w-4 h-4" />
                  Moon Zoom Controls
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleMoonZoom('1x')}
                    className=""
                  >
                    <ZoomIn className="w-3 h-3 mr-1" />
                    1x
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleMoonZoom('2x')}
                    className=""
                  >
                    <ZoomIn className="w-3 h-3 mr-1" />
                    2x
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleMoonZoom('4x')}
                    className=""
                  >
                    <ZoomIn className="w-3 h-3 mr-1" />
                    4x
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Stop Imaging Button - Only visible when in Stack mode */}
          {clientMode === "Stack" && (
            <>
              <Separator />
              <div className="space-y-3">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleStopImagingClick}
                  className="w-full"
                >
                  <StopCircle className="w-4 h-4 mr-2" />
                  Stop Imaging
                </Button>
              </div>
            </>
          )}

          <Separator
            className={`transition-all duration-300 ease-in-out ${
              clientMode === "Stack" ? "opacity-0 h-0" : "opacity-100"
            }`}
          />

          {/* Movement Controls */}
          <div
            className={`space-y-3 transition-all duration-300 ease-in-out overflow-hidden ${
              clientMode === "Stack"
                ? "max-h-0 opacity-0 pointer-events-none"
                : "max-h-[1000px] opacity-100"
            }`}
          >
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">Movement & Tracking</h4>
            <div className="grid grid-cols-3 gap-2">
              <div></div>
              <Button
                variant="outline"
                size="sm"
                onMouseDown={() => handleMouseDown("north")}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onTouchStart={() => handleTouchStart("north")}
                onTouchEnd={handleTouchEnd}
                className=""
              >
                <ArrowUp className="w-4 h-4"/>
              </Button>
              <div></div>
              <Button
                variant="outline"
                size="sm"
                onMouseDown={() => handleMouseDown("west")}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onTouchStart={() => handleTouchStart("west")}
                onTouchEnd={handleTouchEnd}
                className=""
              >
                <ArrowLeft className="w-4 h-4"/>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTelescopeMove("stop")}
                className=""
              >
                <RotateCcw className="w-4 h-4"/>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onMouseDown={() => handleMouseDown("east")}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onTouchStart={() => handleTouchStart("east")}
                onTouchEnd={handleTouchEnd}
                className=""
              >
                <ArrowRight className="w-4 h-4"/>
              </Button>
              <div></div>
              <Button
                variant="outline"
                size="sm"
                onMouseDown={() => handleMouseDown("south")}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onTouchStart={() => handleTouchStart("south")}
                onTouchEnd={handleTouchEnd}
                className=""
              >
                <ArrowDown className="w-4 h-4"/>
              </Button>
              <div></div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tracking</span>
              <Switch checked={isTracking} onCheckedChange={setIsTracking}/>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTelescopePark()}
              className="w-full"
            >
              <Home className="w-4 h-4 mr-2"/>
              Park Telescope
            </Button>
          </div>

          {/* Plate Solve Button - Always visible in ContinuousExposure and Stack modes */}
          {(clientMode === "ContinuousExposure" || clientMode === "Stack" || clientMode === "Streaming") && (
            <div className="space-y-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePlateSolveAndSync}
                className="w-full"
              >
                <Target className="w-4 h-4 mr-2"/>
                Plate Solve
              </Button>
            </div>
          )}

          <Separator
            className={`transition-all duration-300 ease-in-out ${
              clientMode === "Stack" ? "opacity-0 h-0" : "opacity-100"
            }`}
          />

          {/* Focus Controls */}
          <div
            className={`space-y-3 transition-all duration-300 ease-in-out overflow-hidden ${
              clientMode === "Stack"
                ? "max-h-0 opacity-0 pointer-events-none"
                : "max-h-[1000px] opacity-100"
            }`}
          >
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Focus className="w-4 h-4"/>
              Focus Control
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Position</span>
                <span>{focusPosition[0]}</span>
              </div>
              <Slider value={focusPosition} onValueChange={handleFocusSliderChange} max={10000} step={10}
                      className="w-full"/>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFocusAdjust("in")}
                className="flex-1"
              >
                Focus In
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFocusAdjust("out")}
                className="flex-1"
              >
                Focus Out
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoFocus}
              className="w-full"
              disabled={!currentTelescope?.connected}
            >
              <Focus className="w-4 h-4 mr-2" />
              Auto Focus
            </Button>
          </div>

          {/*<Separator />*/}

          {/* Image Controls */}
          {/*<div className="space-y-4">*/}
          {/*  <h4 className="text-sm font-medium text-muted-foreground">Image Settings</h4>*/}

          {/*  <div className="grid grid-cols-2 gap-4">*/}
          {/*    <div className="space-y-2">*/}
          {/*      <div className="flex justify-between text-sm">*/}
          {/*        <span className="text-muted-foreground">Exposure</span>*/}
          {/*        <span>{exposure[0]}s</span>*/}
          {/*      </div>*/}
          {/*      <Slider value={exposure} onValueChange={setExposure} min={0.1} max={30} step={0.1} className="w-full" />*/}
          {/*    </div>*/}

          {/*    <div className="space-y-2">*/}
          {/*      <div className="flex justify-between text-sm">*/}
          {/*        <span className="text-muted-foreground">Gain</span>*/}
          {/*        <span>{gain[0]}</span>*/}
          {/*      </div>*/}
          {/*      <Slider value={gain} onValueChange={setGain} min={0} max={100} step={1} className="w-full" />*/}
          {/*    </div>*/}

          {/*    <div className="space-y-2">*/}
          {/*      <div className="flex justify-between text-sm">*/}
          {/*        <span className="text-muted-foreground">Brightness</span>*/}
          {/*        <span>{brightness[0]}</span>*/}
          {/*      </div>*/}
          {/*      <Slider value={brightness} onValueChange={setBrightness} min={-50} max={50} step={1} className="w-full" />*/}
          {/*    </div>*/}

          {/*    <div className="space-y-2">*/}
          {/*      <div className="flex justify-between text-sm">*/}
          {/*        <span className="text-muted-foreground">Contrast</span>*/}
          {/*        <span>{contrast[0]}%</span>*/}
          {/*      </div>*/}
          {/*      <Slider value={contrast} onValueChange={setContrast} min={50} max={200} step={5} className="w-full" />*/}
          {/*    </div>*/}
          {/*  </div>*/}

          {/*  /!* Imaging Control *!/*/}
          {/*  <div className="mt-4">*/}
          {/*    <Button*/}
          {/*      onClick={handleImagingToggle}*/}
          {/*      className={`w-full ${*/}
          {/*        isImaging */}
          {/*          ? "bg-red-600 hover:bg-red-700" */}
          {/*          : "bg-green-600 hover:bg-green-700"*/}
          {/*      }`}*/}
          {/*    >*/}
          {/*      {isImaging ? (*/}
          {/*        <>*/}
          {/*          <Square className="w-4 h-4 mr-2" />*/}
          {/*          Stop Imaging*/}
          {/*        </>*/}
          {/*      ) : (*/}
          {/*        <>*/}
          {/*          <Camera className="w-4 h-4 mr-2" />*/}
          {/*          Start Imaging*/}
          {/*        </>*/}
          {/*      )}*/}
          {/*    </Button>*/}
          {/*  </div>*/}
          {/*</div>*/}

        </CardContent>
      </Card>

      <PlateSolveSyncDialog
        isOpen={showPlateSolveDialog}
        onClose={handleDialogCancel}
        currentRa={streamStatus?.status?.ra}
        currentDec={streamStatus?.status?.dec}
        plateSolveResult={plateSolveResult}
        isLoading={false} // Never loading since results come from WebSocket
        onSync={handleSync}
        onCancel={handleDialogCancel}
      />

      {/* Stop Imaging Confirmation Dialog */}
      <AlertDialog open={showStopImagingConfirm} onOpenChange={setShowStopImagingConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Imaging?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to stop the current stacking process? This will end the imaging session and you won't be able to resume from where you left off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={handleCancelStopImaging}
              className=""
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmStopImaging}
              className="bg-red-600 hover:bg-red-700 text-white border-0"
            >
              Stop Imaging
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
