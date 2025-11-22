"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Settings, Zap } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"
import { useState, useEffect } from "react"
import { getWebSocketService, CommandAction } from "../../../services/websocket-service"

interface UpscalingSettings {
  enabled: boolean
  scale_factor: number
  method: string
  available_methods: string[]
}

export function ImageControls() {
  const { exposure, setExposure, gain, setGain, brightness, setBrightness, contrast, setContrast, currentTelescope } =
    useTelescopeContext()

  const [upscalingSettings, setUpscalingSettings] = useState<UpscalingSettings>({
    enabled: false,
    scale_factor: 2.0,
    method: "bicubic",
    available_methods: ["bicubic", "lanczos"]
  })

  const [isLoading, setIsLoading] = useState(false)

  // Fetch current upscaling settings on component mount and telescope change
  useEffect(() => {
    if (currentTelescope) {
      fetchUpscalingSettings()
    }
  }, [currentTelescope])

  const fetchUpscalingSettings = async () => {
    if (!currentTelescope) return

    try {
      console.log("Fetching upscaling settings via WebSocket for telescope:", currentTelescope.name)
      const wsService = getWebSocketService()

      // Use the same enhancement command to get upscaling settings
      const result = await wsService.sendCommand(
        CommandAction.GET_IMAGE_ENHANCEMENT,
        {},
        currentTelescope.name
      )

      // Map enhancement settings to upscaling settings format with safe defaults
      const upscalingData = {
        enabled: result?.upscaling_enabled ?? false,
        scale_factor: result?.scale_factor ?? 2.0,
        method: result?.upscaling_method ?? "bicubic",
        available_methods: result?.available_upscaling_methods ?? ["bicubic", "lanczos"]
      }

      setUpscalingSettings(upscalingData)
    } catch (error) {
      console.error("Failed to fetch upscaling settings:", error)
      // Keep default settings on error
    }
  }

  const updateUpscalingSettings = async (newSettings: Partial<UpscalingSettings>) => {
    if (!currentTelescope || isLoading) return

    setIsLoading(true)
    try {
      const updatedSettings = { ...upscalingSettings, ...newSettings }

      console.log("Updating upscaling settings via WebSocket:", updatedSettings)
      const wsService = getWebSocketService()

      // Send only upscaling-related settings
      const payload = {
        upscaling_enabled: updatedSettings.enabled,
        scale_factor: updatedSettings.scale_factor,
        upscaling_method: updatedSettings.method,
      }

      const result = await wsService.sendCommand(
        CommandAction.SET_IMAGE_ENHANCEMENT,
        payload,
        currentTelescope.name
      )

      // Map result back to upscaling settings format with safe defaults
      const upscalingData = {
        enabled: result?.upscaling_enabled ?? updatedSettings.enabled,
        scale_factor: result?.scale_factor ?? updatedSettings.scale_factor,
        method: result?.upscaling_method ?? updatedSettings.method,
        available_methods: result?.available_upscaling_methods ?? upscalingSettings.available_methods
      }

      setUpscalingSettings(upscalingData)
    } catch (error) {
      console.error("Failed to update upscaling settings:", error)
    } finally {
      setIsLoading(false)
    }
  }

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

        {/*<Separator className="bg-gray-600" />*/}

        {/*<div className="space-y-4">*/}
        {/*  <div className="flex items-center justify-between">*/}
        {/*    <div className="flex items-center gap-2">*/}
        {/*      <Zap className="w-4 h-4 text-blue-400" />*/}
        {/*      <Label className="text-gray-300">Super-Resolution</Label>*/}
        {/*    </div>*/}
        {/*    <Switch*/}
        {/*      checked={upscalingSettings.enabled}*/}
        {/*      onCheckedChange={(enabled) => updateUpscalingSettings({ enabled })}*/}
        {/*      disabled={isLoading}*/}
        {/*    />*/}
        {/*  </div>*/}

        {/*  {upscalingSettings.enabled && (*/}
        {/*    <>*/}
        {/*      <div className="space-y-2">*/}
        {/*        <div className="flex justify-between text-sm">*/}
        {/*          <span className="text-gray-300">Scale Factor</span>*/}
        {/*          <span className="text-white">{upscalingSettings.scale_factor}x</span>*/}
        {/*        </div>*/}
        {/*        <Slider*/}
        {/*          value={[upscalingSettings.scale_factor]}*/}
        {/*          onValueChange={([value]) => updateUpscalingSettings({ scale_factor: value })}*/}
        {/*          min={1.0}*/}
        {/*          max={4.0}*/}
        {/*          step={0.5}*/}
        {/*          className="w-full"*/}
        {/*          disabled={isLoading}*/}
        {/*        />*/}
        {/*      </div>*/}

        {/*      <div className="space-y-2">*/}
        {/*        <Label className="text-gray-300 text-sm">Method</Label>*/}
        {/*        <Select*/}
        {/*          value={upscalingSettings.method}*/}
        {/*          onValueChange={(method) => updateUpscalingSettings({ method })}*/}
        {/*          disabled={isLoading}*/}
        {/*        >*/}
        {/*          <SelectTrigger className="bg-gray-700 border-gray-600 text-white">*/}
        {/*            <SelectValue />*/}
        {/*          </SelectTrigger>*/}
        {/*          <SelectContent className="bg-gray-700 border-gray-600">*/}
        {/*            {(upscalingSettings.available_methods || []).map((method) => (*/}
        {/*              <SelectItem key={method} value={method} className="text-white hover:bg-gray-600">*/}
        {/*                {method.charAt(0).toUpperCase() + method.slice(1)}*/}
        {/*              </SelectItem>*/}
        {/*            ))}*/}
        {/*          </SelectContent>*/}
        {/*        </Select>*/}
        {/*      </div>*/}
        {/*    </>*/}
        {/*  )}*/}
        {/*</div>*/}
      </CardContent>
    </Card>
  )
}
