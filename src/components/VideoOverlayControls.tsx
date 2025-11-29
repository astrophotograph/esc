import { type OverlaySettings } from './VideoOverlays'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Slider } from './ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

interface VideoOverlayControlsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: OverlaySettings
  onSettingsChange: (settings: OverlaySettings) => void
}

export function VideoOverlayControls({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
}: VideoOverlayControlsProps) {
  const updateSetting = <K extends keyof OverlaySettings>(
    category: K,
    key: keyof OverlaySettings[K],
    value: any
  ) => {
    onSettingsChange({
      ...settings,
      [category]: {
        ...settings[category],
        [key]: value,
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Video Overlay Settings</DialogTitle>
          <DialogDescription>
            Configure crosshairs, grid, compass, and measurement overlays
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="crosshairs" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="crosshairs">Crosshairs</TabsTrigger>
            <TabsTrigger value="grid">Grid</TabsTrigger>
            <TabsTrigger value="compass">Compass</TabsTrigger>
            <TabsTrigger value="measurements">Measurements</TabsTrigger>
          </TabsList>

          {/* Crosshairs Tab */}
          <TabsContent value="crosshairs" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="crosshairs-enabled">Enable Crosshairs</Label>
              <Switch
                id="crosshairs-enabled"
                checked={settings.crosshairs.enabled}
                onCheckedChange={(checked) =>
                  updateSetting('crosshairs', 'enabled', checked)
                }
              />
            </div>

            {settings.crosshairs.enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="crosshairs-style">Style</Label>
                  <Select
                    value={settings.crosshairs.style}
                    onValueChange={(value) =>
                      updateSetting('crosshairs', 'style', value)
                    }
                  >
                    <SelectTrigger id="crosshairs-style">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Simple</SelectItem>
                      <SelectItem value="circle">Circle</SelectItem>
                      <SelectItem value="target">Target</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="crosshairs-color">Color</Label>
                  <input
                    id="crosshairs-color"
                    type="color"
                    value={settings.crosshairs.color}
                    onChange={(e) =>
                      updateSetting('crosshairs', 'color', e.target.value)
                    }
                    className="w-full h-10 rounded cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="crosshairs-thickness">
                    Thickness: {settings.crosshairs.thickness}px
                  </Label>
                  <Slider
                    id="crosshairs-thickness"
                    min={1}
                    max={5}
                    step={1}
                    value={[settings.crosshairs.thickness]}
                    onValueChange={([value]) =>
                      updateSetting('crosshairs', 'thickness', value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="crosshairs-opacity">
                    Opacity: {Math.round(settings.crosshairs.opacity * 100)}%
                  </Label>
                  <Slider
                    id="crosshairs-opacity"
                    min={0}
                    max={1}
                    step={0.1}
                    value={[settings.crosshairs.opacity]}
                    onValueChange={([value]) =>
                      updateSetting('crosshairs', 'opacity', value)
                    }
                  />
                </div>
              </>
            )}
          </TabsContent>

          {/* Grid Tab */}
          <TabsContent value="grid" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="grid-enabled">Enable Grid</Label>
              <Switch
                id="grid-enabled"
                checked={settings.grid.enabled}
                onCheckedChange={(checked) =>
                  updateSetting('grid', 'enabled', checked)
                }
              />
            </div>

            {settings.grid.enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="grid-style">Style</Label>
                  <Select
                    value={settings.grid.style}
                    onValueChange={(value) =>
                      updateSetting('grid', 'style', value)
                    }
                  >
                    <SelectTrigger id="grid-style">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lines">Lines</SelectItem>
                      <SelectItem value="dots">Dots</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="grid-color">Color</Label>
                  <input
                    id="grid-color"
                    type="color"
                    value={settings.grid.color}
                    onChange={(e) =>
                      updateSetting('grid', 'color', e.target.value)
                    }
                    className="w-full h-10 rounded cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="grid-spacing">
                    Spacing: {settings.grid.spacing}px
                  </Label>
                  <Slider
                    id="grid-spacing"
                    min={20}
                    max={100}
                    step={10}
                    value={[settings.grid.spacing]}
                    onValueChange={([value]) =>
                      updateSetting('grid', 'spacing', value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="grid-opacity">
                    Opacity: {Math.round(settings.grid.opacity * 100)}%
                  </Label>
                  <Slider
                    id="grid-opacity"
                    min={0}
                    max={1}
                    step={0.1}
                    value={[settings.grid.opacity]}
                    onValueChange={([value]) =>
                      updateSetting('grid', 'opacity', value)
                    }
                  />
                </div>
              </>
            )}
          </TabsContent>

          {/* Compass Tab */}
          <TabsContent value="compass" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="compass-enabled">Enable Compass</Label>
              <Switch
                id="compass-enabled"
                checked={settings.compass.enabled}
                onCheckedChange={(checked) =>
                  updateSetting('compass', 'enabled', checked)
                }
              />
            </div>

            {settings.compass.enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="compass-color">Color</Label>
                  <input
                    id="compass-color"
                    type="color"
                    value={settings.compass.color}
                    onChange={(e) =>
                      updateSetting('compass', 'color', e.target.value)
                    }
                    className="w-full h-10 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="compass-cardinals">Show Cardinal Directions</Label>
                  <Switch
                    id="compass-cardinals"
                    checked={settings.compass.showCardinals}
                    onCheckedChange={(checked) =>
                      updateSetting('compass', 'showCardinals', checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="compass-degrees">Show Degrees</Label>
                  <Switch
                    id="compass-degrees"
                    checked={settings.compass.showDegrees}
                    onCheckedChange={(checked) =>
                      updateSetting('compass', 'showDegrees', checked)
                    }
                  />
                </div>
              </>
            )}
          </TabsContent>

          {/* Measurements Tab */}
          <TabsContent value="measurements" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="measurements-enabled">Enable Measurements</Label>
              <Switch
                id="measurements-enabled"
                checked={settings.measurements.enabled}
                onCheckedChange={(checked) =>
                  updateSetting('measurements', 'enabled', checked)
                }
              />
            </div>

            {settings.measurements.enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="measurements-color">Color</Label>
                  <input
                    id="measurements-color"
                    type="color"
                    value={settings.measurements.color}
                    onChange={(e) =>
                      updateSetting('measurements', 'color', e.target.value)
                    }
                    className="w-full h-10 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="measurements-scale">Show Scale Bar</Label>
                  <Switch
                    id="measurements-scale"
                    checked={settings.measurements.showScale}
                    onCheckedChange={(checked) =>
                      updateSetting('measurements', 'showScale', checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="measurements-coordinates">Show Coordinates</Label>
                  <Switch
                    id="measurements-coordinates"
                    checked={settings.measurements.showCoordinates}
                    onCheckedChange={(checked) =>
                      updateSetting('measurements', 'showCoordinates', checked)
                    }
                  />
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
