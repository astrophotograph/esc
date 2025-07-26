"use client"

import React, { useState } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  Filter,
  GripVertical
} from "lucide-react"

type ProcessingStep = 'upscaling' | 'denoise' | 'deconvolve' | 'sharpening'

interface SortableStepItemProps {
  step: ProcessingStep
  index: number
  isEnabled: boolean
  disabled: boolean
  getStepIcon: (step: ProcessingStep) => React.ReactNode
  getStepName: (step: ProcessingStep) => string
}

function SortableStepItem({ step, index, isEnabled, disabled, getStepIcon, getStepName }: SortableStepItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-3 p-2 rounded border transition-all ${
        isEnabled 
          ? 'bg-gray-800 border-gray-600' 
          : 'bg-gray-900 border-gray-700 opacity-50'
      } ${
        isDragging 
          ? 'opacity-50 scale-95 shadow-lg z-10' 
          : 'hover:bg-gray-750'
      } ${
        disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-4 text-center">{index + 1}</span>
        {getStepIcon(step)}
        <span className={`text-sm ${isEnabled ? 'text-white' : 'text-gray-500'}`}>
          {getStepName(step)}
        </span>
      </div>
      <div className="flex-1"></div>
      <GripVertical className={`w-4 h-4 text-gray-500 ${disabled ? '' : 'hover:text-gray-300'}`} />
    </div>
  )
}

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
  processing_order?: ProcessingStep[]
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
  // Default processing order
  const defaultOrder: ProcessingStep[] = ['upscaling', 'denoise', 'deconvolve', 'sharpening']
  const [processingOrder, setProcessingOrder] = useState<ProcessingStep[]>(
    settings.processing_order || defaultOrder
  )

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const updateSettings = (updates: Partial<ImageEnhancementSettings>) => {
    onChange(updates)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (active.id !== over?.id) {
      const oldIndex = processingOrder.indexOf(active.id as ProcessingStep)
      const newIndex = processingOrder.indexOf(over?.id as ProcessingStep)

      const newOrder = arrayMove(processingOrder, oldIndex, newIndex)
      setProcessingOrder(newOrder)
      updateSettings({ processing_order: newOrder })
    }
  }

  const getStepIcon = (step: ProcessingStep) => {
    switch (step) {
      case 'upscaling': return <Zap className="w-4 h-4" />
      case 'denoise': return <Filter className="w-4 h-4" />
      case 'deconvolve': return <Focus className="w-4 h-4" />
      case 'sharpening': return <Palette className="w-4 h-4" />
    }
  }

  const getStepName = (step: ProcessingStep) => {
    switch (step) {
      case 'upscaling': return 'Super Resolution'
      case 'denoise': return 'Denoising'
      case 'deconvolve': return 'Deconvolution'
      case 'sharpening': return 'Sharpening'
    }
  }

  const isStepEnabled = (step: ProcessingStep) => {
    switch (step) {
      case 'upscaling': return settings.upscaling_enabled
      case 'denoise': return settings.denoise_enabled
      case 'deconvolve': return settings.deconvolve_enabled
      case 'sharpening': return settings.sharpening_enabled
    }
  }

  const resetToDefaults = () => {
    const newOrder = defaultOrder
    setProcessingOrder(newOrder)
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
      processing_order: newOrder,
    })
  }

  const available_upscaling_methods = ["bicubic", "lanczos", "edsr", "fsrcnn", "esrgan"]
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
      {/* Processing Order */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-purple-400" />
          <Label className="text-gray-300">Processing Order</Label>
        </div>
        <div className="pl-6 space-y-2">
          <p className="text-xs text-gray-500">Drag items to reorder processing steps. Only enabled steps will be applied.</p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={processingOrder}
              strategy={verticalListSortingStrategy}
            >
              {processingOrder.map((step, index) => (
                <SortableStepItem
                  key={step}
                  step={step}
                  index={index}
                  isEnabled={isStepEnabled(step)}
                  disabled={disabled}
                  getStepIcon={getStepIcon}
                  getStepName={getStepName}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <Separator className="border-gray-700" />

      {/* Super Resolution */}
      {/*<div className="space-y-3">*/}
      {/*  <div className="flex items-center justify-between">*/}
      {/*    <div className="flex items-center gap-2">*/}
      {/*      <Zap className="w-4 h-4 text-blue-400" />*/}
      {/*      <Label className="text-gray-300">Super Resolution</Label>*/}
      {/*    </div>*/}
      {/*    <Switch*/}
      {/*      checked={settings.upscaling_enabled}*/}
      {/*      onCheckedChange={(enabled) => updateSettings({ upscaling_enabled: enabled })}*/}
      {/*      disabled={disabled}*/}
      {/*    />*/}
      {/*  </div>*/}

      {/*  {settings.upscaling_enabled && (*/}
      {/*    <div className="pl-6 space-y-3">*/}
      {/*      <div className="space-y-2">*/}
      {/*        <div className="flex justify-between text-sm">*/}
      {/*          <span className="text-gray-400">Scale Factor</span>*/}
      {/*          <span className="text-white">{settings.scale_factor}x</span>*/}
      {/*        </div>*/}
      {/*        <Slider*/}
      {/*          value={[settings.scale_factor]}*/}
      {/*          onValueChange={([value]) => updateSettings({ scale_factor: value })}*/}
      {/*          min={1.0}*/}
      {/*          max={4.0}*/}
      {/*          step={0.5}*/}
      {/*          className="w-full"*/}
      {/*          disabled={disabled}*/}
      {/*        />*/}
      {/*      </div>*/}

      {/*      <div className="space-y-2">*/}
      {/*        <Label className="text-gray-400 text-sm">Method</Label>*/}
      {/*        <Select*/}
      {/*          value={settings.upscaling_method}*/}
      {/*          onValueChange={(method) => updateSettings({ upscaling_method: method })}*/}
      {/*          disabled={disabled}*/}
      {/*        >*/}
      {/*          <SelectTrigger className="bg-gray-800 border-gray-600 text-white">*/}
      {/*            <SelectValue />*/}
      {/*          </SelectTrigger>*/}
      {/*          <SelectContent className="bg-gray-800 border-gray-600">*/}
      {/*            {available_upscaling_methods.map((method) => (*/}
      {/*              <SelectItem key={method} value={method} className="text-white hover:bg-gray-700">*/}
      {/*                {method.charAt(0).toUpperCase() + method.slice(1).replace(/_/g, ' ')}*/}
      {/*              </SelectItem>*/}
      {/*            ))}*/}
      {/*          </SelectContent>*/}
      {/*        </Select>*/}
      {/*      </div>*/}
      {/*    </div>*/}
      {/*  )}*/}
      {/*</div>*/}

      {/*<Separator className="bg-gray-700" />*/}

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
