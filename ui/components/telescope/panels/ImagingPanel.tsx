"use client"

import { Button } from "@/components/ui/button"
import { Camera, Target, Square, Clock, Image, Timer } from "lucide-react"
import { useTelescopeContext } from "@/context/TelescopeContext"
import { useState, useEffect } from "react"

export function ImagingPanel() {
  const { 
    setIsImaging, 
    selectedTarget,
    addStatusAlert 
  } = useTelescopeContext()

  // Mock imaging session data - in a real implementation, this would come from the telescope context
  const [sessionProgress, setSessionProgress] = useState({
    currentExposure: 1,
    totalExposures: 50,
    elapsedTime: 0, // seconds
    estimatedTimeRemaining: 2700, // seconds (45 minutes)
    exposureDuration: 60, // seconds per exposure
  })

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionProgress(prev => ({
        ...prev,
        elapsedTime: prev.elapsedTime + 1,
        estimatedTimeRemaining: Math.max(0, prev.estimatedTimeRemaining - 1),
      }))
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const handleStopImaging = () => {
    setIsImaging(false)
    addStatusAlert({
      type: "info",
      title: "Imaging Stopped",
      message: "Telescope imaging session ended",
    })
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  const progressPercentage = (sessionProgress.currentExposure / sessionProgress.totalExposures) * 100

  return (
    <div className="absolute top-4 right-4 w-80 bg-black/80 backdrop-blur-sm rounded-lg p-4 text-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-red-400 flex items-center gap-2">
          <Camera className="w-4 h-4" />
          Recording Active
        </h3>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleStopImaging}
          className="h-8 px-3 text-red-400 hover:text-red-300 hover:bg-red-900/20"
        >
          <Square className="w-3 h-3 mr-1" />
          Stop
        </Button>
      </div>

      {selectedTarget && (
        <div className="mb-4 p-3 bg-gray-800/50 rounded-md">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-blue-400" />
            <span className="font-medium text-white">Target</span>
          </div>
          <div className="text-gray-300">{selectedTarget.name}</div>
          <div className="text-xs text-gray-400">{selectedTarget.type}</div>
        </div>
      )}

      {/* Imaging Session Progress */}
      <div className="mb-4 p-3 bg-gray-800/50 rounded-md">
        <div className="flex items-center gap-2 mb-3">
          <Image className="w-4 h-4 text-green-400" />
          <span className="font-medium text-white">Session Progress</span>
        </div>
        
        {/* Progress Bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Exposures</span>
            <span>{sessionProgress.currentExposure}/{sessionProgress.totalExposures}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-green-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="text-center text-xs text-gray-400 mt-1">
            {progressPercentage.toFixed(1)}% Complete
          </div>
        </div>

        {/* Time Information */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-blue-400" />
            <div>
              <div className="text-gray-400">Elapsed</div>
              <div className="text-white font-mono">{formatTime(sessionProgress.elapsedTime)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Timer className="w-3 h-3 text-orange-400" />
            <div>
              <div className="text-gray-400">Remaining</div>
              <div className="text-white font-mono">{formatTime(sessionProgress.estimatedTimeRemaining)}</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}