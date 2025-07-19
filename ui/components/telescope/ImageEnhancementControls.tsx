"use client"

import React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { 
  Settings, 
  Zap, 
  Focus, 
  Palette, 
  RotateCcw,
  Filter
} from "lucide-react"

interface ImageEnhancementSettings {
  upscaling_enabled: boolean
  scale_factor: number
  upscaling_method: string
  sharpening_enabled: boolean
  sharpening_method: string
  sharpening_strength: number
  denoise_enabled: boolean
  denoise_method: string
  denoise_strength: number
  deconvolve_enabled: boolean
  deconvolve_strength: number
  deconvolve_psf_size: number
  stretch_parameter: string
}

interface ImageEnhancementControlsProps {
  settings: ImageEnhancementSettings
  onChange: (settings: Partial<ImageEnhancementSettings>) => void
  onApply?: () => void
  disabled?: boolean
}

export function ImageEnhancementControls({ 
  settings, 
  onChange,
  onApply,
  disabled = false
}: ImageEnhancementControlsProps) {
  const updateSettings = (updates: Partial<ImageEnhancementSettings>) => {
    onChange(updates)
  }

  const resetToDefaults = () => {
    onChange({
      upscaling_enabled: false,
      scale_factor: 2.0,
      upscaling_method: "bicubic",
      sharpening_enabled: false,
      sharpening_method: "unsharp_mask",
      sharpening_strength: 1.0,
      denoise_enabled: false,
      denoise_method: "tv_chambolle",
      denoise_strength: 1.0,
      deconvolve_enabled: false,
      deconvolve_strength: 0.5,
      deconvolve_psf_size: 2.0,
      stretch_parameter: "15% Bg, 3 sigma",
    })
  }

  const available_upscaling_methods = ["bicubic", "lanczos", "edsr", "fsrcnn", "esrgan", "real_esrgan", "waifu2x"]
  const available_sharpening_methods = ["none", "unsharp_mask", "laplacian", "high_pass"]
  const available_denoise_methods = ["none", "tv_chambolle", "bilateral", "non_local_means", "wavelet", "gaussian", "median"]
  const available_stretch_parameters = [
    "No Stretch", 
    "10% Bg, 3 sigma", 
    "15% Bg, 3 sigma", 
    "20% Bg, 3 sigma", 
    "30% Bg, 2 sigma"
  ]

  return (
    <div className="space-y-4">
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
            disabled={disabled}
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
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-400 text-sm">Method</Label>
              <Select
                value={settings.upscaling_method}
                onValueChange={(method) => updateSettings({ upscaling_method: method })}
                disabled={disabled}
              >
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  {available_upscaling_methods.map((method) => (
                    <SelectItem key={method} value={method} className="text-white hover:bg-gray-700">
                      {method.charAt(0).toUpperCase() + method.slice(1).replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <Separator className="bg-gray-700" />

      {/* Denoising */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-purple-400" />
            <Label className="text-gray-300">Denoising</Label>
          </div>
          <Switch
            checked={settings.denoise_enabled}
            onCheckedChange={(enabled) => updateSettings({ denoise_enabled: enabled })}
            disabled={disabled}
          />
        </div>

        {settings.denoise_enabled && (
          <div className="pl-6 space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Strength</span>
                <span className="text-white">{settings.denoise_strength.toFixed(1)}</span>
              </div>
              <Slider
                value={[settings.denoise_strength]}
                onValueChange={([value]) => updateSettings({ denoise_strength: value })}
                min={0.0}
                max={2.0}
                step={0.1}
                className="w-full"
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-400 text-sm">Method</Label>
              <Select
                value={settings.denoise_method}
                onValueChange={(method) => updateSettings({ denoise_method: method })}
                disabled={disabled}
              >
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  {available_denoise_methods.map((method) => (
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
            disabled={disabled}
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
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-400 text-sm">Method</Label>
              <Select
                value={settings.sharpening_method}
                onValueChange={(method) => updateSettings({ sharpening_method: method })}
                disabled={disabled}
              >
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  {available_sharpening_methods.map((method) => (
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
          disabled={disabled}
        >
          <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-600">
            {available_stretch_parameters.map((param) => (
              <SelectItem key={param} value={param} className="text-white hover:bg-gray-700">
                {param}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator className="bg-gray-700" />

      {/* Deconvolution */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" />
            <Label className="text-gray-300">Deconvolution</Label>
          </div>
          <Switch
            checked={settings.deconvolve_enabled}
            onCheckedChange={(enabled) => updateSettings({ deconvolve_enabled: enabled })}
            disabled={disabled}
          />
        </div>

        {settings.deconvolve_enabled && (
          <div className="pl-6 space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Strength</span>
                <span className="text-white">{settings.deconvolve_strength.toFixed(2)}</span>
              </div>
              <Slider
                value={[settings.deconvolve_strength]}
                onValueChange={([value]) => updateSettings({ deconvolve_strength: value })}
                min={0.1}
                max={1.0}
                step={0.1}
                className="w-full"
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">PSF Size</span>
                <span className="text-white">{settings.deconvolve_psf_size.toFixed(1)}</span>
              </div>
              <Slider
                value={[settings.deconvolve_psf_size]}
                onValueChange={([value]) => updateSettings({ deconvolve_psf_size: value })}
                min={0.5}
                max={10.0}
                step={0.5}
                className="w-full"
                disabled={disabled}
              />
            </div>
          </div>
        )}
      </div>

      <Separator className="bg-gray-700" />

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={resetToDefaults}
          disabled={disabled}
          className="flex-1 bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          <Settings className="w-4 h-4 mr-2" />
          Reset to Defaults
        </Button>
        {onApply && (
          <Button
            onClick={onApply}
            disabled={disabled}
            className="flex-1"
          >
            Apply Enhancements
          </Button>
        )}
      </div>
    </div>
  )
}