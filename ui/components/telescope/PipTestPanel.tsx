"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTelescopeContext } from "../../context/TelescopeContext"
import { Layers, Crosshair, Grid, Ruler, Compass, Eye, EyeOff, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function PipTestPanel() {
  const {
    showPiP,
    setShowPiP,
    pipCamera,
    setPipCamera,
    pipSize,
    setPipSize,
    pipOverlaySettings,
    setPipOverlaySettings,
    showPipOverlayControls,
    setShowPipOverlayControls,
  } = useTelescopeContext()

  // Toggle individual overlay types
  const toggleCrosshairs = () => {
    setPipOverlaySettings({
      ...pipOverlaySettings,
      crosshairs: {
        ...pipOverlaySettings.crosshairs,
        enabled: !pipOverlaySettings.crosshairs.enabled,
      },
    })
  }

  const toggleGrid = () => {
    setPipOverlaySettings({
      ...pipOverlaySettings,
      grid: {
        ...pipOverlaySettings.grid,
        enabled: !pipOverlaySettings.grid.enabled,
      },
    })
  }

  const toggleMeasurements = () => {
    setPipOverlaySettings({
      ...pipOverlaySettings,
      measurements: {
        ...pipOverlaySettings.measurements,
        enabled: !pipOverlaySettings.measurements.enabled,
      },
    })
  }

  const toggleCompass = () => {
    setPipOverlaySettings({
      ...pipOverlaySettings,
      compass: {
        ...pipOverlaySettings.compass,
        enabled: !pipOverlaySettings.compass.enabled,
      },
    })
  }

  // Cycle through crosshair styles
  const cycleCrosshairStyle = () => {
    const styles = ["simple", "circle", "target"] as const
    const currentIndex = styles.indexOf(pipOverlaySettings.crosshairs.style)
    const nextIndex = (currentIndex + 1) % styles.length
    setPipOverlaySettings({
      ...pipOverlaySettings,
      crosshairs: {
        ...pipOverlaySettings.crosshairs,
        style: styles[nextIndex],
      },
    })
  }

  // Cycle through grid styles
  const cycleGridStyle = () => {
    const styles = ["lines", "dots"] as const
    const currentIndex = styles.indexOf(pipOverlaySettings.grid.style)
    const nextIndex = (currentIndex + 1) % styles.length
    setPipOverlaySettings({
      ...pipOverlaySettings,
      grid: {
        ...pipOverlaySettings.grid,
        style: styles[nextIndex],
      },
    })
  }

  // Cycle through measurement units
  const cycleMeasurementUnit = () => {
    const units = ["arcmin", "arcsec", "pixels"] as const
    const currentIndex = units.indexOf(pipOverlaySettings.measurements.unit)
    const nextIndex = (currentIndex + 1) % units.length
    setPipOverlaySettings({
      ...pipOverlaySettings,
      measurements: {
        ...pipOverlaySettings.measurements,
        unit: units[nextIndex],
      },
    })
  }

  // Toggle all overlays on or off
  const toggleAllOverlays = (enabled: boolean) => {
    setPipOverlaySettings({
      ...pipOverlaySettings,
      crosshairs: { ...pipOverlaySettings.crosshairs, enabled },
      grid: { ...pipOverlaySettings.grid, enabled },
      measurements: { ...pipOverlaySettings.measurements, enabled },
      compass: { ...pipOverlaySettings.compass, enabled },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          PiP Overlay Test Panel
        </CardTitle>
        <CardDescription>Test and configure Picture-in-Picture overlays</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PiP Controls */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>PiP Display</Label>
            <div className="flex items-center space-x-2">
              <Switch id="pip-toggle" checked={showPiP} onCheckedChange={setShowPiP} />
              <Label htmlFor="pip-toggle">{showPiP ? "Enabled" : "Disabled"}</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Camera Feed</Label>
            <Select value={pipCamera} onValueChange={(value: "allsky" | "guide" | "finder") => setPipCamera(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select camera" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allsky">All-Sky</SelectItem>
                <SelectItem value="guide">Guide</SelectItem>
                <SelectItem value="finder">Finder</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>PiP Size</Label>
            <Select value={pipSize} onValueChange={(value: "small" | "medium" | "large" | "extra-large") => setPipSize(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
                <SelectItem value="extra-large">Extra Large</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Overlay Controls</Label>
            <div className="flex items-center space-x-2">
              <Switch
                id="overlay-controls"
                checked={showPipOverlayControls}
                onCheckedChange={setShowPipOverlayControls}
              />
              <Label htmlFor="overlay-controls">{showPipOverlayControls ? "Visible" : "Hidden"}</Label>
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <Tabs defaultValue="quick">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="quick">Quick Controls</TabsTrigger>
              <TabsTrigger value="status">Overlay Status</TabsTrigger>
            </TabsList>

            <TabsContent value="quick" className="space-y-4 pt-4">
              {/* Quick Controls */}
              <div className="grid grid-cols-2 gap-4">
                <Button
                  variant={pipOverlaySettings.crosshairs.enabled ? "default" : "outline"}
                  onClick={toggleCrosshairs}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Crosshair className="h-4 w-4" />
                    <span>Crosshairs</span>
                  </div>
                  <Badge variant="outline">{pipOverlaySettings.crosshairs.style}</Badge>
                </Button>

                <Button
                  variant="secondary"
                  onClick={cycleCrosshairStyle}
                  disabled={!pipOverlaySettings.crosshairs.enabled}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Change Style
                </Button>

                <Button
                  variant={pipOverlaySettings.grid.enabled ? "default" : "outline"}
                  onClick={toggleGrid}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Grid className="h-4 w-4" />
                    <span>Grid</span>
                  </div>
                  <Badge variant="outline">{pipOverlaySettings.grid.style}</Badge>
                </Button>

                <Button variant="secondary" onClick={cycleGridStyle} disabled={!pipOverlaySettings.grid.enabled}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Change Style
                </Button>

                <Button
                  variant={pipOverlaySettings.measurements.enabled ? "default" : "outline"}
                  onClick={toggleMeasurements}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Ruler className="h-4 w-4" />
                    <span>Measurements</span>
                  </div>
                  <Badge variant="outline">{pipOverlaySettings.measurements.unit}</Badge>
                </Button>

                <Button
                  variant="secondary"
                  onClick={cycleMeasurementUnit}
                  disabled={!pipOverlaySettings.measurements.enabled}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Change Unit
                </Button>

                <Button
                  variant={pipOverlaySettings.compass.enabled ? "default" : "outline"}
                  onClick={toggleCompass}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Compass className="h-4 w-4" />
                    <span>Compass</span>
                  </div>
                  <Badge variant="outline">{pipOverlaySettings.compass.showCardinals ? "Cardinals" : "Basic"}</Badge>
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => {
                    setPipOverlaySettings({
                      ...pipOverlaySettings,
                      compass: {
                        ...pipOverlaySettings.compass,
                        showCardinals: !pipOverlaySettings.compass.showCardinals,
                      },
                    })
                  }}
                  disabled={!pipOverlaySettings.compass.enabled}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Toggle Cardinals
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <Button variant="default" onClick={() => toggleAllOverlays(true)} className="w-full">
                  <Eye className="h-4 w-4 mr-2" />
                  All Overlays On
                </Button>

                <Button variant="destructive" onClick={() => toggleAllOverlays(false)} className="w-full">
                  <EyeOff className="h-4 w-4 mr-2" />
                  All Overlays Off
                </Button>
              </div>

              <Button variant="outline" onClick={() => setShowPipOverlayControls(true)} className="w-full">
                Advanced Overlay Settings
              </Button>
            </TabsContent>

            <TabsContent value="status" className="pt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Crosshairs</Label>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status:</span>
                      <Badge variant={pipOverlaySettings.crosshairs.enabled ? "default" : "outline"}>
                        {pipOverlaySettings.crosshairs.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Style:</span>
                      <span className="text-sm">{pipOverlaySettings.crosshairs.style}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Color:</span>
                      <div className="flex items-center gap-1">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: pipOverlaySettings.crosshairs.color }}
                        />
                        <span className="text-sm">{pipOverlaySettings.crosshairs.color}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Grid</Label>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status:</span>
                      <Badge variant={pipOverlaySettings.grid.enabled ? "default" : "outline"}>
                        {pipOverlaySettings.grid.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Style:</span>
                      <span className="text-sm">{pipOverlaySettings.grid.style}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Spacing:</span>
                      <span className="text-sm">{pipOverlaySettings.grid.spacing}px</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Measurements</Label>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status:</span>
                      <Badge variant={pipOverlaySettings.measurements.enabled ? "default" : "outline"}>
                        {pipOverlaySettings.measurements.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Unit:</span>
                      <span className="text-sm">{pipOverlaySettings.measurements.unit}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Scale:</span>
                      <Badge
                        variant={pipOverlaySettings.measurements.showScale ? "default" : "outline"}
                        className="text-xs"
                      >
                        {pipOverlaySettings.measurements.showScale ? "Visible" : "Hidden"}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Compass</Label>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status:</span>
                      <Badge variant={pipOverlaySettings.compass.enabled ? "default" : "outline"}>
                        {pipOverlaySettings.compass.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Cardinals:</span>
                      <Badge
                        variant={pipOverlaySettings.compass.showCardinals ? "default" : "outline"}
                        className="text-xs"
                      >
                        {pipOverlaySettings.compass.showCardinals ? "Visible" : "Hidden"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Degrees:</span>
                      <Badge
                        variant={pipOverlaySettings.compass.showDegrees ? "default" : "outline"}
                        className="text-xs"
                      >
                        {pipOverlaySettings.compass.showDegrees ? "Visible" : "Hidden"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="text-sm text-muted-foreground mb-2">Camera Information</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Camera:</span>
                      <Badge variant="secondary">{pipCamera}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Size:</span>
                      <Badge variant="secondary">{pipSize}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  )
}
