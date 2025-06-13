"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Settings } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"

export function ImageControls() {
  const { exposure, setExposure, gain, setGain, brightness, setBrightness, contrast, setContrast } =
    useTelescopeContext()

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Image Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  )
}
