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
import { useUIStore } from '../stores/uiStore'
import { useTheme } from '../contexts/ThemeContext'
import { themes } from '../themes'
import { useTelescopeStore } from '../stores/telescopeStore'

export function SettingsModal() {
  const { showSettings, setShowSettings, toastsEnabled, setToastsEnabled, streamingEnabled, setStreamingEnabled, streamingQuality, setStreamingQuality } = useUIStore()
  const { theme, setTheme } = useTheme()
  const { currentTelescopeId, telescopeSettings, updateTelescopeSettings } = useTelescopeStore()

  const currentSettings = currentTelescopeId ? telescopeSettings[currentTelescopeId] : null

  return (
    <Dialog open={showSettings} onOpenChange={setShowSettings}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure application preferences and telescope settings
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="telescope">Telescope</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-4">
            <div className="flex items-center justify-between">
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

            <div className="flex items-center justify-between">
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
              <div className="space-y-2">
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
          <TabsContent value="telescope" className="space-y-4">
            {currentTelescopeId && currentSettings ? (
              <>
                <div className="space-y-2">
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

                <div className="space-y-2">
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

                <div className="flex items-center justify-between">
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
              <p className="text-sm text-muted-foreground py-4">
                Connect to a telescope to configure its settings
              </p>
            )}
          </TabsContent>

          {/* Appearance Settings */}
          <TabsContent value="appearance" className="space-y-4">
            <div className="space-y-2">
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

            <div className="grid grid-cols-5 gap-2 pt-2">
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
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
