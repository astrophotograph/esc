"use client"

import { useEffect, useState } from "react"
import { Compass, Navigation, Target, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { getWebSocketService, CommandAction } from "@/services/websocket-service"

interface AutoGotoOverlayProps {
  targetName?: string
  targetRa?: number
  targetDec?: number
  currentRa?: number
  currentDec?: number
  distDeg?: number  // Distance to target in degrees from status
  isVisible: boolean
  telescopeId?: string
}

export function AutoGotoOverlay({
  targetName,
  targetRa,
  targetDec,
  currentRa,
  currentDec,
  distDeg,
  isVisible,
  telescopeId
}: AutoGotoOverlayProps) {
  const [animationFrame, setAnimationFrame] = useState(0)
  const [initialDistance, setInitialDistance] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)

  // Use distDeg from status if available, otherwise calculate it
  useEffect(() => {
    let calculatedDistance: number | undefined
    
    // Use the provided distDeg from status if available
    if (distDeg !== undefined) {
      calculatedDistance = distDeg
    }
    // Otherwise calculate from coordinates if available
    else if (targetRa !== undefined && targetDec !== undefined &&
             currentRa !== undefined && currentDec !== undefined) {
      // Convert RA hours to degrees (15 degrees per hour)
      const targetRaDeg = targetRa * 15
      const currentRaDeg = currentRa * 15

      // Calculate angular separation using spherical trigonometry
      const dRa = Math.abs(targetRaDeg - currentRaDeg)
      const cosDist = Math.sin(currentDec * Math.PI / 180) * Math.sin(targetDec * Math.PI / 180) +
                      Math.cos(currentDec * Math.PI / 180) * Math.cos(targetDec * Math.PI / 180) *
                      Math.cos(dRa * Math.PI / 180)

      const distRad = Math.acos(Math.min(1, Math.max(-1, cosDist)))
      calculatedDistance = distRad * 180 / Math.PI
    }

    if (calculatedDistance !== undefined) {
      // Track initial distance for progress calculation
      if (initialDistance === null && calculatedDistance > 0.1) {
        setInitialDistance(calculatedDistance)
      }

      // Calculate progress based on initial distance
      if (initialDistance !== null && initialDistance > 0) {
        const progressPercent = Math.max(0, Math.min(100, 
          ((initialDistance - calculatedDistance) / initialDistance) * 100))
        setProgress(progressPercent)
      }
    }
  }, [distDeg, targetRa, targetDec, currentRa, currentDec, initialDistance])

  // Reset initial distance when overlay becomes visible
  useEffect(() => {
    if (isVisible) {
      setInitialDistance(null)  // Reset to capture new initial distance
      setProgress(0)
    }
  }, [isVisible])

  // Animation loop for visual effects
  useEffect(() => {
    if (!isVisible) return

    const interval = setInterval(() => {
      setAnimationFrame(prev => (prev + 1) % 360)
    }, 50)

    return () => clearInterval(interval)
  }, [isVisible])

  if (!isVisible) return null

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 bg-gray-900/95 border-gray-700 shadow-2xl">
        <div className="p-6 space-y-6">
          {/* Header with animated icon */}
          <div className="flex items-center justify-center space-x-3">
            <div className="relative">
              <Navigation
                className={cn(
                  "w-10 h-10 text-blue-400",
                  "transition-transform duration-1000"
                )}
                style={{ transform: `rotate(${animationFrame}deg)` }}
              />
              <div className="absolute inset-0 animate-ping">
                <Navigation className="w-10 h-10 text-blue-400 opacity-20" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white">AutoGoto Active</h2>
          </div>

          {/* Target information */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Target className="w-5 h-5 text-green-400" />
              <span className="text-gray-300">Target:</span>
              <span className="text-white font-semibold text-lg">
                {targetName || "Unknown Target"}
              </span>
            </div>

            {/* Coordinates if available */}
            {/*{targetRa !== undefined && targetDec !== undefined && (*/}
            {/*  <div className="text-sm text-gray-400 pl-7">*/}
            {/*    RA: {targetRa.toFixed(4)}h, Dec: {targetDec.toFixed(2)}°*/}
            {/*  </div>*/}
            {/*)}*/}
          </div>

          {/* Distance and progress */}
          {(distDeg !== undefined || (targetRa !== undefined && currentRa !== undefined)) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Compass className="w-5 h-5 text-yellow-400" />
                  <span className="text-gray-300">Distance to target:</span>
                </div>
                <span className="text-white font-mono text-lg">
                  {distDeg !== undefined ? distDeg.toFixed(2) : "---"}°
                </span>
              </div>

              {/* Progress bar */}
              {initialDistance !== null && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Progress</span>
                    <span>{progress.toFixed(0)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="text-xs text-gray-500 text-center">
                    Started from {initialDistance.toFixed(2)}°
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading animation */}
          <div className="flex justify-center">
            <div className="flex space-x-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "w-2 h-2 bg-blue-400 rounded-full",
                    "animate-bounce"
                  )}
                  style={{
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: "1s"
                  }}
                />
              ))}
            </div>
          </div>

          {/* Status message */}
          <div className="text-center text-sm text-gray-400">
            Telescope is slewing to target position...
          </div>

          {/* Cancel button */}
          <div className="flex justify-center mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const wsService = getWebSocketService()
                  await wsService.sendCommand(
                    CommandAction.STOP_GOTO,
                    { stage: "AutoGoto" },
                    telescopeId
                  )
                } catch (error) {
                  console.error("Failed to cancel AutoGoto:", error)
                }
              }}
              className="bg-red-900/50 hover:bg-red-800/50 text-red-200 border-red-700"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
