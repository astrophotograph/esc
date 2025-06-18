"use client"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { X, Crosshair, Grid3X3, Ruler, Compass, Settings, RotateCcw, Zap } from "lucide-react"
import { useTelescopeContext } from "../../context/TelescopeContext"

export function PipOverlayControls() {
  const { showPipOverlayControls, setShowPipOverlayControls, pipOverlaySettings, setPipOverlaySettings, currentTelescope, allskyUrls, setAllskyUrls } =
    useTelescopeContext()

  const [activeTab, setActiveTab] = useState("crosshairs")
  const [animationsEnabled, setAnimationsEnabled] = useState(true)

  if (!showPipOverlayControls) return null

  const updateCrosshairs = (updates: Partial<typeof pipOverlaySettings.crosshairs>) => {
    setPipOverlaySettings({
      ...pipOverlaySettings,
      crosshairs: { ...pipOverlaySettings.crosshairs, ...updates },
    })
  }

  const updateGrid = (updates: Partial<typeof pipOverlaySettings.grid>) => {
    setPipOverlaySettings({
      ...pipOverlaySettings,
      grid: { ...pipOverlaySettings.grid, ...updates },
    })
  }

  const updateMeasurements = (updates: Partial<typeof pipOverlaySettings.measurements>) => {
    setPipOverlaySettings({
      ...pipOverlaySettings,
      measurements: { ...pipOverlaySettings.measurements, ...updates },
    })
  }

  const updateCompass = (updates: Partial<typeof pipOverlaySettings.compass>) => {
    setPipOverlaySettings({
      ...pipOverlaySettings,
      compass: { ...pipOverlaySettings.compass, ...updates },
    })
  }

  const resetToDefaults = () => {
    setPipOverlaySettings({
      crosshairs: {
        enabled: true,
        color: "#ff0000",
        thickness: 2,
        style: "simple",
      },
      grid: {
        enabled: false,
        color: "#00ff00",
        spacing: 50,
        opacity: 0.5,
        style: "lines",
      },
      measurements: {
        enabled: false,
        color: "#ffff00",
        showScale: true,
        showCoordinates: false,
        unit: "arcmin",
      },
      compass: {
        enabled: false,
        color: "#00ffff",
        showCardinals: true,
        showDegrees: false,
      },
    })
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="bg-gray-800 border-gray-700 max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-white flex items-center gap-2">
            <Settings className="w-5 h-5" />
            PiP Overlay Settings
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-4">
              <Zap className="w-4 h-4 text-yellow-400" />
              <Label htmlFor="animations-enabled" className="text-white text-sm">
                Animations
              </Label>
              <Switch
                id="animations-enabled"
                checked={animationsEnabled}
                onCheckedChange={setAnimationsEnabled}
              />
            </div>
            <Button variant="ghost" size="sm" onClick={resetToDefaults} className="text-gray-400 hover:text-white">
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPipOverlayControls(false)}
              className="text-gray-400 hover:text-white h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="overflow-y-auto max-h-[calc(90vh-120px)]">
          {!animationsEnabled && (
            <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
              <div className="flex items-center gap-2 text-yellow-400 text-sm">
                <Zap className="w-4 h-4" />
                <span>Animations are disabled. Enable them for better overlay visibility.</span>
              </div>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5 bg-gray-700">
              <TabsTrigger value="general" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                General
              </TabsTrigger>
              <TabsTrigger value="crosshairs" className="flex items-center gap-2">
                <Crosshair className="w-4 h-4" />
                Crosshairs
              </TabsTrigger>
              <TabsTrigger value="grid" className="flex items-center gap-2">
                <Grid3X3 className="w-4 h-4" />
                Grid
              </TabsTrigger>
              <TabsTrigger value="measurements" className="flex items-center gap-2">
                <Ruler className="w-4 h-4" />
                Measurements
              </TabsTrigger>
              <TabsTrigger value="compass" className="flex items-center gap-2">
                <Compass className="w-4 h-4" />
                Compass
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="allsky-url" className="text-white">
                    All-Sky Camera URL for {currentTelescope?.name || 'Current Telescope'}
                  </Label>
                  <Input
                    id="allsky-url"
                    value={allskyUrls[currentTelescope?.id || ''] || ''}
                    onChange={(e) => {
                      const newUrls = { ...allskyUrls, [currentTelescope?.id || '']: e.target.value }
                      setAllskyUrls(newUrls)
                    }}
                    placeholder="http://allsky/current/tmp/image.jpg"
                    className="bg-gray-700 border-gray-600 text-white mt-2"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="crosshairs" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="crosshairs-enabled" className="text-white">
                  Enable Crosshairs
                </Label>
                <Switch
                  id="crosshairs-enabled"
                  checked={pipOverlaySettings.crosshairs.enabled}
                  onCheckedChange={(enabled) => updateCrosshairs({ enabled })}
                />
              </div>

              {pipOverlaySettings.crosshairs.enabled && (
                <>
                  <div className="space-y-2">
                    <Label className="text-white">Style</Label>
                    <Select
                      value={pipOverlaySettings.crosshairs.style}
                      onValueChange={(style: "simple" | "circle" | "target") => updateCrosshairs({ style })}
                    >
                      <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-700 border-gray-600">
                        <SelectItem value="simple">Simple Lines {animationsEnabled && "(with glow)"}</SelectItem>
                        <SelectItem value="circle">Circle with Lines {animationsEnabled && "(with pulse)"}</SelectItem>
                        <SelectItem value="target">Target Reticle {animationsEnabled && "(with rotation)"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={pipOverlaySettings.crosshairs.color}
                        onChange={(e) => updateCrosshairs({ color: e.target.value })}
                        className="w-12 h-8 rounded border border-gray-600"
                      />
                      <span className="text-gray-300 text-sm">{pipOverlaySettings.crosshairs.color}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Thickness: {pipOverlaySettings.crosshairs.thickness}px</Label>
                    <Slider
                      value={[pipOverlaySettings.crosshairs.thickness]}
                      onValueChange={([thickness]) => updateCrosshairs({ thickness })}
                      max={5}
                      min={1}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {animationsEnabled && (
                    <div className="p-3 bg-blue-900/20 border border-blue-600/30 rounded-lg">
                      <div className="text-blue-400 text-sm">
                        <strong>Animation Effects:</strong>
                        <ul className="mt-1 space-y-1 text-xs">
                          <li>• Center dot: Gentle pulsing for visibility</li>
                          <li>• Lines: Subtle glow effect</li>
                          {pipOverlaySettings.crosshairs.style === "target" && (
                            <li>• Target: Slow rotation (20s cycle)</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="grid" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="grid-enabled" className="text-white">
                  Enable Grid
                </Label>
                <Switch
                  id="grid-enabled"
                  checked={pipOverlaySettings.grid.enabled}
                  onCheckedChange={(enabled) => updateGrid({ enabled })}
                />
              </div>

              {pipOverlaySettings.grid.enabled && (
                <>
                  <div className="space-y-2">
                    <Label className="text-white">Style</Label>
                    <Select
                      value={pipOverlaySettings.grid.style}
                      onValueChange={(style: "lines" | "dots") => updateGrid({ style })}
                    >
                      <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-700 border-gray-600">
                        <SelectItem value="lines">Grid Lines {animationsEnabled && "(with shimmer)"}</SelectItem>
                        <SelectItem value="dots">Grid Dots {animationsEnabled && "(with shimmer)"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={pipOverlaySettings.grid.color}
                        onChange={(e) => updateGrid({ color: e.target.value })}
                        className="w-12 h-8 rounded border border-gray-600"
                      />
                      <span className="text-gray-300 text-sm">{pipOverlaySettings.grid.color}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Spacing: {pipOverlaySettings.grid.spacing}px</Label>
                    <Slider
                      value={[pipOverlaySettings.grid.spacing]}
                      onValueChange={([spacing]) => updateGrid({ spacing })}
                      max={100}
                      min={20}
                      step={10}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Opacity: {Math.round(pipOverlaySettings.grid.opacity * 100)}%</Label>
                    <Slider
                      value={[pipOverlaySettings.grid.opacity]}
                      onValueChange={([opacity]) => updateGrid({ opacity })}
                      max={1}
                      min={0.1}
                      step={0.1}
                      className="w-full"
                    />
                  </div>

                  {animationsEnabled && (
                    <div className="p-3 bg-green-900/20 border border-green-600/30 rounded-lg">
                      <div className="text-green-400 text-sm">
                        <strong>Animation Effects:</strong>
                        <ul className="mt-1 space-y-1 text-xs">
                          <li>• Shimmer: Gentle opacity cycling (4s cycle)</li>
                          <li>• Enhanced visibility in low contrast conditions</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="measurements" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="measurements-enabled" className="text-white">
                  Enable Measurements
                </Label>
                <Switch
                  id="measurements-enabled"
                  checked={pipOverlaySettings.measurements.enabled}
                  onCheckedChange={(enabled) => updateMeasurements({ enabled })}
                />
              </div>

              {pipOverlaySettings.measurements.enabled && (
                <>
                  <div className="space-y-2">
                    <Label className="text-white">Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={pipOverlaySettings.measurements.color}
                        onChange={(e) => updateMeasurements({ color: e.target.value })}
                        className="w-12 h-8 rounded border border-gray-600"
                      />
                      <span className="text-gray-300 text-sm">{pipOverlaySettings.measurements.color}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-scale" className="text-white">
                      Show Scale Bar {animationsEnabled && "(with blink)"}
                    </Label>
                    <Switch
                      id="show-scale"
                      checked={pipOverlaySettings.measurements.showScale}
                      onCheckedChange={(showScale) => updateMeasurements({ showScale })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-coordinates" className="text-white">
                      Show Coordinates {animationsEnabled && "(with pulse)"}
                    </Label>
                    <Switch
                      id="show-coordinates"
                      checked={pipOverlaySettings.measurements.showCoordinates}
                      onCheckedChange={(showCoordinates) => updateMeasurements({ showCoordinates })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Unit</Label>
                    <Select
                      value={pipOverlaySettings.measurements.unit}
                      onValueChange={(unit: "arcmin" | "arcsec" | "pixels") => updateMeasurements({ unit })}
                    >
                      <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-700 border-gray-600">
                        <SelectItem value="arcmin">Arc Minutes</SelectItem>
                        <SelectItem value="arcsec">Arc Seconds</SelectItem>
                        <SelectItem value="pixels">Pixels</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {animationsEnabled && (
                    <div className="p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
                      <div className="text-yellow-400 text-sm">
                        <strong>Animation Effects:</strong>
                        <ul className="mt-1 space-y-1 text-xs">
                          <li>• Scale bar: Gentle blinking (3s cycle)</li>
                          <li>• Coordinates: Soft pulsing for readability</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="compass" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="compass-enabled" className="text-white">
                  Enable Compass
                </Label>
                <Switch
                  id="compass-enabled"
                  checked={pipOverlaySettings.compass.enabled}
                  onCheckedChange={(enabled) => updateCompass({ enabled })}
                />
              </div>

              {pipOverlaySettings.compass.enabled && (
                <>
                  <div className="space-y-2">
                    <Label className="text-white">Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={pipOverlaySettings.compass.color}
                        onChange={(e) => updateCompass({ color: e.target.value })}
                        className="w-12 h-8 rounded border border-gray-600"
                      />
                      <span className="text-gray-300 text-sm">{pipOverlaySettings.compass.color}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-cardinals" className="text-white">
                      Show Cardinal Directions {animationsEnabled && "(with pulse)"}
                    </Label>
                    <Switch
                      id="show-cardinals"
                      checked={pipOverlaySettings.compass.showCardinals}
                      onCheckedChange={(showCardinals) => updateCompass({ showCardinals })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-degrees" className="text-white">
                      Show Degrees {animationsEnabled && "(with pulse)"}
                    </Label>
                    <Switch
                      id="show-degrees"
                      checked={pipOverlaySettings.compass.showDegrees}
                      onCheckedChange={(showDegrees) => updateCompass({ showDegrees })}
                    />
                  </div>

                  {animationsEnabled && (
                    <div className="p-3 bg-cyan-900/20 border border-cyan-600/30 rounded-lg">
                      <div className="text-cyan-400 text-sm">
                        <strong>Animation Effects:</strong>
                        <ul className="mt-1 space-y-1 text-xs">
                          <li>• Needle: Slow rotation (30s cycle)</li>
                          <li>• Circle: Gentle pulsing</li>
                          <li>• Text: Soft pulsing for visibility</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
