"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Camera, Sliders, Filter } from "lucide-react"

interface ImagingParametersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  telescopeModel?: string
  targetName: string
  onConfirm: (params: { gain: number; lightPollutionFilter: boolean }) => void
  onCancel: () => void
}

export function ImagingParametersDialog({
  open,
  onOpenChange,
  telescopeModel,
  targetName,
  onConfirm,
  onCancel,
}: ImagingParametersDialogProps) {
  // Default gain based on telescope model
  const getDefaultGain = () => {
    if (telescopeModel?.toLowerCase().includes("s50")) {
      return 80
    } else if (telescopeModel?.toLowerCase().includes("s30")) {
      return 200
    }
    // Default for unknown models
    return 80
  }

  const [gain, setGain] = useState(getDefaultGain())
  const [lightPollutionFilter, setLightPollutionFilter] = useState(false)

  const handleConfirm = () => {
    onConfirm({ gain, lightPollutionFilter })
    onOpenChange(false)
  }

  const handleCancel = () => {
    onCancel()
    onOpenChange(false)
  }

  // Reset values when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setGain(getDefaultGain())
      setLightPollutionFilter(false)
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Imaging Parameters
          </DialogTitle>
          <DialogDescription>
            Configure imaging settings for <span className="font-semibold">{targetName}</span>
            {telescopeModel && (
              <span className="ml-1 text-xs">
                ({telescopeModel})
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Light Pollution Filter Toggle */}
          <div className="flex items-center justify-between space-x-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Label htmlFor="lpf" className="text-sm font-medium">
                Light Pollution Filter
              </Label>
            </div>
            <Switch
              id="lpf"
              checked={lightPollutionFilter}
              onCheckedChange={setLightPollutionFilter}
            />
          </div>

          {/* Gain Control */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="gain" className="text-sm font-medium">
                  Gain
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Input
                  id="gain-input"
                  type="number"
                  value={gain}
                  onChange={(e) => {
                    const value = parseInt(e.target.value)
                    if (!isNaN(value) && value >= 0 && value <= 400) {
                      setGain(value)
                    }
                  }}
                  className="w-20 h-8 text-right"
                  min={0}
                  max={400}
                />
              </div>
            </div>
            
            <Slider
              id="gain"
              value={[gain]}
              onValueChange={(value) => setGain(value[0])}
              min={0}
              max={400}
              step={10}
              className="w-full"
            />
            
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0</span>
              <span>100</span>
              <span>200</span>
              <span>300</span>
              <span>400</span>
            </div>

            {/* Recommended values hint */}
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <p className="font-medium mb-1">Recommended gain values:</p>
              <ul className="space-y-0.5">
                <li>• S50: 80 (default for nebulae/galaxies)</li>
                <li>• S30: 200 (higher sensitivity)</li>
                <li>• Bright objects: 0-50</li>
                <li>• Faint objects: 100-300</li>
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            <Camera className="w-4 h-4 mr-2" />
            Start Imaging
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}