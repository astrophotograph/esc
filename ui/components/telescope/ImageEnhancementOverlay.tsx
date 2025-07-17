"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { 
  Settings, 
  Zap, 
  Focus, 
  Palette, 
  RotateCcw,
  X,
  ChevronUp,
  ChevronDown,
  Sparkles
} from "lucide-react"
import { useTelescopeContext } from "../../context/TelescopeContext"

interface ImageEnhancementSettings {
  upscaling_enabled: boolean
  scale_factor: number
  upscaling_method: string
  available_upscaling_methods: string[]
  sharpening_enabled: boolean
  sharpening_method: string
  sharpening_strength: number
  available_sharpening_methods: string[]
  invert_enabled: boolean
  stretch_parameter: string
  available_stretch_parameters: string[]
}

interface ImageEnhancementOverlayProps {
  isVisible: boolean
  onToggle: () => void
  onClose: () => void
}

export function ImageEnhancementOverlay({ 
  isVisible, 
  onToggle, 
  onClose 
}: ImageEnhancementOverlayProps) {
  const { currentTelescope } = useTelescopeContext()
  const [settings, setSettings] = useState<ImageEnhancementSettings>({
    upscaling_enabled: false,
    scale_factor: 2.0,
    upscaling_method: "bicubic",
    available_upscaling_methods: ["bicubic", "lanczos"],
    sharpening_enabled: false,
    sharpening_method: "unsharp_mask",
    sharpening_strength: 1.0,
    available_sharpening_methods: ["none", "unsharp_mask", "laplacian", "high_pass"],
    invert_enabled: false,
    stretch_parameter: "15% Bg, 3 sigma",
    available_stretch_parameters: [
      "No Stretch", 
      "10% Bg, 3 sigma", 
      "15% Bg, 3 sigma", 
      "20% Bg, 3 sigma", 
      "30% Bg, 2 sigma"
    ]
  })
  
  const [isLoading, setIsLoading] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    if (currentTelescope && isVisible) {
      console.log("Current telescope:", currentTelescope)
      console.log("Should fetch settings for visible overlay")
      fetchSettings()
    }
  }, [currentTelescope, isVisible])

  const fetchSettings = async () => {
    if (!currentTelescope) return
    
    try {
      console.log("Fetching enhancement settings from:", `http://localhost:8000/api/${currentTelescope.host}/enhancement`)
      const response = await fetch(`http://localhost:8000/api/${currentTelescope.host}/enhancement`)
      console.log("Response status:", response.status, response.statusText)
      
      if (response.ok) {
        const data = await response.json()
        console.log("Received enhancement settings:", data)
        setSettings(data)
      } else {
        console.error("Failed to fetch enhancement settings - response not ok:", response.status, response.statusText)
        const errorText = await response.text()
        console.error("Error response body:", errorText)
      }
    } catch (error) {
      console.error("Failed to fetch enhancement settings:", error)
    }
  }

  const updateSettings = async (newSettings: Partial<ImageEnhancementSettings>) => {
    if (!currentTelescope || isLoading) return
    
    console.log("Updating settings with:", newSettings)
    setIsLoading(true)
    try {
      const updatedSettings = { ...settings, ...newSettings }
      console.log("Full settings payload:", updatedSettings)
      
      const payload = {
        upscaling_enabled: updatedSettings.upscaling_enabled,
        scale_factor: updatedSettings.scale_factor,
        upscaling_method: updatedSettings.upscaling_method,
        sharpening_enabled: updatedSettings.sharpening_enabled,
        sharpening_method: updatedSettings.sharpening_method,
        sharpening_strength: updatedSettings.sharpening_strength,
        invert_enabled: updatedSettings.invert_enabled,
        stretch_parameter: updatedSettings.stretch_parameter,
      }
      
      console.log("Sending payload:", payload)
      
      const response = await fetch(`http://localhost:8000/api/${currentTelescope.host}/enhancement`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      
      console.log("Update response status:", response.status, response.statusText)
      
      if (response.ok) {
        const data = await response.json()
        console.log("Received updated settings:", data)
        setSettings(data)
      } else {
        console.error("Failed to update enhancement settings - response not ok:", response.status)
        const errorText = await response.text()
        console.error("Error response body:", errorText)
      }
    } catch (error) {
      console.error("Failed to update enhancement settings:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const resetToDefaults = () => {
    updateSettings({
      upscaling_enabled: false,
      scale_factor: 2.0,
      upscaling_method: "bicubic",
      sharpening_enabled: false,
      sharpening_method: "unsharp_mask",
      sharpening_strength: 1.0,
      invert_enabled: false,
      stretch_parameter: "15% Bg, 3 sigma",
    })
  }

  const getActiveEnhancementsCount = () => {
    let count = 0
    if (settings.upscaling_enabled) count++
    if (settings.sharpening_enabled) count++
    if (settings.invert_enabled) count++
    if (settings.stretch_parameter !== "No Stretch") count++
    return count
  }

  if (!isVisible) return null

  return (
    <div 
      className="fixed top-4 right-4 z-50 w-80 max-h-[80vh] overflow-hidden"
      style={{ backdropFilter: 'blur(8px)' }}
    >
      <Card className="bg-gray-900/95 border-gray-700 shadow-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Image Enhancement
              {getActiveEnhancementsCount() > 0 && (
                <Badge variant="secondary" className="bg-purple-600 text-white">
                  {getActiveEnhancementsCount()}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="text-gray-400 hover:text-white p-1"
              >
                {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-gray-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        {!isCollapsed && (
          <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Super Resolution */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-400" />
                  <Label className="text-gray-300">Super Resolution</Label>
                </div>
                <Switch
                  checked={settings.upscaling_enabled}
                  onCheckedChange={(enabled) => updateSettings({ upscaling_enabled: enabled })}
                  disabled={isLoading}
                />
              </div>

              {settings.upscaling_enabled && (
                <div className="pl-6 space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Scale Factor</span>
                      <span className="text-white">{settings.scale_factor}x</span>
                    </div>
                    <Slider
                      value={[settings.scale_factor]}
                      onValueChange={([value]) => updateSettings({ scale_factor: value })}
                      min={1.0}
                      max={4.0}
                      step={0.5}
                      className="w-full"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-400 text-sm">Method</Label>
                    <Select
                      value={settings.upscaling_method}
                      onValueChange={(method) => updateSettings({ upscaling_method: method })}
                      disabled={isLoading}
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-600">
                        {settings.available_upscaling_methods.map((method) => (
                          <SelectItem key={method} value={method} className="text-white hover:bg-gray-700">
                            {method.charAt(0).toUpperCase() + method.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <Separator className="bg-gray-700" />

            {/* Sharpening */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Focus className="w-4 h-4 text-green-400" />
                  <Label className="text-gray-300">Sharpening</Label>
                </div>
                <Switch
                  checked={settings.sharpening_enabled}
                  onCheckedChange={(enabled) => updateSettings({ sharpening_enabled: enabled })}
                  disabled={isLoading}
                />
              </div>

              {settings.sharpening_enabled && (
                <div className="pl-6 space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Strength</span>
                      <span className="text-white">{settings.sharpening_strength.toFixed(1)}</span>
                    </div>
                    <Slider
                      value={[settings.sharpening_strength]}
                      onValueChange={([value]) => updateSettings({ sharpening_strength: value })}
                      min={0.0}
                      max={2.0}
                      step={0.1}
                      className="w-full"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-400 text-sm">Method</Label>
                    <Select
                      value={settings.sharpening_method}
                      onValueChange={(method) => updateSettings({ sharpening_method: method })}
                      disabled={isLoading}
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-600">
                        {settings.available_sharpening_methods.map((method) => (
                          <SelectItem key={method} value={method} className="text-white hover:bg-gray-700">
                            {method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <Separator className="bg-gray-700" />

            {/* Stretch Parameters */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-orange-400" />
                <Label className="text-gray-300">Stretch Algorithm</Label>
              </div>
              
              <Select
                value={settings.stretch_parameter}
                onValueChange={(param) => updateSettings({ stretch_parameter: param })}
                disabled={isLoading}
              >
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  {settings.available_stretch_parameters.map((param) => (
                    <SelectItem key={param} value={param} className="text-white hover:bg-gray-700">
                      {param}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator className="bg-gray-700" />

            {/* Image Inversion */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-red-400" />
                  <Label className="text-gray-300">Invert Colors</Label>
                </div>
                <Switch
                  checked={settings.invert_enabled}
                  onCheckedChange={(enabled) => updateSettings({ invert_enabled: enabled })}
                  disabled={isLoading}
                />
              </div>
            </div>

            <Separator className="bg-gray-700" />

            {/* Reset Button */}
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={resetToDefaults}
                disabled={isLoading}
                className="w-full bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
              >
                <Settings className="w-4 h-4 mr-2" />
                Reset to Defaults
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}