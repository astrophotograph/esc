"use client"

import { useEffect, useState } from "react"
import { Camera, Moon, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface DarkLibraryOverlayProps {
  percentage?: number  // Progress percentage from status.percent
  isVisible: boolean
}

export function DarkLibraryOverlay({
  percentage = 0,
  isVisible
}: DarkLibraryOverlayProps) {
  const [animationFrame, setAnimationFrame] = useState(0)
  const [pulseAnimation, setPulseAnimation] = useState(0)

  // Animation loop for visual effects
  useEffect(() => {
    if (!isVisible) return

    const interval = setInterval(() => {
      setAnimationFrame(prev => (prev + 1) % 360)
    }, 50)

    return () => clearInterval(interval)
  }, [isVisible])

  // Pulse animation for the moon icon
  useEffect(() => {
    if (!isVisible) return

    const interval = setInterval(() => {
      setPulseAnimation(prev => (prev + 1) % 100)
    }, 20)

    return () => clearInterval(interval)
  }, [isVisible])

  if (!isVisible) return null

  // Calculate opacity for pulsing effect
  const pulseOpacity = 0.3 + 0.7 * Math.abs(Math.sin((pulseAnimation * Math.PI) / 50))

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 bg-gray-900/95 border-gray-700 shadow-2xl">
        <div className="p-6 space-y-6">
          {/* Header with animated icon */}
          <div className="flex items-center justify-center space-x-3">
            <div className="relative">
              {/* Main icon with rotation */}
              <Camera
                className={cn(
                  "w-10 h-10 text-purple-400",
                  "transition-transform duration-1000"
                )}
                style={{ transform: `rotate(${animationFrame}deg)` }}
              />
              {/* Pulsing moon overlay */}
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ opacity: pulseOpacity }}
              >
                <Moon className="w-6 h-6 text-purple-300" />
              </div>
              {/* Ping animation */}
              <div className="absolute inset-0 animate-ping">
                <Camera className="w-10 h-10 text-purple-400 opacity-20" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white">Dark Library</h2>
          </div>

          {/* Status information */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Moon className="w-5 h-5 text-indigo-400" />
              <span className="text-gray-300">Mode:</span>
              <span className="text-white font-semibold text-lg">
                Generating Dark Frames
              </span>
            </div>

            <div className="text-sm text-gray-400 pl-7">
              Creating calibration frames for noise reduction
            </div>
          </div>

          {/* Progress section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                <span className="text-gray-300">Generation Progress:</span>
              </div>
              <span className="text-white font-mono text-lg">
                {percentage?.toFixed(0)}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <Progress value={percentage} className="h-3 bg-gray-800">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </Progress>
              <div className="flex justify-between text-xs text-gray-500">
                <span>0%</span>
                <span className="text-gray-400">
                  {percentage < 100 ? "Processing..." : "Complete!"}
                </span>
                <span>100%</span>
              </div>
            </div>

            {/* Estimated time or frames info */}
            {percentage < 100 && (
              <div className="text-xs text-gray-500 text-center">
                Please keep the telescope covered during this process
              </div>
            )}
          </div>

          {/* Visual loading animation */}
          <div className="flex justify-center">
            <div className="flex space-x-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "w-3 h-3 rounded-full",
                    percentage < 100 ? "bg-purple-400" : "bg-green-400",
                    "animate-bounce"
                  )}
                  style={{
                    animationDelay: `${i * 0.15}s`,
                    animationDuration: "1.2s",
                    opacity: percentage < 100 ? 0.8 : 1
                  }}
                />
              ))}
            </div>
          </div>

          {/* Status message */}
          <div className="text-center text-sm">
            {percentage < 100 ? (
              <div>
                <p className="text-gray-400">Capturing dark frames for calibration...</p>
                <p className="text-xs text-gray-500 mt-1">
                  Dark frames help reduce sensor noise in your images
                </p>
              </div>
            ) : (
              <div>
                <p className="text-green-400 font-semibold">Dark library generation complete!</p>
                <p className="text-xs text-gray-500 mt-1">
                  Calibration frames ready for use
                </p>
              </div>
            )}
          </div>

          {/* Tips section */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-xs text-gray-400 space-y-1">
              <p className="font-semibold text-purple-300">Tips:</p>
              <ul className="space-y-0.5 ml-3">
                <li>• Ensure lens cap is on or telescope is covered</li>
                <li>• Keep temperature stable during capture</li>
                <li>• Dark frames match current sensor temperature</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
