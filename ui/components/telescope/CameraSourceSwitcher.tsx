import React from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Camera, Eye, Globe, Crosshair } from 'lucide-react'
import { useTelescopeContext } from '@/context/TelescopeContext'
import { cn } from '@/lib/utils'

export function CameraSourceSwitcher() {
  const { mainCameraSource, setMainCameraSource } = useTelescopeContext()

  const sources = [
    { value: 'telescope' as const, label: 'Telescope', icon: Camera },
    { value: 'allsky' as const, label: 'All-Sky', icon: Globe },
    { value: 'guide' as const, label: 'Guide', icon: Eye },
    { value: 'finder' as const, label: 'Finder', icon: Crosshair },
  ]

  return (
    <div className="absolute top-2 left-2 z-20">
      <Tabs
        value={mainCameraSource}
        onValueChange={(value) => setMainCameraSource(value as typeof mainCameraSource)}
        className="w-auto"
      >
        <TabsList className="grid grid-cols-4 bg-background/80 backdrop-blur-sm">
          {sources.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5",
                "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}

// Alternative compact button group version
export function CameraSourceButtons() {
  const { mainCameraSource, setMainCameraSource } = useTelescopeContext()

  const sources = [
    { value: 'telescope' as const, icon: Camera, tooltip: 'Telescope View' },
    { value: 'allsky' as const, icon: Globe, tooltip: 'All-Sky Camera' },
    { value: 'guide' as const, icon: Eye, tooltip: 'Guide Camera' },
    { value: 'finder' as const, icon: Crosshair, tooltip: 'Finder Scope' },
  ]

  return (
    <div className="absolute top-2 left-2 z-20 flex gap-1 bg-background/80 backdrop-blur-sm rounded-md p-1">
      {sources.map(({ value, icon: Icon, tooltip }) => (
        <button
          key={value}
          onClick={() => setMainCameraSource(value)}
          className={cn(
            "p-2 rounded transition-colors",
            mainCameraSource === value
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted text-muted-foreground hover:text-foreground"
          )}
          title={tooltip}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}