"use client"

import { useEffect, useState } from "react"
import { Search, MapPin, Star, Moon, Sun, Telescope, Clock } from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { useTelescopeContext } from "../../context/TelescopeContext"
import { getObjectTypeIcon } from "../../utils/telescope-utils"
import { 
  addHorizonInfo, 
  filterVisibleObjects, 
  getDynamicCelestialObjects,
  DEFAULT_OBSERVER_LOCATION,
  type CelestialObjectWithHorizon 
} from "../../utils/celestial-calculations"

interface CelestialSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CelestialSearchDialog({ open, onOpenChange }: CelestialSearchDialogProps) {
  const { celestialObjects, handleTargetSelect } = useTelescopeContext()
  const [visibleObjects, setVisibleObjects] = useState<CelestialObjectWithHorizon[]>([])

  useEffect(() => {
    // Get objects with real-time calculations for planets, sun, moon
    const objectsWithHorizon = getDynamicCelestialObjects(celestialObjects, DEFAULT_OBSERVER_LOCATION)
    
    // Filter to only show objects above horizon
    const filtered = filterVisibleObjects(objectsWithHorizon, 0)
    
    // Sort by altitude (highest first)
    filtered.sort((a, b) => b.altitude - a.altitude)
    
    setVisibleObjects(filtered)
  }, [celestialObjects])

  // Group objects by type
  const groupedObjects = visibleObjects.reduce((groups, obj) => {
    const type = obj.type
    if (!groups[type]) {
      groups[type] = []
    }
    groups[type].push(obj)
    return groups
  }, {} as Record<string, CelestialObjectWithHorizon[]>)

  const getGroupTitle = (type: string) => {
    switch (type) {
      case 'planet': return 'Planets & Sun'
      case 'moon': return 'Moon'
      case 'galaxy': return 'Galaxies'
      case 'nebula': return 'Nebulae'
      case 'cluster': return 'Star Clusters'
      case 'double-star': return 'Double Stars'
      default: return type.charAt(0).toUpperCase() + type.slice(1)
    }
  }

  const getGroupIcon = (type: string) => {
    switch (type) {
      case 'planet': return <Sun className="w-4 h-4" />
      case 'moon': return <Moon className="w-4 h-4" />
      case 'galaxy': return <Star className="w-4 h-4" />
      case 'nebula': return <Star className="w-4 h-4" />
      case 'cluster': return <Star className="w-4 h-4" />
      case 'double-star': return <Star className="w-4 h-4" />
      default: return <Telescope className="w-4 h-4" />
    }
  }

  const handleSelect = (obj: CelestialObjectWithHorizon) => {
    // Convert back to CelestialObject type for context
    const celestialObject = {
      id: obj.id,
      name: obj.name,
      type: obj.type as any,
      magnitude: obj.magnitude,
      ra: obj.ra,
      dec: obj.dec,
      bestSeenIn: obj.bestSeenIn,
      description: obj.description,
      optimalMoonPhase: obj.optimalMoonPhase as any,
      isCurrentlyVisible: obj.isCurrentlyVisible
    }
    
    handleTargetSelect(celestialObject)
    onOpenChange(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput 
        placeholder="Search celestial objects above horizon..." 
        className="text-base"
      />
      <CommandList className="max-h-[400px]">
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-6">
            <Search className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No visible objects found</p>
            <p className="text-xs text-muted-foreground">
              Only objects above the horizon are shown
            </p>
          </div>
        </CommandEmpty>
        
        {Object.entries(groupedObjects).map(([type, objects]) => {
          if (objects.length === 0) return null
          
          return (
            <CommandGroup key={type} heading={getGroupTitle(type)}>
              {objects.map((obj) => (
                <CommandItem
                  key={obj.id}
                  value={`${obj.name} ${obj.type} ${obj.description}`}
                  onSelect={() => handleSelect(obj)}
                  className="flex items-center justify-between p-3 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                      {getObjectTypeIcon(obj.type)}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{obj.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          Mag {obj.magnitude}
                        </Badge>
                        {obj._realTimeData && (
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Real-time
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {obj.description}
                        {obj.id === 'moon' && obj._realTimeData?.moonData && (
                          <div className="text-xs mt-1">
                            Phase: {Math.round(obj._realTimeData.moonData.illumination * 100)}% illuminated
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      <span>{obj.altitude.toFixed(1)}°</span>
                    </div>
                    <Badge 
                      variant={obj.altitude > 45 ? "default" : obj.altitude > 20 ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {obj.altitude > 45 ? "High" : obj.altitude > 20 ? "Med" : "Low"}
                    </Badge>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
      
      <div className="border-t p-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>Showing {visibleObjects.length} objects above horizon</span>
          <div className="flex items-center gap-2">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              <span className="text-xs">⌘</span>K
            </kbd>
            <span>to search</span>
          </div>
        </div>
      </div>
    </CommandDialog>
  )
}