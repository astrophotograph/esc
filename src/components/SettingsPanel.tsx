import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '../services/api'
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
import { allskyImageUrl } from '../lib/allsky'
import { type OverlaySettings, defaultOverlaySettings } from './VideoOverlays'
import { TelescopeEditor } from './TelescopeEditor'
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
  Radio,
  SlidersHorizontal,
  MapPin,
  Zap,
  Crosshair,
  Mountain,
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
    allsky: allskySettings,
    setAllsky: setAllskySettings,
  } = useUIStore()
  const { theme, setTheme } = useTheme()
  const { currentTelescopeId, telescopeSettings, updateTelescopeSettings, telescopes } = useTelescopeStore()

  const currentSettings = currentTelescopeId ? telescopeSettings[currentTelescopeId] : null
  const currentTelescope = telescopes.find(t => t.id === currentTelescopeId)
  const isConnected = currentTelescope?.status === 'connected'

  // Track whether we've loaded live scope settings for this telescope
  const scopeLoadedForRef = useRef<string | null>(null)
  const [scopeLoading, setScopeLoading] = useState(false)
  const [scopeSaving, setScopeSaving] = useState(false)
  const [scopeError, setScopeError] = useState<string | null>(null)

  // Load live scope settings from telescope when connected
  const loadScopeSettings = useCallback(async () => {
    if (!currentTelescopeId || !isConnected) return
    setScopeLoading(true)
    setScopeError(null)
    try {
      const data = await invoke<{
        stackExposureMs?: number
        continuousExposureMs?: number
        lpFilterEnabled?: boolean
        frameCalib?: boolean
        auto3ppaCalib?: boolean
        stackContCapt?: boolean
        stackDrizzle2x?: boolean
        darkMode?: boolean
        expertMode?: boolean
        saveGoodFrames?: boolean
        saveAllFrames?: boolean
        lightDurationMin?: number
        stackCaptType?: string
        stackCaptNum?: number
        stackBrightness?: number
        stackContrast?: number
        stackSaturation?: number
        stackDbeEnable?: boolean
        ditherEnabled?: boolean
        ditherPixels?: number
        ditherFrequency?: number
        focalPos?: number
        dewHeaterEnabled?: boolean
        autoPowerOff?: boolean
        planTargetAf?: boolean
        viewplanGohome?: boolean
      }>('get_scope_settings', { telescopeId: currentTelescopeId })

      const updates: Record<string, unknown> = {}
      const pick = <K extends string>(key: K, val: unknown) => {
        if (val != null) updates[key] = val
      }
      pick('stackExposureMs', data.stackExposureMs)
      pick('continuousExposureMs', data.continuousExposureMs)
      pick('lpFilterEnabled', data.lpFilterEnabled)
      pick('frameCalib', data.frameCalib)
      pick('auto3ppaCalib', data.auto3ppaCalib)
      pick('stackContCapt', data.stackContCapt)
      pick('stackDrizzle2x', data.stackDrizzle2x)
      pick('darkMode', data.darkMode)
      pick('expertMode', data.expertMode)
      pick('saveGoodFrames', data.saveGoodFrames)
      pick('saveAllFrames', data.saveAllFrames)
      pick('lightDurationMin', data.lightDurationMin)
      pick('stackCaptType', data.stackCaptType)
      pick('stackCaptNum', data.stackCaptNum)
      pick('stackBrightness', data.stackBrightness)
      pick('stackContrast', data.stackContrast)
      pick('stackSaturation', data.stackSaturation)
      pick('stackDbeEnable', data.stackDbeEnable)
      pick('ditherEnabled', data.ditherEnabled)
      pick('ditherPixels', data.ditherPixels)
      pick('ditherFrequency', data.ditherFrequency)
      pick('focalPos', data.focalPos)
      pick('dewHeaterEnabled', data.dewHeaterEnabled)
      pick('autoPowerOff', data.autoPowerOff)
      pick('planTargetAf', data.planTargetAf)
      pick('viewplanGohome', data.viewplanGohome)

      if (Object.keys(updates).length > 0) {
        updateTelescopeSettings(currentTelescopeId, updates as Parameters<typeof updateTelescopeSettings>[1])
      }
      scopeLoadedForRef.current = currentTelescopeId
    } catch (err) {
      setScopeError(String(err))
    } finally {
      setScopeLoading(false)
    }
  }, [currentTelescopeId, isConnected, updateTelescopeSettings])

  useEffect(() => {
    if (currentTelescopeId && isConnected && scopeLoadedForRef.current !== currentTelescopeId) {
      loadScopeSettings()
    }
    if (!isConnected) {
      scopeLoadedForRef.current = null
    }
  }, [currentTelescopeId, isConnected, loadScopeSettings])

  // Save scope settings (non-location) to telescope
  const saveScopeSettings = useCallback(async () => {
    if (!currentTelescopeId || !isConnected || !currentSettings) return
    setScopeSaving(true)
    setScopeError(null)
    try {
      await invoke('set_scope_settings', {
        telescopeId: currentTelescopeId,
        settings: {
          stackExposureMs: currentSettings.stackExposureMs ?? null,
          continuousExposureMs: currentSettings.continuousExposureMs ?? null,
          lpFilterEnabled: currentSettings.lpFilterEnabled ?? null,
          frameCalib: currentSettings.frameCalib ?? null,
          auto3ppaCalib: currentSettings.auto3ppaCalib ?? null,
          stackContCapt: currentSettings.stackContCapt ?? null,
          stackDrizzle2x: currentSettings.stackDrizzle2x ?? null,
          darkMode: currentSettings.darkMode ?? null,
          expertMode: currentSettings.expertMode ?? null,
          saveGoodFrames: currentSettings.saveGoodFrames ?? null,
          saveAllFrames: currentSettings.saveAllFrames ?? null,
          lightDurationMin: currentSettings.lightDurationMin ?? null,
          stackCaptType: currentSettings.stackCaptType ?? null,
          stackCaptNum: currentSettings.stackCaptNum ?? null,
          stackBrightness: currentSettings.stackBrightness ?? null,
          stackContrast: currentSettings.stackContrast ?? null,
          stackSaturation: currentSettings.stackSaturation ?? null,
          stackDbeEnable: currentSettings.stackDbeEnable ?? null,
          ditherEnabled: currentSettings.ditherEnabled ?? null,
          ditherPixels: currentSettings.ditherPixels ?? null,
          ditherFrequency: currentSettings.ditherFrequency ?? null,
          focalPos: currentSettings.focalPos ?? null,
          dewHeaterEnabled: currentSettings.dewHeaterEnabled ?? null,
          autoPowerOff: currentSettings.autoPowerOff ?? null,
          planTargetAf: currentSettings.planTargetAf ?? null,
          viewplanGohome: currentSettings.viewplanGohome ?? null,
        },
      })
    } catch (err) {
      setScopeError(String(err))
    } finally {
      setScopeSaving(false)
    }
  }, [currentTelescopeId, isConnected, currentSettings])

  // Save location to telescope
  const saveScopeLocation = useCallback(async () => {
    if (!currentTelescopeId || !isConnected || !currentSettings) return
    setScopeSaving(true)
    setScopeError(null)
    try {
      await invoke('set_scope_location', {
        telescopeId: currentTelescopeId,
        lat: currentSettings.latitude ?? 0,
        lon: currentSettings.longitude ?? 0,
      })
    } catch (err) {
      setScopeError(String(err))
    } finally {
      setScopeSaving(false)
    }
  }, [currentTelescopeId, isConnected, currentSettings])

  // Video overlay settings - stored in component state for now
  // TODO: Move to a store for persistence
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>(defaultOverlaySettings)


  // App config (persisted to config.toml via Rust)
  const [seestarInteropPem, setSeestarInteropPem] = useState('')
  const [pemSaving, setPemSaving] = useState(false)
  useEffect(() => {
    invoke<{ seestar_interop_pem?: string }>('config_get')
      .then(c => setSeestarInteropPem(c.seestar_interop_pem ?? ''))
      .catch(() => {})
  }, [])
  const handleSavePemPath = useCallback(async (path: string) => {
    setPemSaving(true)
    try {
      await invoke('config_set', { config: { seestar_interop_pem: path || null } })
    } catch (e) {
      console.error('Failed to save config:', e)
    } finally {
      setPemSaving(false)
    }
  }, [])

  // Plate solving / Astrometry settings
  const [plateSolveSettings, setPlateSolveSettings] = useState({
    enabled: false,
    apiKey: '',
    apiUrl: 'https://nova.astrometry.net',
  })
  const [showApiKey, setShowApiKey] = useState(false)

  // Effective preview URL (shared with the AllskyPanel display).
  const effectiveAllskyUrl = allskyImageUrl(allskySettings)

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
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="telescopes" className="flex items-center gap-1 text-xs">
              <Radio className="h-3 w-3" />
              Telescopes
            </TabsTrigger>
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
              Settings
            </TabsTrigger>
            <TabsTrigger value="allsky" className="flex items-center gap-1 text-xs">
              <Camera className="h-3 w-3" />
              Allsky
            </TabsTrigger>
            <TabsTrigger value="platesolve" className="flex items-center gap-1 text-xs">
              <Target className="h-3 w-3" />
              Solve
            </TabsTrigger>
            <TabsTrigger value="scope" className="flex items-center gap-1 text-xs">
              <SlidersHorizontal className="h-3 w-3" />
              Scope
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex items-center gap-1 text-xs">
              <Palette className="h-3 w-3" />
              Theme
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 pr-2">
            {/* Telescopes Management Tab */}
            <TabsContent value="telescopes" className="space-y-4 mt-0">
              <TelescopeEditor />
            </TabsContent>

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

              <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                <Label htmlFor="pem-path">Seestar Interop PEM Path</Label>
                <p className="text-xs text-muted-foreground">
                  Path to the interop key file required for Seestar firmware 7.18+.
                  Used for interoperability under 17 U.S.C. § 1201(f) (the DMCA interoperability
                  exemption). The legality of key use varies by jurisdiction — you are solely
                  responsible for ensuring compliance with the laws of your region.
                  The <code className="text-xs">SEESTAR_INTEROP_PEM</code> env var takes precedence if set.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="pem-path"
                    placeholder="/path/to/interop.pem"
                    value={seestarInteropPem}
                    onChange={e => setSeestarInteropPem(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={pemSaving}
                    onClick={() => handleSavePemPath(seestarInteropPem)}
                  >
                    {pemSaving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
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

            {/* Scope Settings */}
            <TabsContent value="scope" className="space-y-4 mt-0">
              {currentTelescopeId && currentSettings ? (
                <>
                  {/* ── Toolbar ──────────────────────────────────── */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {scopeLoading && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                          Loading…
                        </span>
                      )}
                      {scopeError && (
                        <span className="text-xs text-destructive">{scopeError}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!isConnected || scopeLoading}
                        onClick={loadScopeSettings}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Refresh
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!isConnected || scopeSaving}
                        onClick={saveScopeSettings}
                      >
                        {scopeSaving ? 'Saving…' : 'Apply Settings'}
                      </Button>
                    </div>
                  </div>

                  {/* ── Location ─────────────────────────────────── */}
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    <MapPin className="h-3 w-3" />
                    Location
                  </div>

                  <div className="space-y-3 p-3 rounded-lg bg-muted/50">
                    <div className="space-y-2">
                      <Label htmlFor="scope-location">Location Name</Label>
                      <Input
                        id="scope-location"
                        placeholder="e.g. Backyard, Dark site…"
                        value={currentSettings.locationName ?? ''}
                        onChange={(e) =>
                          updateTelescopeSettings(currentTelescopeId, { locationName: e.target.value })
                        }
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="scope-lat">Latitude (°)</Label>
                        <Input
                          id="scope-lat"
                          type="number"
                          min={-90}
                          max={90}
                          step={0.0001}
                          placeholder="42.3601"
                          value={currentSettings.latitude ?? ''}
                          onChange={(e) =>
                            updateTelescopeSettings(currentTelescopeId, {
                              latitude: e.target.value === '' ? 0 : parseFloat(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="scope-lon">Longitude (°)</Label>
                        <Input
                          id="scope-lon"
                          type="number"
                          min={-180}
                          max={180}
                          step={0.0001}
                          placeholder="-71.0589"
                          value={currentSettings.longitude ?? ''}
                          onChange={(e) =>
                            updateTelescopeSettings(currentTelescopeId, {
                              longitude: e.target.value === '' ? 0 : parseFloat(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="scope-temp-unit">Temperature Unit</Label>
                      <Select
                        value={currentSettings.tempUnit ?? 'C'}
                        onValueChange={(v: 'C' | 'F') =>
                          updateTelescopeSettings(currentTelescopeId, { tempUnit: v })
                        }
                      >
                        <SelectTrigger id="scope-temp-unit" className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="C">Celsius (°C)</SelectItem>
                          <SelectItem value="F">Fahrenheit (°F)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        disabled={!isConnected || scopeSaving}
                        onClick={saveScopeLocation}
                      >
                        Apply Location
                      </Button>
                    </div>
                  </div>

                  {/* ── Imaging ──────────────────────────────────── */}
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    <Zap className="h-3 w-3" />
                    Imaging
                  </div>

                  <div className="space-y-3 p-3 rounded-lg bg-muted/50">
                    <div className="space-y-2">
                      <Label>
                        Stack Exposure: {((currentSettings.stackExposureMs ?? 10000) / 1000).toFixed(1)} s
                      </Label>
                      <Slider
                        min={1000}
                        max={90000}
                        step={1000}
                        value={[currentSettings.stackExposureMs ?? 10000]}
                        onValueChange={([v]) =>
                          updateTelescopeSettings(currentTelescopeId, { stackExposureMs: v })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Exposure time for stacked frames (1 s – 90 s)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>
                        Continuous Exposure: {((currentSettings.continuousExposureMs ?? 500) / 1000).toFixed(2)} s
                      </Label>
                      <Slider
                        min={100}
                        max={10000}
                        step={100}
                        value={[currentSettings.continuousExposureMs ?? 500]}
                        onValueChange={([v]) =>
                          updateTelescopeSettings(currentTelescopeId, { continuousExposureMs: v })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Exposure time for live / continuous view (100 ms – 10 s)
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-lp-filter">Light Pollution Filter</Label>
                        <p className="text-xs text-muted-foreground">
                          Activate the built-in LP filter
                        </p>
                      </div>
                      <Switch
                        id="scope-lp-filter"
                        checked={currentSettings.lpFilterEnabled ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { lpFilterEnabled: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-frame-calib">Frame Calibration</Label>
                        <p className="text-xs text-muted-foreground">
                          Apply dark / flat calibration frames
                        </p>
                      </div>
                      <Switch
                        id="scope-frame-calib"
                        checked={currentSettings.frameCalib ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { frameCalib: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-3ppa">Auto 3-Point PA Calibration</Label>
                        <p className="text-xs text-muted-foreground">
                          Automatically refine polar alignment between sessions
                        </p>
                      </div>
                      <Switch
                        id="scope-3ppa"
                        checked={currentSettings.auto3ppaCalib ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { auto3ppaCalib: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-cont-capt">Continuous Capture</Label>
                        <p className="text-xs text-muted-foreground">
                          Keep capturing without a fixed frame count limit
                        </p>
                      </div>
                      <Switch
                        id="scope-cont-capt"
                        checked={currentSettings.stackContCapt ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { stackContCapt: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-drizzle">Drizzle 2×</Label>
                        <p className="text-xs text-muted-foreground">
                          Enable 2× drizzle upscaling when stacking
                        </p>
                      </div>
                      <Switch
                        id="scope-drizzle"
                        checked={currentSettings.stackDrizzle2x ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { stackDrizzle2x: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-save-good">Save Good Frames</Label>
                        <p className="text-xs text-muted-foreground">
                          Save frames that pass quality checks
                        </p>
                      </div>
                      <Switch
                        id="scope-save-good"
                        checked={currentSettings.saveGoodFrames ?? true}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { saveGoodFrames: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-save-all">Save All Frames</Label>
                        <p className="text-xs text-muted-foreground">
                          Also save rejected / sub-quality frames
                        </p>
                      </div>
                      <Switch
                        id="scope-save-all"
                        checked={currentSettings.saveAllFrames ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { saveAllFrames: checked })
                        }
                      />
                    </div>
                  </div>

                  {/* ── Stack Session ─────────────────────────────── */}
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    <Camera className="h-3 w-3" />
                    Stack Session
                  </div>

                  <div className="space-y-3 p-3 rounded-lg bg-muted/50">
                    <div className="space-y-2">
                      <Label>Capture Type</Label>
                      <Select
                        value={currentSettings.stackCaptType ?? 'continuous'}
                        onValueChange={(v) =>
                          updateTelescopeSettings(currentTelescopeId, { stackCaptType: v })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="continuous">Continuous</SelectItem>
                          <SelectItem value="fixed">Fixed Count</SelectItem>
                          <SelectItem value="duration">Duration</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="scope-light-dur">
                          Duration: {currentSettings.lightDurationMin ?? 60} min
                        </Label>
                        <Input
                          id="scope-light-dur"
                          type="number"
                          min={1}
                          max={600}
                          value={currentSettings.lightDurationMin ?? 60}
                          onChange={(e) =>
                            updateTelescopeSettings(currentTelescopeId, {
                              lightDurationMin: parseInt(e.target.value) || 60,
                            })
                          }
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="scope-capt-num">Frame Count</Label>
                        <Input
                          id="scope-capt-num"
                          type="number"
                          min={0}
                          value={currentSettings.stackCaptNum ?? 0}
                          onChange={(e) =>
                            updateTelescopeSettings(currentTelescopeId, {
                              stackCaptNum: parseInt(e.target.value) || 0,
                            })
                          }
                          className="h-8"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Brightness: {currentSettings.stackBrightness ?? 50}</Label>
                      <Slider
                        min={0} max={100} step={1}
                        value={[currentSettings.stackBrightness ?? 50]}
                        onValueChange={([v]) =>
                          updateTelescopeSettings(currentTelescopeId, { stackBrightness: v })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Contrast: {currentSettings.stackContrast ?? 50}</Label>
                      <Slider
                        min={0} max={100} step={1}
                        value={[currentSettings.stackContrast ?? 50]}
                        onValueChange={([v]) =>
                          updateTelescopeSettings(currentTelescopeId, { stackContrast: v })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Saturation: {currentSettings.stackSaturation ?? 50}</Label>
                      <Slider
                        min={0} max={100} step={1}
                        value={[currentSettings.stackSaturation ?? 50]}
                        onValueChange={([v]) =>
                          updateTelescopeSettings(currentTelescopeId, { stackSaturation: v })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-dbe">Dynamic Background Extraction</Label>
                        <p className="text-xs text-muted-foreground">
                          Subtract gradient background during stacking
                        </p>
                      </div>
                      <Switch
                        id="scope-dbe"
                        checked={currentSettings.stackDbeEnable ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { stackDbeEnable: checked })
                        }
                      />
                    </div>
                  </div>

                  {/* ── Dithering ────────────────────────────────── */}
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    <Crosshair className="h-3 w-3" />
                    Dithering
                  </div>

                  <div className="space-y-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-dither-enabled" className="font-medium">
                          Enable Dithering
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Shift pointing between frames to reduce fixed-pattern noise
                        </p>
                      </div>
                      <Switch
                        id="scope-dither-enabled"
                        checked={currentSettings.ditherEnabled ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { ditherEnabled: checked })
                        }
                      />
                    </div>

                    {currentSettings.ditherEnabled && (
                      <div className="grid grid-cols-2 gap-4 pt-1">
                        <div className="space-y-2">
                          <Label>
                            Distance: {currentSettings.ditherPixels ?? 50} px
                          </Label>
                          <Slider
                            min={10}
                            max={200}
                            step={5}
                            value={[currentSettings.ditherPixels ?? 50]}
                            onValueChange={([v]) =>
                              updateTelescopeSettings(currentTelescopeId, { ditherPixels: v })
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>
                            Every: {currentSettings.ditherFrequency ?? 10} frames
                          </Label>
                          <Slider
                            min={1}
                            max={20}
                            step={1}
                            value={[currentSettings.ditherFrequency ?? 10]}
                            onValueChange={([v]) =>
                              updateTelescopeSettings(currentTelescopeId, { ditherFrequency: v })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Environment & Power ──────────────────────── */}
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    <Mountain className="h-3 w-3" />
                    Environment &amp; Power
                  </div>

                  <div className="space-y-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-dew-heater">Dew Heater</Label>
                        <p className="text-xs text-muted-foreground">
                          Enable the dew heater element
                        </p>
                      </div>
                      <Switch
                        id="scope-dew-heater"
                        checked={currentSettings.dewHeaterEnabled ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { dewHeaterEnabled: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-auto-power-off">Auto Power Off</Label>
                        <p className="text-xs text-muted-foreground">
                          Automatically power off when idle
                        </p>
                      </div>
                      <Switch
                        id="scope-auto-power-off"
                        checked={currentSettings.autoPowerOff ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { autoPowerOff: checked })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>
                        Battery Low Limit: {currentSettings.batteryLowLimit ?? 20} %
                      </Label>
                      <Slider
                        min={5}
                        max={50}
                        step={5}
                        value={[currentSettings.batteryLowLimit ?? 20]}
                        onValueChange={([v]) =>
                          updateTelescopeSettings(currentTelescopeId, { batteryLowLimit: v })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Safe-shutdown threshold when battery reaches this level
                      </p>
                    </div>
                  </div>

                  {/* ── Advanced ─────────────────────────────────── */}
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    <Settings className="h-3 w-3" />
                    Advanced
                  </div>

                  <div className="space-y-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-dark-mode">Dark Mode (Firmware)</Label>
                        <p className="text-xs text-muted-foreground">
                          Dim the telescope's own status indicator
                        </p>
                      </div>
                      <Switch
                        id="scope-dark-mode"
                        checked={currentSettings.darkMode ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { darkMode: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-expert-mode">Expert Mode</Label>
                        <p className="text-xs text-muted-foreground">
                          Unlock advanced firmware controls
                        </p>
                      </div>
                      <Switch
                        id="scope-expert-mode"
                        checked={currentSettings.expertMode ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { expertMode: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-plan-af">Auto-Focus on Plan Target</Label>
                        <p className="text-xs text-muted-foreground">
                          Run auto-focus when slewing to a plan target
                        </p>
                      </div>
                      <Switch
                        id="scope-plan-af"
                        checked={currentSettings.planTargetAf ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { planTargetAf: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="scope-gohome">Go Home After View Plan</Label>
                        <p className="text-xs text-muted-foreground">
                          Park the telescope when a view plan finishes
                        </p>
                      </div>
                      <Switch
                        id="scope-gohome"
                        checked={currentSettings.viewplanGohome ?? false}
                        onCheckedChange={(checked) =>
                          updateTelescopeSettings(currentTelescopeId, { viewplanGohome: checked })
                        }
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-6 text-center text-muted-foreground">
                  <SlidersHorizontal className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Connect to a telescope to configure scope parameters</p>
                </div>
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
