"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useTelescopeContext } from "../../context/TelescopeContext"
import { Eye, EyeOff, RotateCcw } from "lucide-react"

export function AnnotationControls() {
  const { annotationSettings, setAnnotationSettings, showAnnotations, setShowAnnotations } = useTelescopeContext()

  const updateSettings = (updates: Partial<typeof annotationSettings>) => {
    setAnnotationSettings({ ...annotationSettings, ...updates })
  }

  const updateAppearance = (updates: Partial<typeof annotationSettings.appearance>) => {
    setAnnotationSettings({
      ...annotationSettings,
      appearance: { ...annotationSettings.appearance, ...updates },
    })
  }

  const updateBehavior = (updates: Partial<typeof annotationSettings.behavior>) => {
    setAnnotationSettings({
      ...annotationSettings,
      behavior: { ...annotationSettings.behavior, ...updates },
    })
  }

  const updateObjectTypes = (updates: Partial<typeof annotationSettings.objectTypes>) => {
    setAnnotationSettings({
      ...annotationSettings,
      objectTypes: { ...annotationSettings.objectTypes, ...updates },
    })
  }

  const toggleAnnotations = () => {
    const newState = !showAnnotations
    setShowAnnotations(newState)
    // Also sync the annotation settings enabled state
    updateSettings({ enabled: newState })
  }

  const resetToDefaults = () => {
    const defaultSettings = {
      enabled: true,
      showLabels: true,
      showMagnitudes: true,
      showConstellations: true,
      minMagnitude: -3,
      maxMagnitude: 8,
      objectTypes: {
        stars: true,
        galaxies: true,
        nebulae: true,
        clusters: true,
        planets: true,
        moons: true,
        doubleStars: true,
        variableStars: true,
        asteroids: false,
        comets: false,
      },
      appearance: {
        circleColor: "#FFD700",
        labelColor: "#FFFFFF",
        circleOpacity: 0.8,
        labelOpacity: 0.9,
        circleThickness: 2,
        fontSize: 12,
        showConnectorLines: true,
      },
      behavior: {
        fadeOnHover: true,
        clickToSelect: true,
        autoHide: false,
        autoHideDelay: 5,
      },
    }

    setAnnotationSettings(defaultSettings)
    setShowAnnotations(true)
  }

  const getActiveObjectCount = () => {
    return Object.values(annotationSettings.objectTypes).filter(Boolean).length
  }

  // Check if annotations are effectively enabled (both toggles)
  const isEnabled = showAnnotations && annotationSettings.enabled

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Object Annotations
            <Badge
              variant={isEnabled ? "default" : "secondary"}
              className={`ml-2 transition-all duration-200 ${isEnabled ? "animate-pulse" : ""}`}
            >
              {isEnabled ? "ON" : "OFF"}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={resetToDefaults}
              className="border-gray-600 text-white hover:bg-gray-700"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAnnotations}
              className={`border-gray-600 text-white hover:bg-gray-700 transition-all duration-200 ${
                isEnabled ? "bg-blue-600/20 border-blue-500" : ""
              }`}
            >
              {isEnabled ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isEnabled && (
        <CardContent className="space-y-4 transition-all duration-300 ease-in-out animate-in slide-in-from-top-2 fade-in-0">
          <Tabs defaultValue="display" className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-gray-700">
              <TabsTrigger value="display" className="text-xs">
                Display
              </TabsTrigger>
              <TabsTrigger value="objects" className="text-xs">
                Objects
              </TabsTrigger>
              <TabsTrigger value="appearance" className="text-xs">
                Style
              </TabsTrigger>
              <TabsTrigger value="behavior" className="text-xs">
                Behavior
              </TabsTrigger>
            </TabsList>

            <TabsContent value="display" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-labels" className="text-sm text-gray-300">
                    Show Labels
                  </Label>
                  <Switch
                    id="show-labels"
                    checked={annotationSettings.showLabels}
                    onCheckedChange={(checked) => updateSettings({ showLabels: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="show-magnitudes" className="text-sm text-gray-300">
                    Show Magnitudes
                  </Label>
                  <Switch
                    id="show-magnitudes"
                    checked={annotationSettings.showMagnitudes}
                    onCheckedChange={(checked) => updateSettings({ showMagnitudes: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="show-constellations" className="text-sm text-gray-300">
                    Show Constellations
                  </Label>
                  <Switch
                    id="show-constellations"
                    checked={annotationSettings.showConstellations}
                    onCheckedChange={(checked) => updateSettings({ showConstellations: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-gray-300">
                    Magnitude Range: {annotationSettings.minMagnitude} to {annotationSettings.maxMagnitude}
                  </Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-8">Min:</span>
                      <Slider
                        value={[annotationSettings.minMagnitude]}
                        onValueChange={([value]) => updateSettings({ minMagnitude: value })}
                        min={-3}
                        max={15}
                        step={0.5}
                        className="flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-8">Max:</span>
                      <Slider
                        value={[annotationSettings.maxMagnitude]}
                        onValueChange={([value]) => updateSettings({ maxMagnitude: value })}
                        min={-3}
                        max={15}
                        step={0.5}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="objects" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">Active Types:</span>
                  <Badge variant="outline">{getActiveObjectCount()}/10</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(annotationSettings.objectTypes).map(([key, enabled]) => (
                    <div key={key} className="flex items-center justify-between">
                      <Label htmlFor={key} className="text-xs text-gray-300 capitalize">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </Label>
                      <Switch
                        id={key}
                        checked={enabled}
                        onCheckedChange={(checked) => updateObjectTypes({ [key]: checked })}
                        size="sm"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateObjectTypes({
                        stars: true,
                        galaxies: true,
                        nebulae: true,
                        clusters: true,
                        planets: true,
                        moons: true,
                        doubleStars: true,
                        variableStars: true,
                        asteroids: true,
                        comets: true,
                      })
                    }
                    className="flex-1 text-xs border-gray-600 text-white hover:bg-gray-700"
                  >
                    All On
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateObjectTypes({
                        stars: false,
                        galaxies: false,
                        nebulae: false,
                        clusters: false,
                        planets: false,
                        moons: false,
                        doubleStars: false,
                        variableStars: false,
                        asteroids: false,
                        comets: false,
                      })
                    }
                    className="flex-1 text-xs border-gray-600 text-white hover:bg-gray-700"
                  >
                    All Off
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="appearance" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm text-gray-300">
                    Circle Opacity: {annotationSettings.appearance.circleOpacity.toFixed(1)}
                  </Label>
                  <Slider
                    value={[annotationSettings.appearance.circleOpacity]}
                    onValueChange={([value]) => updateAppearance({ circleOpacity: value })}
                    min={0.1}
                    max={1}
                    step={0.1}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-gray-300">
                    Label Opacity: {annotationSettings.appearance.labelOpacity.toFixed(1)}
                  </Label>
                  <Slider
                    value={[annotationSettings.appearance.labelOpacity]}
                    onValueChange={([value]) => updateAppearance({ labelOpacity: value })}
                    min={0.1}
                    max={1}
                    step={0.1}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-gray-300">
                    Circle Thickness: {annotationSettings.appearance.circleThickness}px
                  </Label>
                  <Slider
                    value={[annotationSettings.appearance.circleThickness]}
                    onValueChange={([value]) => updateAppearance({ circleThickness: value })}
                    min={1}
                    max={5}
                    step={1}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-gray-300">Font Size: {annotationSettings.appearance.fontSize}px</Label>
                  <Slider
                    value={[annotationSettings.appearance.fontSize]}
                    onValueChange={([value]) => updateAppearance({ fontSize: value })}
                    min={8}
                    max={20}
                    step={1}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="connector-lines" className="text-sm text-gray-300">
                    Connector Lines
                  </Label>
                  <Switch
                    id="connector-lines"
                    checked={annotationSettings.appearance.showConnectorLines}
                    onCheckedChange={(checked) => updateAppearance({ showConnectorLines: checked })}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="behavior" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="fade-hover" className="text-sm text-gray-300">
                    Fade on Hover
                  </Label>
                  <Switch
                    id="fade-hover"
                    checked={annotationSettings.behavior.fadeOnHover}
                    onCheckedChange={(checked) => updateBehavior({ fadeOnHover: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="click-select" className="text-sm text-gray-300">
                    Click to Select
                  </Label>
                  <Switch
                    id="click-select"
                    checked={annotationSettings.behavior.clickToSelect}
                    onCheckedChange={(checked) => updateBehavior({ clickToSelect: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-hide" className="text-sm text-gray-300">
                    Auto Hide
                  </Label>
                  <Switch
                    id="auto-hide"
                    checked={annotationSettings.behavior.autoHide}
                    onCheckedChange={(checked) => updateBehavior({ autoHide: checked })}
                  />
                </div>

                {annotationSettings.behavior.autoHide && (
                  <div className="space-y-2">
                    <Label className="text-sm text-gray-300">
                      Auto Hide Delay: {annotationSettings.behavior.autoHideDelay}s
                    </Label>
                    <Slider
                      value={[annotationSettings.behavior.autoHideDelay]}
                      onValueChange={([value]) => updateBehavior({ autoHideDelay: value })}
                      min={1}
                      max={30}
                      step={1}
                    />
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  )
}
