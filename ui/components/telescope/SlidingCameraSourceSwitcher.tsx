import React, { useState, useMemo, Fragment, useEffect } from 'react'
import { Camera, Eye, Globe, Crosshair, Video } from 'lucide-react'
import { useTelescopeContext } from '@/context/TelescopeContext'
import { cn } from '@/lib/utils'

export function SlidingCameraSourceSwitcher() {
  const { mainCameraSource, setMainCameraSource, currentTelescope, clientMode } = useTelescopeContext()
  const [isExpanded, setIsExpanded] = useState(false)

  // Check if secondary camera is available (S30 in streaming/solar_sys mode)
  const isS30InStreamingMode = currentTelescope?.product_model?.toLowerCase()?.includes('s30') &&
                               (clientMode === 'RTSP' || clientMode === 'Streaming' || clientMode === 'solar_sys')

  // Check if guide and finder URLs are available
  // For now, we'll assume they're not available and just show telescope and all-sky
  // In a real implementation, you'd check if the telescope provides these streams
  const hasGuideCamera = false // TODO: Check if telescope has guide camera endpoint
  const hasFinderScope = false // TODO: Check if telescope has finder scope endpoint

  const sources = useMemo(() => {
    const baseSources = []

    // Always add telescope first
    baseSources.push({ value: 'telescope' as const, icon: Camera, label: 'Telescope' })

    // Always add all-sky second
    baseSources.push({ value: 'allsky' as const, icon: Globe, label: 'All-Sky' })

    // Add secondary camera third if available
    if (isS30InStreamingMode) {
      baseSources.push({ value: 'secondary' as const, icon: Video, label: 'Secondary' })
    }

    // Add other cameras if available (for future use)
    if (hasGuideCamera) {
      baseSources.push({ value: 'guide' as const, icon: Eye, label: 'Guide' })
    }
    if (hasFinderScope) {
      baseSources.push({ value: 'finder' as const, icon: Crosshair, label: 'Finder' })
    }

    return baseSources
  }, [isS30InStreamingMode, hasGuideCamera, hasFinderScope])

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

  // If only 2 or 3 sources, render as a segmented button group
  if (sources.length <= 3) {
    return (
      <div className="absolute top-2 left-2 z-20">
        <div className={cn(
          "flex items-center rounded-full",
          "bg-background/90 backdrop-blur-sm border border-border/50",
          "p-1"
        )}>
          {sources.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => setMainCameraSource(value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full",
                "transition-all duration-200",
                "text-xs font-medium",
                mainCameraSource === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
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
  const { mainCameraSource, setMainCameraSource, currentTelescope, clientMode } = useTelescopeContext()
  const [isExpanded, setIsExpanded] = useState(false)

  // Check if secondary camera is available (S30 in streaming/solar_sys mode)
  const isS30InStreamingMode = currentTelescope?.product_model?.toLowerCase()?.includes('s30') &&
                               (clientMode === 'RTSP' || clientMode === 'Streaming' || clientMode === 'solar_sys')

  // Check if guide and finder URLs are available
  const hasGuideCamera = false // TODO: Check if telescope has guide camera endpoint
  const hasFinderScope = false // TODO: Check if telescope has finder scope endpoint

  const sources = useMemo(() => {
    const baseSources = []

    // Always add telescope first
    baseSources.push({ value: 'telescope' as const, icon: Camera, tooltip: 'Telescope' })

    // Always add all-sky second
    baseSources.push({ value: 'allsky' as const, icon: Globe, tooltip: 'All-Sky' })

    // Add secondary camera third if available
    if (isS30InStreamingMode) {
      baseSources.push({ value: 'secondary' as const, icon: Video, tooltip: 'Secondary' })
    }

    // Add other cameras if available (for future use)
    if (hasGuideCamera) {
      baseSources.push({ value: 'guide' as const, icon: Eye, tooltip: 'Guide' })
    }
    if (hasFinderScope) {
      baseSources.push({ value: 'finder' as const, icon: Crosshair, tooltip: 'Finder' })
    }

    return baseSources
  }, [isS30InStreamingMode, hasGuideCamera, hasFinderScope])

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