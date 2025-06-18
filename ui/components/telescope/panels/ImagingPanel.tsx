"use client"

import { Button } from "@/components/ui/button"
import { BarChart3, Camera, Target, Square } from "lucide-react"
import { useTelescopeContext } from "@/context/TelescopeContext"

export function ImagingPanel() {
  const { 
    imageStats, 
    setIsImaging, 
    selectedTarget,
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

      {/* Quality Metrics */}
      <div className="mb-4 p-3 bg-gray-800/50 rounded-md">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-4 h-4 text-green-400" />
          <span className="font-medium text-white">Quality Metrics</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-gray-400">Mean</div>
            <div className="text-white font-mono">{imageStats.mean.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-gray-400">Std Dev</div>
            <div className="text-white font-mono">{imageStats.std.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-gray-400">Min</div>
            <div className="text-white font-mono">{imageStats.min}</div>
          </div>
          <div>
            <div className="text-gray-400">Max</div>
            <div className="text-white font-mono">{imageStats.max}</div>
          </div>
        </div>
      </div>

      {/* Histogram */}
      <div className="p-3 bg-gray-800/50 rounded-md">
        <div className="font-medium text-white mb-2">Histogram</div>
        <div className="h-24 flex items-end justify-between gap-px">
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
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0</span>
          <span>128</span>
          <span>255</span>
        </div>
      </div>
    </div>
  )
}