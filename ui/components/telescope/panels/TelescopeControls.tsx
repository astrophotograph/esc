"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw, Focus, Settings } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"

export function TelescopeControls() {
  const {
    isTracking,
    setIsTracking,
    handleTelescopeMove,
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
  } = useTelescopeContext()

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Telescope Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Movement Controls */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">Movement & Tracking</h4>
          <div className="grid grid-cols-3 gap-2">
            <div></div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTelescopeMove("north")}
              className="border-gray-600 text-white hover:bg-gray-700"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
            <div></div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTelescopeMove("west")}
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
              onClick={() => handleTelescopeMove("east")}
              className="border-gray-600 text-white hover:bg-gray-700"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
            <div></div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTelescopeMove("south")}
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
        </div>

        <Separator className="bg-gray-700" />

        {/* Focus Controls */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Focus className="w-4 h-4" />
            Focus Control
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-300">Position</span>
              <span className="text-white">{focusPosition[0]}</span>
            </div>
            <Slider value={focusPosition} onValueChange={setFocusPosition} max={10000} step={10} className="w-full" />
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

        <Separator className="bg-gray-700" />

        {/* Image Controls */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-300">Image Settings</h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">Exposure</span>
                <span className="text-white">{exposure[0]}s</span>
              </div>
              <Slider value={exposure} onValueChange={setExposure} min={0.1} max={30} step={0.1} className="w-full" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">Gain</span>
                <span className="text-white">{gain[0]}</span>
              </div>
              <Slider value={gain} onValueChange={setGain} min={0} max={100} step={1} className="w-full" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">Brightness</span>
                <span className="text-white">{brightness[0]}</span>
              </div>
              <Slider value={brightness} onValueChange={setBrightness} min={-50} max={50} step={1} className="w-full" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">Contrast</span>
                <span className="text-white">{contrast[0]}%</span>
              </div>
              <Slider value={contrast} onValueChange={setContrast} min={50} max={200} step={5} className="w-full" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
