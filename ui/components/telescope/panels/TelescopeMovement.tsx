"use client"

import { useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"

export function TelescopeMovement() {
  const { isTracking, setIsTracking, handleTelescopeMove } = useTelescopeContext()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const startContinuousMove = useCallback((direction: string) => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    
    // Send initial move command immediately
    handleTelescopeMove(direction)
    
    // Set up interval to send move commands every 500ms
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-lg">Telescope Control</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  )
}
