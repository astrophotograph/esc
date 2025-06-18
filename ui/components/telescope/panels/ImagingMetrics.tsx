"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BarChart3, Target, Square, Camera } from "lucide-react"
import { useTelescopeContext } from "@/context/TelescopeContext"

export function ImagingMetrics() {
  const { 
    imageStats, 
    selectedTarget,
    setIsImaging,
    addStatusAlert 
  } = useTelescopeContext()

  const handleStopImaging = () => {
    setIsImaging(false)
    addStatusAlert({
      type: "info",
      title: "Imaging Stopped",
      message: "Telescope imaging session ended",
    })
  }

  return (
    <div className="space-y-4">
      {/* Recording Status */}
      <Card className="bg-gray-800 border-gray-700 border-red-500/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-red-400 text-lg flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Recording Active
            <div className="ml-auto">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedTarget && (
            <div className="p-3 bg-gray-700/50 rounded-md">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-blue-400" />
                <span className="font-medium text-white">Target</span>
              </div>
              <div className="text-gray-300">{selectedTarget.name}</div>
              <div className="text-sm text-gray-400">{selectedTarget.type}</div>
            </div>
          )}
          
          <Button 
            onClick={handleStopImaging}
            className="w-full bg-red-600 hover:bg-red-700 text-white"
          >
            <Square className="w-4 h-4 mr-2" />
            Stop Recording
          </Button>
        </CardContent>
      </Card>

      {/* Quality Metrics */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-green-400 text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Quality Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-gray-700/50 rounded-md text-center">
              <div className="text-xs text-gray-400 mb-1">Mean</div>
              <div className="text-lg font-mono text-white">{imageStats.mean.toFixed(1)}</div>
            </div>
            <div className="p-3 bg-gray-700/50 rounded-md text-center">
              <div className="text-xs text-gray-400 mb-1">Std Dev</div>
              <div className="text-lg font-mono text-white">{imageStats.std.toFixed(1)}</div>
            </div>
            <div className="p-3 bg-gray-700/50 rounded-md text-center">
              <div className="text-xs text-gray-400 mb-1">Min</div>
              <div className="text-lg font-mono text-white">{imageStats.min}</div>
            </div>
            <div className="p-3 bg-gray-700/50 rounded-md text-center">
              <div className="text-xs text-gray-400 mb-1">Max</div>
              <div className="text-lg font-mono text-white">{imageStats.max}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Histogram */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-blue-400 text-lg">Histogram</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-end justify-between gap-px bg-gray-900/50 rounded p-3">
            {imageStats.histogram.map((value, index) => (
              <div
                key={index}
                className="bg-blue-400 transition-all duration-300 min-w-[2px] flex-1"
                style={{
                  height: `${(value / Math.max(...imageStats.histogram)) * 100}%`,
                  minHeight: value > 0 ? '2px' : '0px'
                }}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-2">
            <span>0</span>
            <span>128</span>
            <span>255</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}