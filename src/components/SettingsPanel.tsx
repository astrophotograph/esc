import { useState } from 'react'
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
import { Input } from './ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Button } from './ui/button'
import { useUIStore } from '../stores/uiStore'
import { useTheme } from '../contexts/ThemeContext'
import { themes } from '../themes'
import { useTelescopeStore } from '../stores/telescopeStore'
import { type OverlaySettings, defaultOverlaySettings } from './VideoOverlays'
import {
  Video,
  Settings,
  Focus,
  Palette,
  Camera,
  RotateCcw,
  Eye,
  EyeOff,
  Target,
  ExternalLink,
} from 'lucide-react'

export function SettingsPanel() {
  const {
    showSettings,
    setShowSettings,
    toastsEnabled,
    setToastsEnabled,
    streamingEnabled,
    setStreamingEnabled,
    streamingQuality,
    setStreamingQuality,
  } = useUIStore()
  const { theme, setTheme } = useTheme()
  const { currentTelescopeId, telescopeSettings, updateTelescopeSettings } = useTelescopeStore()

  const currentSettings = currentTelescopeId ? telescopeSettings[currentTelescopeId] : null

  // Video overlay settings - stored in component state for now
  // TODO: Move to a store for persistence
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(defaultOverlaySettings)

  // Allsky settings
  const [allskySettings, setAllskySettings] = useState({
    cameraType: 'custom' as 'teamallsky' | 'indi' | 'custom',
    hostname: '',
    customUrl: '',
    defaultCamera: 'allsky' as 'allsky' | 'guide' | 'finder',
    defaultSize: 'medium' as 'small' | 'medium' | 'large',
    autoShow: false,
    showStatusByDefault: false,
    minimizedByDefault: true,
  })

  // Plate solving / Astrometry settings
  const [plateSolveSettings, setPlateSolveSettings] = useState({
    enabled: false,
    apiKey: '',
    apiUrl: 'https://nova.astrometry.net',
  })
  const [showApiKey, setShowApiKey] = useState(false)

  // Generate URL based on camera type and hostname
  const generateCameraUrl = (type: typeof allskySettings.cameraType, host: string): string => {
    switch (type) {
      case 'teamallsky':
        return host ? `http://${host}/current/tmp/image.jpg` : ''
      case 'indi':
        return host ? `http://${host}/indi-allsky/latestimage` : ''
      case 'custom':
        return allskySettings.customUrl
      default:
        return ''
    }
  }

  // Get the current effective URL
  const effectiveAllskyUrl = generateCameraUrl(allskySettings.cameraType, allskySettings.hostname)

  const updateOverlaySetting = <K extends keyof OverlaySettings>(
    category: K,
    key: keyof OverlaySettings[K],
    value: any
  ) => {
    setOverlaySettings({
      ...overlaySettings,
      [category]: {
        ...overlaySettings[category],
        [key]: value,
      },
    })
  }

  const resetOverlaySettings = () => {
    setOverlaySettings(defaultOverlaySettings)
  }

  return (
    <Dialog open={showSettings} onOpenChange={setShowSettings}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure application preferences, telescope settings, and video overlays
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overlays" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overlays" className="flex items-center gap-1 text-xs">
              <Video className="h-3 w-3" />
              Overlays
            </TabsTrigger>
            <TabsTrigger value="general" className="flex items-center gap-1 text-xs">
              <Settings className="h-3 w-3" />
              General
            </TabsTrigger>
            <TabsTrigger value="telescope" className="flex items-center gap-1 text-xs">
              <Focus className="h-3 w-3" />
              Telescope
            </TabsTrigger>
            <TabsTrigger value="allsky" className="flex items-center gap-1 text-xs">
              <Camera className="h-3 w-3" />
              Allsky
            </TabsTrigger>
            <TabsTrigger value="platesolve" className="flex items-center gap-1 text-xs">
              <Target className="h-3 w-3" />
              Plate Solve
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex items-center gap-1 text-xs">
              <Palette className="h-3 w-3" />
              Appearance
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 pr-2">
            {/* Video Overlays Tab */}
            <TabsContent value="overlays" className="space-y-6 mt-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Video Overlay Settings</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetOverlaySettings}
                  className="h-7 text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              </div>

              {/* Crosshairs */}
              <div className="space-y-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <Label htmlFor="crosshairs-enabled" className="font-medium">Crosshairs</Label>
                  <Switch
                    id="crosshairs-enabled"
                    checked={overlaySettings.crosshairs.enabled}
                    onCheckedChange={(checked) =>
                      updateOverlaySetting('crosshairs', 'enabled', checked)
                    }
                  />
                </div>

                {overlaySettings.crosshairs.enabled && (
                  <div className="grid grid-cols-3 gap-4 pt-2">
                    <div className="space-y-2">
                      <Label className="text-xs">Style</Label>
                      <Select
                        value={overlaySettings.crosshairs.style}
                        onValueChange={(value) =>
                          updateOverlaySetting('crosshairs', 'style', value)
                        }
                      >
                        <SelectTrigger className="h-8">
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
                      <Label className="text-xs">Color</Label>
                      <input
                        type="color"
                        value={overlaySettings.crosshairs.color}
                        onChange={(e) =>
                          updateOverlaySetting('crosshairs', 'color', e.target.value)
                        }
                        className="w-full h-8 rounded cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">
                        Thickness: {overlaySettings.crosshairs.thickness}px
                      </Label>
                      <Slider
                        min={1}
                        max={5}
                        step={1}
                        value={[overlaySettings.crosshairs.thickness]}
                        onValueChange={([value]) =>
                          updateOverlaySetting('crosshairs', 'thickness', value)
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Grid */}
              <div className="space-y-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <Label htmlFor="grid-enabled" className="font-medium">Grid</Label>
                  <Switch
                    id="grid-enabled"
                    checked={overlaySettings.grid.enabled}
                    onCheckedChange={(checked) =>
                      updateOverlaySetting('grid', 'enabled', checked)
                    }
                  />
                </div>

                {overlaySettings.grid.enabled && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2">
                      <Label className="text-xs">Style</Label>
                      <Select
                        value={overlaySettings.grid.style}
                        onValueChange={(value) =>
                          updateOverlaySetting('grid', 'style', value)
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lines">Lines</SelectItem>
                          <SelectItem value="dots">Dots</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Color</Label>
                      <input
                        type="color"
                        value={overlaySettings.grid.color}
                        onChange={(e) =>
                          updateOverlaySetting('grid', 'color', e.target.value)
                        }
                        className="w-full h-8 rounded cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">
                        Spacing: {overlaySettings.grid.spacing}px
                      </Label>
                      <Slider
                        min={20}
                        max={100}
                        step={10}
                        value={[overlaySettings.grid.spacing]}
                        onValueChange={([value]) =>
                          updateOverlaySetting('grid', 'spacing', value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">
                        Opacity: {Math.round(overlaySettings.grid.opacity * 100)}%
                      </Label>
                      <Slider
                        min={0}
                        max={1}
                        step={0.1}
                        value={[overlaySettings.grid.opacity]}
                        onValueChange={([value]) =>
                          updateOverlaySetting('grid', 'opacity', value)
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Compass */}
              <div className="space-y-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <Label htmlFor="compass-enabled" className="font-medium">Compass</Label>
                  <Switch
                    id="compass-enabled"
                    checked={overlaySettings.compass.enabled}
                    onCheckedChange={(checked) =>
                      updateOverlaySetting('compass', 'enabled', checked)
                    }
                  />
                </div>

                {overlaySettings.compass.enabled && (
                  <div className="grid grid-cols-3 gap-4 pt-2">
                    <div className="space-y-2">
                      <Label className="text-xs">Color</Label>
                      <input
                        type="color"
                        value={overlaySettings.compass.color}
                        onChange={(e) =>
                          updateOverlaySetting('compass', 'color', e.target.value)
                        }
                        className="w-full h-8 rounded cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        id="compass-cardinals"
                        checked={overlaySettings.compass.showCardinals}
                        onCheckedChange={(checked) =>
                          updateOverlaySetting('compass', 'showCardinals', checked)
                        }
                      />
                      <Label htmlFor="compass-cardinals" className="text-xs">Cardinals</Label>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        id="compass-degrees"
                        checked={overlaySettings.compass.showDegrees}
                        onCheckedChange={(checked) =>
                          updateOverlaySetting('compass', 'showDegrees', checked)
                        }
                      />
                      <Label htmlFor="compass-degrees" className="text-xs">Degrees</Label>
                    </div>
                  </div>
                )}
              </div>

              {/* Measurements */}
              <div className="space-y-3 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <Label htmlFor="measurements-enabled" className="font-medium">Measurements</Label>
                  <Switch
                    id="measurements-enabled"
                    checked={overlaySettings.measurements.enabled}
                    onCheckedChange={(checked) =>
                      updateOverlaySetting('measurements', 'enabled', checked)
                    }
                  />
                </div>

                {overlaySettings.measurements.enabled && (
                  <div className="grid grid-cols-3 gap-4 pt-2">
                    <div className="space-y-2">
                      <Label className="text-xs">Color</Label>
                      <input
                        type="color"
                        value={overlaySettings.measurements.color}
                        onChange={(e) =>
                          updateOverlaySetting('measurements', 'color', e.target.value)
                        }
                        className="w-full h-8 rounded cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        id="measurements-scale"
                        checked={overlaySettings.measurements.showScale}
                        onCheckedChange={(checked) =>
                          updateOverlaySetting('measurements', 'showScale', checked)
                        }
                      />
                      <Label htmlFor="measurements-scale" className="text-xs">Scale Bar</Label>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        id="measurements-coordinates"
                        checked={overlaySettings.measurements.showCoordinates}
                        onCheckedChange={(checked) =>
                          updateOverlaySetting('measurements', 'showCoordinates', checked)
                        }
                      />
                      <Label htmlFor="measurements-coordinates" className="text-xs">Coords</Label>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* General Settings */}
            <TabsContent value="general" className="space-y-4 mt-0">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <Label htmlFor="toasts">Toast Notifications</Label>
                  <p className="text-xs text-muted-foreground">
                    Show popup notifications for events
                  </p>
                </div>
                <Switch
                  id="toasts"
                  checked={toastsEnabled}
                  onCheckedChange={setToastsEnabled}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <Label htmlFor="streaming">Video Streaming</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable live video feed from telescope
                  </p>
                </div>
                <Switch
                  id="streaming"
                  checked={streamingEnabled}
                  onCheckedChange={setStreamingEnabled}
                />
              </div>

              {streamingEnabled && (
                <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                  <Label htmlFor="streaming-quality">Streaming Quality</Label>
                  <Select value={streamingQuality} onValueChange={(v) => setStreamingQuality(v as 'low' | 'medium' | 'high')}>
                    <SelectTrigger id="streaming-quality">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low (320p)</SelectItem>
                      <SelectItem value="medium">Medium (480p)</SelectItem>
                      <SelectItem value="high">High (720p)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </TabsContent>

            {/* Telescope Settings */}
            <TabsContent value="telescope" className="space-y-4 mt-0">
              {currentTelescopeId && currentSettings ? (
                <>
                  <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                    <Label>Default Exposure: {currentSettings.exposure}ms</Label>
                    <Slider
                      min={100}
                      max={30000}
                      step={100}
                      value={[currentSettings.exposure]}
                      onValueChange={([value]) =>
                        updateTelescopeSettings(currentTelescopeId, { exposure: value })
                      }
                    />
                  </div>

                  <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                    <Label>Default Gain: {currentSettings.gain}</Label>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[currentSettings.gain]}
                      onValueChange={([value]) =>
                        updateTelescopeSettings(currentTelescopeId, { gain: value })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <Label htmlFor="auto-exposure">Auto Exposure</Label>
                      <p className="text-xs text-muted-foreground">
                        Let telescope adjust exposure automatically
                      </p>
                    </div>
                    <Switch
                      id="auto-exposure"
                      checked={currentSettings.autoExposure}
                      onCheckedChange={(checked) =>
                        updateTelescopeSettings(currentTelescopeId, { autoExposure: checked })
                      }
                    />
                  </div>
                </>
              ) : (
                <div className="p-6 text-center text-muted-foreground">
                  <Focus className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Connect to a telescope to configure its settings</p>
                </div>
              )}
            </TabsContent>

            {/* Allsky Settings */}
            <TabsContent value="allsky" className="space-y-4 mt-0">
              {/* Camera Type Selection */}
              <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                <Label>Camera Type</Label>
                <Select
                  value={allskySettings.cameraType}
                  onValueChange={(value: 'teamallsky' | 'indi' | 'custom') =>
                    setAllskySettings({ ...allskySettings, cameraType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="teamallsky">TeamAllsky Allsky</SelectItem>
                    <SelectItem value="indi">INDI Allsky</SelectItem>
                    <SelectItem value="custom">Custom URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Hostname input for TeamAllsky or INDI */}
              {(allskySettings.cameraType === 'teamallsky' || allskySettings.cameraType === 'indi') && (
                <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                  <Label htmlFor="allsky-hostname">Hostname or IP Address</Label>
                  <Input
                    id="allsky-hostname"
                    placeholder="192.168.1.100 or allsky.local"
                    value={allskySettings.hostname}
                    onChange={(e) =>
                      setAllskySettings({ ...allskySettings, hostname: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {allskySettings.cameraType === 'teamallsky'
                      ? `URL will be: http://${allskySettings.hostname || 'hostname'}/current/tmp/image.jpg`
                      : `URL will be: http://${allskySettings.hostname || 'hostname'}/indi-allsky/latestimage`}
                  </p>
                </div>
              )}

              {/* Custom URL input */}
              {allskySettings.cameraType === 'custom' && (
                <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                  <Label htmlFor="allsky-custom-url">Custom URL</Label>
                  <Input
                    id="allsky-custom-url"
                    type="url"
                    placeholder="http://allsky/image.jpg"
                    value={allskySettings.customUrl}
                    onChange={(e) =>
                      setAllskySettings({ ...allskySettings, customUrl: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the complete URL to your all-sky camera image
                  </p>
                </div>
              )}

              {/* Show effective URL */}
              <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                <Label className="text-xs text-muted-foreground">Current URL</Label>
                <div className="p-2 bg-background rounded text-xs font-mono break-all">
                  {effectiveAllskyUrl || 'No URL configured'}
                </div>
              </div>

              <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                <Label>Default Window Size</Label>
                <Select
                  value={allskySettings.defaultSize}
                  onValueChange={(value: 'small' | 'medium' | 'large') =>
                    setAllskySettings({ ...allskySettings, defaultSize: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small (200x150)</SelectItem>
                    <SelectItem value="medium">Medium (320x240)</SelectItem>
                    <SelectItem value="large">Large (480x360)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <Label htmlFor="allsky-autoshow">Auto-Show</Label>
                  <p className="text-xs text-muted-foreground">
                    Show Allsky panel when telescope connects
                  </p>
                </div>
                <Switch
                  id="allsky-autoshow"
                  checked={allskySettings.autoShow}
                  onCheckedChange={(checked) =>
                    setAllskySettings({ ...allskySettings, autoShow: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <Label htmlFor="allsky-status">Show Status Overlay</Label>
                  <p className="text-xs text-muted-foreground">
                    Display status information on the panel
                  </p>
                </div>
                <Switch
                  id="allsky-status"
                  checked={allskySettings.showStatusByDefault}
                  onCheckedChange={(checked) =>
                    setAllskySettings({ ...allskySettings, showStatusByDefault: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <Label htmlFor="allsky-minimized">Start Minimized</Label>
                  <p className="text-xs text-muted-foreground">
                    Open the panel in minimized state
                  </p>
                </div>
                <Switch
                  id="allsky-minimized"
                  checked={allskySettings.minimizedByDefault}
                  onCheckedChange={(checked) =>
                    setAllskySettings({ ...allskySettings, minimizedByDefault: checked })
                  }
                />
              </div>
            </TabsContent>

            {/* Plate Solving Settings */}
            <TabsContent value="platesolve" className="space-y-4 mt-0">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <Label htmlFor="platesolve-enabled" className="font-medium">Astrometry.net Integration</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable plate solving for accurate position determination
                  </p>
                </div>
                <Switch
                  id="platesolve-enabled"
                  checked={plateSolveSettings.enabled}
                  onCheckedChange={(checked) =>
                    setPlateSolveSettings({ ...plateSolveSettings, enabled: checked })
                  }
                />
              </div>

              {plateSolveSettings.enabled && (
                <>
                  <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                    <Label htmlFor="astrometry-key">API Key</Label>
                    <div className="relative">
                      <Input
                        id="astrometry-key"
                        type={showApiKey ? 'text' : 'password'}
                        placeholder="Enter your Astrometry.net API key"
                        value={plateSolveSettings.apiKey}
                        onChange={(e) =>
                          setPlateSolveSettings({ ...plateSolveSettings, apiKey: e.target.value })
                        }
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                    <Label htmlFor="astrometry-url">API URL (Optional)</Label>
                    <Input
                      id="astrometry-url"
                      type="url"
                      placeholder="https://nova.astrometry.net (default)"
                      value={plateSolveSettings.apiUrl}
                      onChange={(e) =>
                        setPlateSolveSettings({ ...plateSolveSettings, apiUrl: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to use the default astrometry.net server
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/50">
                    <a
                      href="https://nova.astrometry.net/api_help"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Get your Astrometry.net API key
                    </a>
                  </div>
                </>
              )}
            </TabsContent>

            {/* Appearance Settings */}
            <TabsContent value="appearance" className="space-y-4 mt-0">
              <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                <Label htmlFor="theme">Theme</Label>
                <Select value={theme} onValueChange={(v) => setTheme(v as keyof typeof themes)}>
                  <SelectTrigger id="theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(themes).map(([id, themeConfig]) => (
                      <SelectItem key={id} value={id}>
                        {themeConfig.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {themes[theme]?.description}
                </p>
              </div>

              <div className="grid grid-cols-5 gap-2 p-3 rounded-lg bg-muted/50">
                {Object.entries(themes).map(([id, themeConfig]) => (
                  <button
                    key={id}
                    className={`p-2 rounded-md border-2 transition-colors ${
                      theme === id ? 'border-primary' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: themeConfig.colors.background }}
                    onClick={() => setTheme(id as keyof typeof themes)}
                    title={themeConfig.name}
                  >
                    <div
                      className="w-full h-4 rounded"
                      style={{ backgroundColor: themeConfig.colors.primary }}
                    />
                  </button>
                ))}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
