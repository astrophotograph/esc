"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Settings, 
  Save, 
  RotateCcw, 
  Folder, 
  Camera, 
  Telescope as TelescopeIcon, 
  Monitor, 
  Bell, 
  Database,
  X,
  AlertTriangle,
  CheckCircle,
  Loader2,
  FolderOpen,
  Key,
  Globe,
  Eye,
  EyeOff
} from "lucide-react"
import { AppSettings, SettingsApiResponse, SettingsValidationError } from "@/types/settings-types"
import { useToast } from "@/hooks/use-toast"

interface ConfigurationPageProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConfigurationPage({ open, onOpenChange }: ConfigurationPageProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<SettingsValidationError[]>([])
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({})
  const { toast } = useToast()

  // Load settings when modal opens
  useEffect(() => {
    if (open && !settings) {
      loadSettings()
    }
    
    // Ensure proper cleanup on close
    if (!open) {
      setErrors([])
      setSaving(false)
      // Remove pointer-events: none that might be left on body
      document.body.style.pointerEvents = ''
      document.body.style.removeProperty('pointer-events')
      // Also check for data-scroll-locked attribute that some libraries use
      document.body.removeAttribute('data-scroll-locked')
      // Restore focus to body when dialog closes
      document.body.focus()
    }
    
    // Cleanup function to ensure body styles are reset when component unmounts
    return () => {
      document.body.style.pointerEvents = ''
      document.body.style.removeProperty('pointer-events')
      document.body.removeAttribute('data-scroll-locked')
    }
  }, [open])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/settings')
      const data: SettingsApiResponse = await response.json()
      
      if (data.success && data.settings) {
        setSettings(data.settings)
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to load settings",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error loading settings:', error)
      toast({
        title: "Error", 
        description: "Failed to load settings",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    if (!settings) return
    
    setSaving(true)
    setErrors([])
    
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      })
      
      const data: SettingsApiResponse = await response.json()
      
      if (data.success) {
        toast({
          title: "Success",
          description: "Settings saved successfully",
        })
        if (data.settings) {
          setSettings(data.settings)
        }
      } else {
        if (data.validationErrors) {
          setErrors(data.validationErrors)
        }
        toast({
          title: "Error",
          description: data.error || "Failed to save settings",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const resetToDefaults = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'DELETE',
      })
      
      const data: SettingsApiResponse = await response.json()
      
      if (data.success && data.settings) {
        setSettings(data.settings)
        setErrors([])
        toast({
          title: "Success",
          description: "Settings reset to defaults",
        })
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to reset settings",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error resetting settings:', error)
      toast({
        title: "Error",
        description: "Failed to reset settings",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const updateSettings = (path: string, value: any) => {
    if (!settings) return
    
    const pathParts = path.split('.')
    const newSettings = JSON.parse(JSON.stringify(settings))
    
    let current = newSettings
    for (let i = 0; i < pathParts.length - 1; i++) {
      current = current[pathParts[i]]
    }
    current[pathParts[pathParts.length - 1]] = value
    
    setSettings(newSettings)
  }

  const getFieldError = (field: string) => {
    return errors.find(error => error.field === field)?.message
  }

  const selectDirectory = async () => {
    // This would typically open a file dialog
    // For now, we'll use a simple prompt
    const directory = prompt("Enter directory path:", settings?.subframeSaving.directory || "./captures")
    if (directory !== null) {
      updateSettings('subframeSaving.directory', directory)
    }
  }

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl h-[80vh] [&>button]:hidden">
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            <span className="ml-2">Loading settings...</span>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!settings) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-6xl h-[90vh] flex flex-col [&>button]:hidden"
        onEscapeKeyDown={() => onOpenChange(false)}
        onInteractOutside={(e) => {
          e.preventDefault() // Prevent closing on click outside
        }}>
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-blue-400" />
              <DialogTitle>Configuration</DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={resetToDefaults}
                disabled={saving}
                className="text-orange-400 hover:text-orange-300"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset Defaults
              </Button>
              <Button
                variant="outline" 
                size="sm"
                onClick={saveSettings}
                disabled={saving}
                className="text-green-400 hover:text-green-300"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save Settings
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Please fix the following errors: {errors.map(e => e.message).join(', ')}
              </AlertDescription>
            </Alert>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0">
          <Tabs defaultValue="pip" className="h-full flex flex-col">
            <TabsList className="grid grid-cols-8 w-full flex-shrink-0">
              <TabsTrigger value="pip" className="flex items-center gap-1">
                <Monitor className="h-4 w-4" />
                PIP
              </TabsTrigger>
              <TabsTrigger value="capture" className="flex items-center gap-1">
                <Database className="h-4 w-4" />
                Capture
              </TabsTrigger>
              <TabsTrigger value="camera" className="flex items-center gap-1">
                <Camera className="h-4 w-4" />
                Camera
              </TabsTrigger>
              <TabsTrigger value="telescope" className="flex items-center gap-1">
                <TelescopeIcon className="h-4 w-4" />
                Telescope
              </TabsTrigger>
              <TabsTrigger value="ui" className="flex items-center gap-1">
                <Monitor className="h-4 w-4" />
                UI
              </TabsTrigger>
              <TabsTrigger value="session" className="flex items-center gap-1">
                <Settings className="h-4 w-4" />
                Session
              </TabsTrigger>
              <TabsTrigger value="notifications" className="flex items-center gap-1">
                <Bell className="h-4 w-4" />
                Alerts
              </TabsTrigger>
              <TabsTrigger value="apikeys" className="flex items-center gap-1">
                <Key className="h-4 w-4" />
                API Keys
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0 mt-4">
              <ScrollArea className="h-full">
                {/* PIP Settings */}
                <TabsContent value="pip" className="space-y-6 pr-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Picture-in-Picture Settings</CardTitle>
                      <CardDescription>Configure the PIP window behavior and overlays</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="defaultSize">Default Size</Label>
                          <Select
                            value={settings.pip.defaultSize}
                            onValueChange={(value) => updateSettings('pip.defaultSize', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="small">Small (200×150)</SelectItem>
                              <SelectItem value="medium">Medium (320×240)</SelectItem>
                              <SelectItem value="large">Large (480×360)</SelectItem>
                              <SelectItem value="extra-large">Extra Large (640×480)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="defaultCamera">Default Camera</Label>
                          <Select
                            value={settings.pip.defaultCamera}
                            onValueChange={(value) => updateSettings('pip.defaultCamera', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="allsky">All-Sky</SelectItem>
                              <SelectItem value="guide">Guide Camera</SelectItem>
                              <SelectItem value="finder">Finder Scope</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={settings.pip.showStatusByDefault}
                          onCheckedChange={(checked) => updateSettings('pip.showStatusByDefault', checked)}
                        />
                        <Label>Show status overlay by default</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={settings.pip.autoShow}
                          onCheckedChange={(checked) => updateSettings('pip.autoShow', checked)}
                        />
                        <Label>Auto-show PIP when telescope connects</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={settings.pip.minimizedByDefault}
                          onCheckedChange={(checked) => updateSettings('pip.minimizedByDefault', checked)}
                        />
                        <Label>Start minimized by default</Label>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Overlay Settings</CardTitle>
                      <CardDescription>Configure PIP overlay elements</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Crosshairs */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-medium">Crosshairs</Label>
                          <Switch
                            checked={settings.pip.overlaySettings.crosshairs.enabled}
                            onCheckedChange={(checked) => updateSettings('pip.overlaySettings.crosshairs.enabled', checked)}
                          />
                        </div>
                        {settings.pip.overlaySettings.crosshairs.enabled && (
                          <div className="grid grid-cols-3 gap-4 ml-4">
                            <div className="space-y-2">
                              <Label>Color</Label>
                              <Input
                                type="color"
                                value={settings.pip.overlaySettings.crosshairs.color}
                                onChange={(e) => updateSettings('pip.overlaySettings.crosshairs.color', e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Thickness</Label>
                              <Slider
                                value={[settings.pip.overlaySettings.crosshairs.thickness]}
                                onValueChange={([value]) => updateSettings('pip.overlaySettings.crosshairs.thickness', value)}
                                min={1}
                                max={10}
                                step={1}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Style</Label>
                              <Select
                                value={settings.pip.overlaySettings.crosshairs.style}
                                onValueChange={(value) => updateSettings('pip.overlaySettings.crosshairs.style', value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="simple">Simple</SelectItem>
                                  <SelectItem value="circle">Circle</SelectItem>
                                  <SelectItem value="target">Target</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Grid */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-medium">Grid</Label>
                          <Switch
                            checked={settings.pip.overlaySettings.grid.enabled}
                            onCheckedChange={(checked) => updateSettings('pip.overlaySettings.grid.enabled', checked)}
                          />
                        </div>
                        {settings.pip.overlaySettings.grid.enabled && (
                          <div className="grid grid-cols-4 gap-4 ml-4">
                            <div className="space-y-2">
                              <Label>Color</Label>
                              <Input
                                type="color"
                                value={settings.pip.overlaySettings.grid.color}
                                onChange={(e) => updateSettings('pip.overlaySettings.grid.color', e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Spacing</Label>
                              <Slider
                                value={[settings.pip.overlaySettings.grid.spacing]}
                                onValueChange={([value]) => updateSettings('pip.overlaySettings.grid.spacing', value)}
                                min={10}
                                max={100}
                                step={5}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Opacity</Label>
                              <Slider
                                value={[settings.pip.overlaySettings.grid.opacity * 100]}
                                onValueChange={([value]) => updateSettings('pip.overlaySettings.grid.opacity', value / 100)}
                                min={10}
                                max={100}
                                step={5}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Style</Label>
                              <Select
                                value={settings.pip.overlaySettings.grid.style}
                                onValueChange={(value) => updateSettings('pip.overlaySettings.grid.style', value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="lines">Lines</SelectItem>
                                  <SelectItem value="dots">Dots</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Subframe Saving Settings */}
                <TabsContent value="capture" className="space-y-6 pr-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Subframe Saving</CardTitle>
                      <CardDescription>Configure automatic saving of camera subframes</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={settings.subframeSaving.enabled}
                          onCheckedChange={(checked) => updateSettings('subframeSaving.enabled', checked)}
                        />
                        <Label>Enable subframe saving</Label>
                      </div>

                      {settings.subframeSaving.enabled && (
                        <div className="space-y-4 border-l-2 border-blue-400 pl-4">
                          <div className="space-y-2">
                            <Label htmlFor="directory">Save Directory</Label>
                            <div className="flex gap-2">
                              <Input
                                value={settings.subframeSaving.directory}
                                onChange={(e) => updateSettings('subframeSaving.directory', e.target.value)}
                                placeholder="./captures"
                                className={getFieldError('subframeSaving.directory') ? 'border-red-500' : ''}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={selectDirectory}
                                className="px-3"
                              >
                                <FolderOpen className="h-4 w-4" />
                              </Button>
                            </div>
                            {getFieldError('subframeSaving.directory') && (
                              <p className="text-sm text-red-400">{getFieldError('subframeSaving.directory')}</p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>File Format</Label>
                              <Select
                                value={settings.subframeSaving.fileFormat}
                                onValueChange={(value) => updateSettings('subframeSaving.fileFormat', value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="jpg">JPEG</SelectItem>
                                  <SelectItem value="png">PNG</SelectItem>
                                  <SelectItem value="tiff">TIFF</SelectItem>
                                  <SelectItem value="raw">RAW</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Filename Pattern</Label>
                              <Input
                                value={settings.subframeSaving.filenamePattern}
                                onChange={(e) => updateSettings('subframeSaving.filenamePattern', e.target.value)}
                                placeholder="capture_%Y%m%d_%H%M%S"
                              />
                            </div>
                          </div>

                          {settings.subframeSaving.fileFormat === 'jpg' && (
                            <div className="space-y-2">
                              <Label>JPEG Quality: {settings.subframeSaving.quality}%</Label>
                              <Slider
                                value={[settings.subframeSaving.quality]}
                                onValueChange={([value]) => updateSettings('subframeSaving.quality', value)}
                                min={1}
                                max={100}
                                step={1}
                                className={getFieldError('subframeSaving.quality') ? 'border-red-500' : ''}
                              />
                              {getFieldError('subframeSaving.quality') && (
                                <p className="text-sm text-red-400">{getFieldError('subframeSaving.quality')}</p>
                              )}
                            </div>
                          )}

                          {(settings.subframeSaving.fileFormat === 'png' || settings.subframeSaving.fileFormat === 'tiff') && (
                            <div className="space-y-2">
                              <Label>Compression Level: {settings.subframeSaving.compression}</Label>
                              <Slider
                                value={[settings.subframeSaving.compression]}
                                onValueChange={([value]) => updateSettings('subframeSaving.compression', value)}
                                min={0}
                                max={9}
                                step={1}
                                className={getFieldError('subframeSaving.compression') ? 'border-red-500' : ''}
                              />
                              {getFieldError('subframeSaving.compression') && (
                                <p className="text-sm text-red-400">{getFieldError('subframeSaving.compression')}</p>
                              )}
                            </div>
                          )}

                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={settings.subframeSaving.saveMetadata}
                              onCheckedChange={(checked) => updateSettings('subframeSaving.saveMetadata', checked)}
                            />
                            <Label>Save metadata (EXIF)</Label>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={settings.subframeSaving.autoSave}
                              onCheckedChange={(checked) => updateSettings('subframeSaving.autoSave', checked)}
                            />
                            <Label>Auto-save at intervals</Label>
                          </div>

                          {settings.subframeSaving.autoSave && (
                            <div className="grid grid-cols-2 gap-4 ml-6">
                              <div className="space-y-2">
                                <Label>Save Interval (seconds)</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={settings.subframeSaving.saveInterval}
                                  onChange={(e) => updateSettings('subframeSaving.saveInterval', parseInt(e.target.value) || 30)}
                                  className={getFieldError('subframeSaving.saveInterval') ? 'border-red-500' : ''}
                                />
                                {getFieldError('subframeSaving.saveInterval') && (
                                  <p className="text-sm text-red-400">{getFieldError('subframeSaving.saveInterval')}</p>
                                )}
                              </div>

                              <div className="space-y-2">
                                <Label>Max Files (0 = unlimited)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={settings.subframeSaving.maxFiles}
                                  onChange={(e) => updateSettings('subframeSaving.maxFiles', parseInt(e.target.value) || 0)}
                                  className={getFieldError('subframeSaving.maxFiles') ? 'border-red-500' : ''}
                                />
                                {getFieldError('subframeSaving.maxFiles') && (
                                  <p className="text-sm text-red-400">{getFieldError('subframeSaving.maxFiles')}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Camera Settings */}
                <TabsContent value="camera" className="space-y-6 pr-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Camera Defaults</CardTitle>
                      <CardDescription>Default values for camera settings</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Default Exposure (seconds)</Label>
                          <Input
                            type="number"
                            min={0.1}
                            max={10}
                            step={0.1}
                            value={settings.camera.defaultExposure}
                            onChange={(e) => updateSettings('camera.defaultExposure', parseFloat(e.target.value) || 1.0)}
                            className={getFieldError('camera.defaultExposure') ? 'border-red-500' : ''}
                          />
                          {getFieldError('camera.defaultExposure') && (
                            <p className="text-sm text-red-400">{getFieldError('camera.defaultExposure')}</p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Default Gain</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={settings.camera.defaultGain}
                            onChange={(e) => updateSettings('camera.defaultGain', parseInt(e.target.value) || 50)}
                            className={getFieldError('camera.defaultGain') ? 'border-red-500' : ''}
                          />
                          {getFieldError('camera.defaultGain') && (
                            <p className="text-sm text-red-400">{getFieldError('camera.defaultGain')}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Video Quality</Label>
                          <Select
                            value={settings.camera.videoQuality}
                            onValueChange={(value) => updateSettings('camera.videoQuality', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="ultra">Ultra</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Preferred Connection</Label>
                          <Select
                            value={settings.camera.preferredConnection}
                            onValueChange={(value) => updateSettings('camera.preferredConnection', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Auto</SelectItem>
                              <SelectItem value="webrtc">WebRTC</SelectItem>
                              <SelectItem value="mjpeg">MJPEG</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={settings.camera.autoExposure}
                          onCheckedChange={(checked) => updateSettings('camera.autoExposure', checked)}
                        />
                        <Label>Enable auto-exposure</Label>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Other tabs would continue here... */}
                <TabsContent value="telescope" className="space-y-6 pr-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Telescope Defaults</CardTitle>
                      <CardDescription>Default telescope behavior settings</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Default Move Speed</Label>
                          <Select
                            value={settings.telescope.defaultMoveSpeed.toString()}
                            onValueChange={(value) => updateSettings('telescope.defaultMoveSpeed', parseInt(value))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1x (Fine)</SelectItem>
                              <SelectItem value="2">2x (Slow)</SelectItem>
                              <SelectItem value="4">4x (Medium)</SelectItem>
                              <SelectItem value="8">8x (Fast)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>GoTo Timeout (seconds)</Label>
                          <Input
                            type="number"
                            min={10}
                            max={600}
                            value={settings.telescope.gotoTimeout}
                            onChange={(e) => updateSettings('telescope.gotoTimeout', parseInt(e.target.value) || 120)}
                            className={getFieldError('telescope.gotoTimeout') ? 'border-red-500' : ''}
                          />
                          {getFieldError('telescope.gotoTimeout') && (
                            <p className="text-sm text-red-400">{getFieldError('telescope.gotoTimeout')}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={settings.telescope.trackingEnabled}
                          onCheckedChange={(checked) => updateSettings('telescope.trackingEnabled', checked)}
                        />
                        <Label>Enable tracking by default</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={settings.telescope.parkOnDisconnect}
                          onCheckedChange={(checked) => updateSettings('telescope.parkOnDisconnect', checked)}
                        />
                        <Label>Park telescope on disconnect</Label>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* UI Settings */}
                <TabsContent value="ui" className="space-y-6 pr-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>User Interface</CardTitle>
                      <CardDescription>Customize the user interface appearance and behavior</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Theme</Label>
                          <Select
                            value={settings.ui.theme}
                            onValueChange={(value) => updateSettings('ui.theme', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="dark">Dark</SelectItem>
                              <SelectItem value="light">Light</SelectItem>
                              <SelectItem value="auto">Auto</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Language</Label>
                          <Select
                            value={settings.ui.language}
                            onValueChange={(value) => updateSettings('ui.language', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="en">English</SelectItem>
                              <SelectItem value="es">Español</SelectItem>
                              <SelectItem value="fr">Français</SelectItem>
                              <SelectItem value="de">Deutsch</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={settings.ui.compactMode}
                            onCheckedChange={(checked) => updateSettings('ui.compactMode', checked)}
                          />
                          <Label>Compact mode</Label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={settings.ui.showTooltips}
                            onCheckedChange={(checked) => updateSettings('ui.showTooltips', checked)}
                          />
                          <Label>Show tooltips</Label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={settings.ui.animationsEnabled}
                            onCheckedChange={(checked) => updateSettings('ui.animationsEnabled', checked)}
                          />
                          <Label>Enable animations</Label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={settings.ui.showStatusAlerts}
                            onCheckedChange={(checked) => updateSettings('ui.showStatusAlerts', checked)}
                          />
                          <Label>Show status alerts</Label>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Session Settings */}
                <TabsContent value="session" className="space-y-6 pr-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Session Management</CardTitle>
                      <CardDescription>Configure how sessions are handled</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={settings.session.autoStartSession}
                          onCheckedChange={(checked) => updateSettings('session.autoStartSession', checked)}
                        />
                        <Label>Auto-start session on connect</Label>
                      </div>

                      <div className="space-y-2">
                        <Label>Auto-save Interval (minutes)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={60}
                          value={settings.session.autoSaveInterval}
                          onChange={(e) => updateSettings('session.autoSaveInterval', parseInt(e.target.value) || 5)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Export Format</Label>
                        <Select
                          value={settings.session.exportFormat}
                          onValueChange={(value) => updateSettings('session.exportFormat', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="json">JSON</SelectItem>
                            <SelectItem value="csv">CSV</SelectItem>
                            <SelectItem value="pdf">PDF</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Notification Settings */}
                <TabsContent value="notifications" className="space-y-6 pr-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Notifications & Alerts</CardTitle>
                      <CardDescription>Configure notification preferences</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={settings.notifications.enableBrowserNotifications}
                          onCheckedChange={(checked) => updateSettings('notifications.enableBrowserNotifications', checked)}
                        />
                        <Label>Enable browser notifications</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={settings.notifications.enableSounds}
                          onCheckedChange={(checked) => updateSettings('notifications.enableSounds', checked)}
                        />
                        <Label>Enable notification sounds</Label>
                      </div>

                      {settings.notifications.enableSounds && (
                        <div className="space-y-2 ml-6">
                          <Label>Sound Volume: {settings.notifications.soundVolume}%</Label>
                          <Slider
                            value={[settings.notifications.soundVolume]}
                            onValueChange={([value]) => updateSettings('notifications.soundVolume', value)}
                            min={0}
                            max={100}
                            step={5}
                          />
                        </div>
                      )}

                      <Separator />

                      <div className="space-y-3">
                        <Label className="text-base font-medium">Alert Types</Label>
                        
                        <div className="space-y-2 ml-4">
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={settings.notifications.alertTypes.connectionLost}
                              onCheckedChange={(checked) => updateSettings('notifications.alertTypes.connectionLost', checked)}
                            />
                            <Label>Connection lost</Label>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={settings.notifications.alertTypes.gotoComplete}
                              onCheckedChange={(checked) => updateSettings('notifications.alertTypes.gotoComplete', checked)}
                            />
                            <Label>GoTo complete</Label>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={settings.notifications.alertTypes.lowBattery}
                              onCheckedChange={(checked) => updateSettings('notifications.alertTypes.lowBattery', checked)}
                            />
                            <Label>Low battery</Label>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={settings.notifications.alertTypes.weatherAlerts}
                              onCheckedChange={(checked) => updateSettings('notifications.alertTypes.weatherAlerts', checked)}
                            />
                            <Label>Weather alerts</Label>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={settings.notifications.alertTypes.maintenanceReminders}
                              onCheckedChange={(checked) => updateSettings('notifications.alertTypes.maintenanceReminders', checked)}
                            />
                            <Label>Maintenance reminders</Label>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* API Keys Settings */}
                <TabsContent value="apikeys" className="space-y-6 pr-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>API Keys Configuration</CardTitle>
                      <CardDescription>
                        Manage third-party service API keys for enhanced functionality
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Astrometry.net API Key */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label className="text-base font-medium">Astrometry.net</Label>
                            <p className="text-sm text-muted-foreground">
                              API key for plate solving and celestial coordinate determination
                            </p>
                          </div>
                          <Switch
                            checked={settings?.apiKeys?.astrometry?.enabled ?? false}
                            onCheckedChange={(checked) => 
                              updateSettings('apiKeys.astrometry.enabled', checked)
                            }
                          />
                        </div>
                        
                        {settings?.apiKeys?.astrometry?.enabled && (
                          <div className="space-y-2 ml-6">
                            <div className="space-y-2">
                              <Label htmlFor="astrometry-key">API Key</Label>
                              <div className="flex items-center space-x-2">
                                <div className="relative flex-1">
                                  <Input
                                    id="astrometry-key"
                                    type={showApiKeys['astrometry'] ? 'text' : 'password'}
                                    value={settings?.apiKeys?.astrometry?.apiKey || ''}
                                    onChange={(e) => 
                                      updateSettings('apiKeys.astrometry.apiKey', e.target.value)
                                    }
                                    placeholder="Enter your Astrometry.net API key"
                                    className={getFieldError('apiKeys.astrometry.apiKey') ? 'border-red-500' : ''}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                    onClick={() => setShowApiKeys(prev => ({
                                      ...prev,
                                      astrometry: !prev.astrometry
                                    }))}
                                  >
                                    {showApiKeys['astrometry'] ? (
                                      <EyeOff className="h-4 w-4" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                              {getFieldError('apiKeys.astrometry.apiKey') && (
                                <p className="text-sm text-red-500">
                                  {getFieldError('apiKeys.astrometry.apiKey')}
                                </p>
                              )}
                            </div>
                            
                            <div className="space-y-2">
                              <Label htmlFor="astrometry-url">API URL (Optional)</Label>
                              <Input
                                id="astrometry-url"
                                type="url"
                                value={settings?.apiKeys?.astrometry?.apiUrl || ''}
                                onChange={(e) => 
                                  updateSettings('apiKeys.astrometry.apiUrl', e.target.value)
                                }
                                placeholder="https://nova.astrometry.net (default)"
                              />
                            </div>
                            
                            <div className="flex items-center space-x-2 text-sm">
                              <Globe className="h-4 w-4 text-blue-400" />
                              <a 
                                href="https://nova.astrometry.net/api_help" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline"
                              >
                                Get your Astrometry.net API key
                              </a>
                            </div>
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* OpenWeatherMap API Key */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label className="text-base font-medium">OpenWeatherMap</Label>
                            <p className="text-sm text-muted-foreground">
                              API key for weather data and cloud coverage information
                            </p>
                          </div>
                          <Switch
                            checked={settings?.apiKeys?.openWeatherMap?.enabled ?? false}
                            onCheckedChange={(checked) => 
                              updateSettings('apiKeys.openWeatherMap.enabled', checked)
                            }
                          />
                        </div>
                        
                        {settings?.apiKeys?.openWeatherMap?.enabled && (
                          <div className="space-y-2 ml-6">
                            <div className="space-y-2">
                              <Label htmlFor="openweather-key">API Key</Label>
                              <div className="flex items-center space-x-2">
                                <div className="relative flex-1">
                                  <Input
                                    id="openweather-key"
                                    type={showApiKeys['openweather'] ? 'text' : 'password'}
                                    value={settings?.apiKeys?.openWeatherMap?.apiKey || ''}
                                    onChange={(e) => 
                                      updateSettings('apiKeys.openWeatherMap.apiKey', e.target.value)
                                    }
                                    placeholder="Enter your OpenWeatherMap API key"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                    onClick={() => setShowApiKeys(prev => ({
                                      ...prev,
                                      openweather: !prev.openweather
                                    }))}
                                  >
                                    {showApiKeys['openweather'] ? (
                                      <EyeOff className="h-4 w-4" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-2 text-sm">
                              <Globe className="h-4 w-4 text-blue-400" />
                              <a 
                                href="https://openweathermap.org/api" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline"
                              >
                                Get your OpenWeatherMap API key
                              </a>
                            </div>
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* IPGeolocation API Key */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label className="text-base font-medium">IPGeolocation</Label>
                            <p className="text-sm text-muted-foreground">
                              API key for automatic location detection
                            </p>
                          </div>
                          <Switch
                            checked={settings?.apiKeys?.ipgeolocation?.enabled ?? false}
                            onCheckedChange={(checked) => 
                              updateSettings('apiKeys.ipgeolocation.enabled', checked)
                            }
                          />
                        </div>
                        
                        {settings?.apiKeys?.ipgeolocation?.enabled && (
                          <div className="space-y-2 ml-6">
                            <div className="space-y-2">
                              <Label htmlFor="ipgeo-key">API Key</Label>
                              <div className="flex items-center space-x-2">
                                <div className="relative flex-1">
                                  <Input
                                    id="ipgeo-key"
                                    type={showApiKeys['ipgeo'] ? 'text' : 'password'}
                                    value={settings?.apiKeys?.ipgeolocation?.apiKey || ''}
                                    onChange={(e) => 
                                      updateSettings('apiKeys.ipgeolocation.apiKey', e.target.value)
                                    }
                                    placeholder="Enter your IPGeolocation API key"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                    onClick={() => setShowApiKeys(prev => ({
                                      ...prev,
                                      ipgeo: !prev.ipgeo
                                    }))}
                                  >
                                    {showApiKeys['ipgeo'] ? (
                                      <EyeOff className="h-4 w-4" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-2 text-sm">
                              <Globe className="h-4 w-4 text-blue-400" />
                              <a 
                                href="https://ipgeolocation.io" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline"
                              >
                                Get your IPGeolocation API key
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      API keys are stored securely on the server and are never exposed to the client.
                      Make sure to save your settings after entering or updating API keys.
                    </AlertDescription>
                  </Alert>
                </TabsContent>
              </ScrollArea>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}