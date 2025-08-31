import React, { useState, useMemo, Fragment, useEffect } from 'react'
import { Camera, Eye, Globe, Crosshair } from 'lucide-react'
import { useTelescopeContext } from '@/context/TelescopeContext'
import { cn } from '@/lib/utils'

export function SlidingCameraSourceSwitcher() {
  const { mainCameraSource, setMainCameraSource, currentTelescope } = useTelescopeContext()
  const [isExpanded, setIsExpanded] = useState(false)

  // Check if guide and finder URLs are available
  // For now, we'll assume they're not available and just show telescope and all-sky
  // In a real implementation, you'd check if the telescope provides these streams
  const hasGuideCamera = false // TODO: Check if telescope has guide camera endpoint
  const hasFinderScope = false // TODO: Check if telescope has finder scope endpoint

  const sources = useMemo(() => {
    const baseSources = [
      { value: 'telescope' as const, icon: Camera, label: 'Telescope' },
      { value: 'allsky' as const, icon: Globe, label: 'All-Sky' },
    ]
    
    if (hasGuideCamera) {
      baseSources.push({ value: 'guide' as const, icon: Eye, label: 'Guide' })
    }
    if (hasFinderScope) {
      baseSources.push({ value: 'finder' as const, icon: Crosshair, label: 'Finder' })
    }
    
    return baseSources
  }, [hasGuideCamera, hasFinderScope])

  // Reset to telescope if current source is not available
  useEffect(() => {
    const isSourceAvailable = sources.some(s => s.value === mainCameraSource)
    if (!isSourceAvailable && mainCameraSource !== 'telescope') {
      setMainCameraSource('telescope')
    }
  }, [mainCameraSource, sources, setMainCameraSource])

  // Find current source
  const currentSource = sources.find(s => s.value === mainCameraSource) || sources[0]

  // Reorder sources to put current one first
  const orderedSources = [
    currentSource,
    ...sources.filter(s => s.value !== mainCameraSource)
  ]

  // If only 2 sources (telescope and all-sky), render as a simple toggle button
  if (sources.length === 2) {
    return (
      <div className="absolute top-2 left-2 z-20">
        <button
          onClick={() => {
            // Toggle between the two sources
            const nextSource = sources.find(s => s.value !== mainCameraSource)
            if (nextSource) {
              setMainCameraSource(nextSource.value)
            }
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-full",
            "bg-background/90 backdrop-blur-sm border border-border/50",
            "hover:bg-background/95 transition-all duration-200",
            "group"
          )}
        >
          <div className="flex items-center gap-1.5">
            <currentSource.icon className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium">{currentSource.label}</span>
          </div>
          
          <div className="w-px h-4 bg-border" />
          
          <div className="flex items-center gap-1.5 opacity-50 group-hover:opacity-100 transition-opacity">
            {sources
              .filter(s => s.value !== mainCameraSource)
              .map(source => (
                <React.Fragment key={source.value}>
                  <source.icon className="h-4 w-4" />
                  <span className="text-xs">{source.label}</span>
                </React.Fragment>
              ))}
          </div>
        </button>
      </div>
    )
  }

  // Original sliding behavior for multiple sources
  return (
    <div 
      className="absolute top-2 left-2 z-20"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className={cn(
        "flex items-center bg-background/90 backdrop-blur-sm rounded-full border border-border/50",
        "transition-all duration-300 ease-in-out",
        isExpanded ? "gap-1 p-1" : "gap-0 p-0"
      )}>
        {/* Current selection - always visible */}
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-full",
            "bg-primary text-primary-foreground",
            "transition-all duration-300",
            "min-w-[100px]"
          )}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <currentSource.icon className="h-4 w-4" />
          <span className="text-xs font-medium">{currentSource.label}</span>
        </button>

        {/* Other options - slide out on hover */}
        <div className={cn(
          "flex items-center gap-1 overflow-hidden",
          "transition-all duration-300 ease-in-out",
          isExpanded ? "max-w-[300px] opacity-100" : "max-w-0 opacity-0"
        )}>
          {sources
            .filter(s => s.value !== mainCameraSource)
            .map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => {
                  setMainCameraSource(value)
                  setIsExpanded(false)
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-full",
                  "hover:bg-muted text-muted-foreground hover:text-foreground",
                  "transition-all duration-200",
                  "whitespace-nowrap"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}

// Alternative compact version with icon-only buttons
export function CompactSlidingCameraSourceSwitcher() {
  const { mainCameraSource, setMainCameraSource } = useTelescopeContext()
  const [isExpanded, setIsExpanded] = useState(false)

  // Check if guide and finder URLs are available
  const hasGuideCamera = false // TODO: Check if telescope has guide camera endpoint
  const hasFinderScope = false // TODO: Check if telescope has finder scope endpoint

  const sources = useMemo(() => {
    const baseSources = [
      { value: 'telescope' as const, icon: Camera, tooltip: 'Telescope' },
      { value: 'allsky' as const, icon: Globe, tooltip: 'All-Sky' },
    ]
    
    if (hasGuideCamera) {
      baseSources.push({ value: 'guide' as const, icon: Eye, tooltip: 'Guide' })
    }
    if (hasFinderScope) {
      baseSources.push({ value: 'finder' as const, icon: Crosshair, tooltip: 'Finder' })
    }
    
    return baseSources
  }, [hasGuideCamera, hasFinderScope])

  const currentSource = sources.find(s => s.value === mainCameraSource) || sources[0]

  return (
    <div 
      className="absolute top-2 left-2 z-20"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className={cn(
        "flex items-center bg-background/90 backdrop-blur-sm rounded-lg border border-border/50",
        "transition-all duration-300 ease-in-out",
        isExpanded ? "gap-0.5 p-1" : "gap-0 p-0"
      )}>
        {/* Current selection - always visible with label */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md",
            "bg-primary text-primary-foreground",
            "transition-all duration-300"
          )}
          title={currentSource.tooltip}
        >
          <currentSource.icon className="h-4 w-4" />
          <span className="text-xs font-medium">{currentSource.tooltip}</span>
        </div>

        {/* Other options - slide out on hover (icon only) */}
        <div className={cn(
          "flex items-center overflow-hidden",
          "transition-all duration-300 ease-in-out",
          isExpanded ? "max-w-[150px] opacity-100" : "max-w-0 opacity-0"
        )}>
          {sources
            .filter(s => s.value !== mainCameraSource)
            .map(({ value, icon: Icon, tooltip }) => (
              <button
                key={value}
                onClick={() => {
                  setMainCameraSource(value)
                  setIsExpanded(false)
                }}
                className={cn(
                  "p-1.5 rounded-md",
                  "hover:bg-muted text-muted-foreground hover:text-foreground",
                  "transition-all duration-200"
                )}
                title={tooltip}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}