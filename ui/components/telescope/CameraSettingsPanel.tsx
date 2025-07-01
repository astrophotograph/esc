"use client"

import { useState } from "react"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTelescopeContext } from "../../context/TelescopeContext"
import { CameraIcon, RotateCw, ZapIcon } from "lucide-react"

export const CameraSettingsPanel = () => {
  const {
    exposure,
    setExposure,
    gain,
    setGain,
    brightness,
    setBrightness,
    contrast,
    setContrast,
    isTracking,
    setIsTracking,
  } = useTelescopeContext()

  const [autoExposure, setAutoExposure] = useState(false)
  const [autoGain, setAutoGain] = useState(false)
  const [captureMode, setCaptureMode] = useState<"single" | "continuous" | "sequence">("single")
  const [fileFormat, setFileFormat] = useState<"raw" | "jpg" | "fits">("raw")

  const handleReset = () => {
    setExposure([1.0])
    setGain([50])
    setBrightness([0])
    setContrast([100])
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium flex items-center">
          <CameraIcon className="mr-2 h-5 w-5" />
          Camera Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="exposure" className="w-full">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="exposure">Exposure</TabsTrigger>
            <TabsTrigger value="image">Image</TabsTrigger>
          </TabsList>

          <TabsContent value="exposure" className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="exposure" className="flex items-center">
                  Exposure (s)
                </Label>
                <div className="flex items-center space-x-2">
                  <Label htmlFor="auto-exposure" className="text-sm">
                    Auto
                  </Label>
                  <Switch id="auto-exposure" checked={autoExposure} onCheckedChange={setAutoExposure} />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Slider
                  id="exposure"
                  disabled={autoExposure}
                  min={0.001}
                  max={30}
                  step={0.001}
                  value={exposure}
                  onValueChange={setExposure}
                />
                <span className="w-12 text-right">{exposure[0].toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="gain" className="flex items-center">
                  Gain
                </Label>
                <div className="flex items-center space-x-2">
                  <Label htmlFor="auto-gain" className="text-sm">
                    Auto
                  </Label>
                  <Switch id="auto-gain" checked={autoGain} onCheckedChange={setAutoGain} />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Slider id="gain" disabled={autoGain} min={0} max={100} step={1} value={gain} onValueChange={setGain} />
                <span className="w-12 text-right">{gain[0]}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center space-x-2">
                <Switch id="tracking" checked={isTracking} onCheckedChange={setIsTracking} />
                <Label htmlFor="tracking">Tracking</Label>
              </div>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="image" className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="brightness">Brightness</Label>
                <span>{brightness[0]}</span>
              </div>
              <Slider id="brightness" min={-50} max={50} step={1} value={brightness} onValueChange={setBrightness} />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="contrast">Contrast</Label>
                <span>{contrast[0]}</span>
              </div>
              <Slider id="contrast" min={50} max={200} step={1} value={contrast} onValueChange={setContrast} />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <div>
                <Label htmlFor="capture-mode" className="text-sm mb-1 block">
                  Capture Mode
                </Label>
                <select
                  id="capture-mode"
                  className="w-full rounded-md border border-gray-300 p-2 text-sm"
                  value={captureMode}
                  onChange={(e) => setCaptureMode(e.target.value as "single" | "continuous" | "sequence")}
                >
                  <option value="single">Single</option>
                  <option value="continuous">Continuous</option>
                  <option value="sequence">Sequence</option>
                </select>
              </div>
              <div>
                <Label htmlFor="file-format" className="text-sm mb-1 block">
                  File Format
                </Label>
                <select
                  id="file-format"
                  className="w-full rounded-md border border-gray-300 p-2 text-sm"
                  value={fileFormat}
                  onChange={(e) => setFileFormat(e.target.value as "raw" | "jpg" | "fits")}
                >
                  <option value="raw">RAW</option>
                  <option value="jpg">JPG</option>
                  <option value="fits">FITS</option>
                </select>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <Button className="w-full">
            <ZapIcon className="h-4 w-4 mr-2" />
            Capture Image
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default CameraSettingsPanel
