"use client"

import { useRef, useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw, Focus, Settings, Camera, Square, Home, Target } from "lucide-react"
import { useTelescopeContext } from "@/context/TelescopeContext"
import { formatRaDec } from "@/utils/telescope-utils"
import { PlateSolveSyncDialog, type PlateSolveResult } from "../modals/PlateSolveSyncDialog"
import { MessageType, PlateSolveResultMessage, getWebSocketService, CommandAction } from "@/services/websocket-service"

export function TelescopeControls() {
  const {
    isTracking,
    setIsTracking,
    handleTelescopeMove,
    handleTelescopePark,
    focusPosition,
    setFocusPosition,
    handleFocusAdjust,
    exposure,
    setExposure,
    gain,
    setGain,
    brightness,
    setBrightness,
    contrast,
    setContrast,
  streamStatus,
  isImaging,
  setIsImaging,
  addStatusAlert,
  currentTelescope,
  handlePlateSolve,
  handleSyncTelescope,
  clientMode,
  } = useTelescopeContext()

  // State for plate solve sync dialog
  const [showPlateSolveDialog, setShowPlateSolveDialog] = useState(false)
  const [plateSolveResult, setPlateSolveResult] = useState<PlateSolveResult | null>(null)

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

  const stopContinuousMove = useCallback(() => {
    // Clear the interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // Send stop command
    handleTelescopeMove("stop")
  }, [handleTelescopeMove])

  const handleMouseDown = useCallback((direction: string) => {
    startContinuousMove(direction)
  }, [startContinuousMove])

  const handleMouseUp = useCallback(() => {
    stopContinuousMove()
  }, [stopContinuousMove])

  const handleTouchStart = useCallback((direction: string) => {
    startContinuousMove(direction)
  }, [startContinuousMove])

  const handleTouchEnd = useCallback(() => {
    stopContinuousMove()
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
          ret_step: true
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

  const handleReboot = async () => {
    if (!currentTelescope) {
      addStatusAlert({
        type: "error",
        title: "No Telescope Selected",
        message: "Please select a telescope before rebooting",
      })
      return
    }

    try {
      const wsService = getWebSocketService()
      await wsService.sendCommand(CommandAction.REBOOT, {}, currentTelescope.id)

      addStatusAlert({
        type: "warning",
        title: "Reboot Command Sent",
        message: "Telescope reboot command has been sent",
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      addStatusAlert({
        type: "error",
        title: "Reboot Failed",
        message: errorMessage,
      })
    }
  }

  return (
    <>
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Telescope Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Coordinates */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300">Current Position</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">RA:</span>
              <span className="ml-2 text-white">{formatRaDec(streamStatus?.status?.ra, "ra") || "N/A"}</span>
            </div>
            <div>
              <span className="text-gray-400">Dec:</span>
              <span className="ml-2 text-white">{formatRaDec(streamStatus?.status?.dec, "dec") || "N/A"}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-400">
            <div>
              <span className="text-gray-500">RA (deg):</span>
              <span className="ml-2 text-gray-300">
                {streamStatus?.status?.ra !== undefined && streamStatus?.status?.ra !== null ? `${streamStatus.status.ra.toFixed(4)}°` : "N/A"}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Dec (deg):</span>
              <span className="ml-2 text-gray-300">
                {streamStatus?.status?.dec !== undefined && streamStatus?.status?.dec !== null ? `${streamStatus.status.dec.toFixed(4)}°` : "N/A"}
              </span>
            </div>
          </div>
        </div>

        <Separator 
          className={`bg-gray-700 transition-all duration-300 ease-in-out ${
            clientMode === "Stacking" ? "opacity-0 h-0" : "opacity-100"
          }`} 
        />

        {/* Movement Controls */}
        <div 
          className={`space-y-3 transition-all duration-300 ease-in-out overflow-hidden ${
            clientMode === "Stacking" 
              ? "max-h-0 opacity-0 pointer-events-none" 
              : "max-h-[1000px] opacity-100"
          }`}
        >
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">Movement & Tracking</h4>
          <div className="grid grid-cols-3 gap-2">
            <div></div>
            <Button
              variant="outline"
              size="sm"
              onMouseDown={() => handleMouseDown("north")}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={() => handleTouchStart("north")}
              onTouchEnd={handleTouchEnd}
              className="border-gray-600 text-white hover:bg-gray-700"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
            <div></div>
            <Button
              variant="outline"
              size="sm"
              onMouseDown={() => handleMouseDown("west")}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={() => handleTouchStart("west")}
              onTouchEnd={handleTouchEnd}
              className="border-gray-600 text-white hover:bg-gray-700"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTelescopeMove("stop")}
              className="border-gray-600 text-white hover:bg-gray-700"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onMouseDown={() => handleMouseDown("east")}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={() => handleTouchStart("east")}
              onTouchEnd={handleTouchEnd}
              className="border-gray-600 text-white hover:bg-gray-700"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
            <div></div>
            <Button
              variant="outline"
              size="sm"
              onMouseDown={() => handleMouseDown("south")}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={() => handleTouchStart("south")}
              onTouchEnd={handleTouchEnd}
              className="border-gray-600 text-white hover:bg-gray-700"
            >
              <ArrowDown className="w-4 h-4" />
            </Button>
            <div></div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Tracking</span>
            <Switch checked={isTracking} onCheckedChange={setIsTracking} />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTelescopePark()}
            className="w-full border-gray-600 text-white hover:bg-gray-700"
          >
            <Home className="w-4 h-4 mr-2" />
            Park Telescope
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePlateSolveAndSync}
            className="w-full border-gray-600 text-white hover:bg-gray-700"
          >
            <Target className="w-4 h-4 mr-2" />
            Plate Solve
          </Button>
        </div>

        <Separator 
          className={`bg-gray-700 transition-all duration-300 ease-in-out ${
            clientMode === "Stacking" ? "opacity-0 h-0" : "opacity-100"
          }`} 
        />

        {/* Focus Controls */}
        <div 
          className={`space-y-3 transition-all duration-300 ease-in-out overflow-hidden ${
            clientMode === "Stacking" 
              ? "max-h-0 opacity-0 pointer-events-none" 
              : "max-h-[1000px] opacity-100"
          }`}
        >
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Focus className="w-4 h-4" />
            Focus Control
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-300">Position</span>
              <span className="text-white">{focusPosition[0]}</span>
            </div>
            <Slider value={focusPosition} onValueChange={handleFocusSliderChange} max={10000} step={10} className="w-full" />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFocusAdjust("in")}
              className="flex-1 border-gray-600 text-white hover:bg-gray-700"
            >
              Focus In
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFocusAdjust("out")}
              className="flex-1 border-gray-600 text-white hover:bg-gray-700"
            >
              Focus Out
            </Button>
          </div>
        </div>

        {/*<Separator className="bg-gray-700" />*/}

        {/* Image Controls */}
        {/*<div className="space-y-4">*/}
        {/*  <h4 className="text-sm font-medium text-gray-300">Image Settings</h4>*/}

        {/*  <div className="grid grid-cols-2 gap-4">*/}
        {/*    <div className="space-y-2">*/}
        {/*      <div className="flex justify-between text-sm">*/}
        {/*        <span className="text-gray-300">Exposure</span>*/}
        {/*        <span className="text-white">{exposure[0]}s</span>*/}
        {/*      </div>*/}
        {/*      <Slider value={exposure} onValueChange={setExposure} min={0.1} max={30} step={0.1} className="w-full" />*/}
        {/*    </div>*/}

        {/*    <div className="space-y-2">*/}
        {/*      <div className="flex justify-between text-sm">*/}
        {/*        <span className="text-gray-300">Gain</span>*/}
        {/*        <span className="text-white">{gain[0]}</span>*/}
        {/*      </div>*/}
        {/*      <Slider value={gain} onValueChange={setGain} min={0} max={100} step={1} className="w-full" />*/}
        {/*    </div>*/}

        {/*    <div className="space-y-2">*/}
        {/*      <div className="flex justify-between text-sm">*/}
        {/*        <span className="text-gray-300">Brightness</span>*/}
        {/*        <span className="text-white">{brightness[0]}</span>*/}
        {/*      </div>*/}
        {/*      <Slider value={brightness} onValueChange={setBrightness} min={-50} max={50} step={1} className="w-full" />*/}
        {/*    </div>*/}

        {/*    <div className="space-y-2">*/}
        {/*      <div className="flex justify-between text-sm">*/}
        {/*        <span className="text-gray-300">Contrast</span>*/}
        {/*        <span className="text-white">{contrast[0]}%</span>*/}
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
        {/*          ? "bg-red-600 hover:bg-red-700 text-white" */}
        {/*          : "bg-green-600 hover:bg-green-700 text-white"*/}
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

        <Separator className="bg-gray-700" />

        {/* Reboot Section */}
        <div className="space-y-3 border-2 border-red-600 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-300">System Control</h4>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReboot}
            className="w-full border-red-600 text-red-400 hover:bg-red-900 hover:text-red-300"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reboot Telescope
          </Button>
        </div>
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
      </>
  )
}
