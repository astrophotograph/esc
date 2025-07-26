"use client"

import { useEffect, useState, useCallback } from "react"
import { Search, MapPin, Clock, Navigation, Camera } from "lucide-react"
import { toast } from "sonner"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useTelescopeContext } from "../../context/TelescopeContext"
import { getObjectTypeIcon } from "../../utils/telescope-utils"
import { 
  filterVisibleObjects, 
  getDynamicCelestialObjects,
  DEFAULT_OBSERVER_LOCATION,
  type CelestialObjectWithHorizon 
} from "../../utils/celestial-calculations"
import { catalogAPI, CatalogAPI } from "../../services/catalog-api"

interface CelestialSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CelestialSearchDialog({ open, onOpenChange }: CelestialSearchDialogProps) {
  const { currentObservingLocation, handleTargetSelect, streamStatus, handleGotoTarget } = useTelescopeContext()
  const [visibleObjects, setVisibleObjects] = useState<CelestialObjectWithHorizon[]>([])
  const [selectedObject, setSelectedObject] = useState<CelestialObjectWithHorizon | null>(null)
  const [isPerformingAction, setIsPerformingAction] = useState(false)
  const [showStopImagingConfirm, setShowStopImagingConfirm] = useState(false)
  const [pendingGotoAction, setPendingGotoAction] = useState<{ startImaging: boolean } | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchCatalogObjects = useCallback(async () => {
    setIsLoading(true)
    try {
      // Use current observing location or default to NYC
      const location = currentObservingLocation || {
        coordinates: { latitude: DEFAULT_OBSERVER_LOCATION.latitude, longitude: DEFAULT_OBSERVER_LOCATION.longitude },
        elevation: 0
      }

      const response = await catalogAPI.searchCatalog({
        query: debouncedSearchQuery || undefined,
        above_horizon_only: true,
        latitude: location.coordinates.latitude,
        longitude: location.coordinates.longitude,
        elevation: location.elevation,
        limit: 100
      })

      // Convert catalog objects to frontend format
      const convertedObjects = response.objects.map((obj, index) => 
        CatalogAPI.convertToFrontendObject(obj, index)
      ) as CelestialObjectWithHorizon[]

      setVisibleObjects(convertedObjects)
    } catch (error) {
      console.error('Failed to fetch catalog objects:', error)
      toast.error('Failed to load catalog data')
      // Fallback to static data
      const objectsWithHorizon = getDynamicCelestialObjects([], DEFAULT_OBSERVER_LOCATION)
      const filtered = filterVisibleObjects(objectsWithHorizon, 0)
      filtered.sort((a, b) => b.altitude - a.altitude)
      setVisibleObjects(filtered)
    } finally {
      setIsLoading(false)
    }
  }, [debouncedSearchQuery, currentObservingLocation])

  useEffect(() => {
    if (!open) return
    fetchCatalogObjects()
  }, [open, fetchCatalogObjects])

  // Reset selected object when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedObject(null)
      setIsPerformingAction(false)
      setShowStopImagingConfirm(false)
      setPendingGotoAction(null)
    }
  }, [open])

  // Get display group for an object based on its type
  const getDisplayGroup = (type: string) => {
    const typeMapping: Record<string, string> = {
      // Planets and Solar System
      'Planet': 'Planets',
      'Moon': 'Planets',
      'planet': 'Planets',
      'moon': 'Planets',
      
      // Stars
      'Star': 'Stars',
      '*': 'Stars',
      '**': 'Stars',
      'V*': 'Stars',
      'double-star': 'Stars',
      
      // Nebulae
      'PN': 'Nebulae',
      'EN': 'Nebulae',
      'RN': 'Nebulae',
      'DN': 'Nebulae',
      'SNR': 'Nebulae',
      'Neb': 'Nebulae',
      'HII': 'Nebulae',
      'EmN': 'Nebulae',
      'RfN': 'Nebulae',
      'DrkN': 'Nebulae',
      'nebula': 'Nebulae',
      
      // Galaxies
      'G': 'Galaxies',
      'GPair': 'Galaxies',
      'GTrpl': 'Galaxies',
      'GGroup': 'Galaxies',
      'galaxy': 'Galaxies',
      
      // Clusters
      'OC': 'Clusters',
      'OCl': 'Clusters',
      'GC': 'Clusters',
      'GCl': 'Clusters',
      'Cl+N': 'Clusters',
      '*Ass': 'Clusters',
      'cluster': 'Clusters',
    }
    return typeMapping[type] || 'Other'
  }

  // Group objects by display group and sort by magnitude within each group
  const groupedObjects = visibleObjects.reduce((groups, obj) => {
    const displayGroup = getDisplayGroup(obj.type)
    if (!groups[displayGroup]) {
      groups[displayGroup] = []
    }
    groups[displayGroup].push(obj)
    return groups
  }, {} as Record<string, CelestialObjectWithHorizon[]>)

  // Sort each group by magnitude (brightest first)
  Object.keys(groupedObjects).forEach(group => {
    groupedObjects[group].sort((a, b) => {
      const magA = a.magnitude ?? 999
      const magB = b.magnitude ?? 999
      return magA - magB // Smaller magnitude = brighter
    })
  })

  // Define the order of groups - Stars last as requested
  const groupOrder = ['Planets', 'Nebulae', 'Galaxies', 'Clusters', 'Other', 'Stars']
  const orderedGroups = groupOrder.filter(group => groupedObjects[group])

  const getGroupTitle = (type: string) => {
    // Backend now groups objects into main categories
    const groupMapping: Record<string, string> = {
      // Main display groups from backend
      'Planets': 'Planets & Solar System',
      'Stars': 'Stars',
      'Nebulae': 'Nebulae',
      'Galaxies': 'Galaxies',
      'Clusters': 'Star Clusters',
      'Other': 'Other Objects',
      
      // Legacy mappings for compatibility
      'planet': 'Planets & Solar System',
      'moon': 'Planets & Solar System',
      'Planet': 'Planets & Solar System',
      'Moon': 'Planets & Solar System',
      'Star': 'Stars',
      '*': 'Stars',
      '**': 'Stars',
      'V*': 'Stars',
      'G': 'Galaxies',
      'galaxy': 'Galaxies',
      'GPair': 'Galaxies',
      'GTrpl': 'Galaxies',
      'GGroup': 'Galaxies',
      'PN': 'Nebulae',
      'nebula': 'Nebulae',
      'EN': 'Nebulae',
      'RN': 'Nebulae',
      'DN': 'Nebulae',
      'SNR': 'Nebulae',
      'Neb': 'Nebulae',
      'HII': 'Nebulae',
      'EmN': 'Nebulae',
      'RfN': 'Nebulae',
      'DrkN': 'Nebulae',
      'OC': 'Star Clusters',
      'OCl': 'Star Clusters',
      'GC': 'Star Clusters',
      'GCl': 'Star Clusters',
      'cluster': 'Star Clusters',
      'Cl+N': 'Star Clusters',
      '*Ass': 'Star Clusters',
      'double-star': 'Stars',
      'As': 'Other Objects',
      'Co': 'Other Objects',
      'Nova': 'Other Objects'
    }
    
    return groupMapping[type] || type.charAt(0).toUpperCase() + type.slice(1)
  }


  const handleSelect = (obj: CelestialObjectWithHorizon) => {
    setSelectedObject(obj)
  }

  const handleGoto = async (startImaging: boolean = false) => {
    if (!selectedObject) return
    
    // Check if currently imaging (stage is "Stack")
    const isCurrentlyImaging = streamStatus?.status?.stage === 'Stack'
    
    if (isCurrentlyImaging) {
      // Store the pending action and show confirmation dialog
      setPendingGotoAction({ startImaging })
      setShowStopImagingConfirm(true)
      return
    }
    
    // Proceed with goto if not imaging
    await executeGoto(startImaging)
  }

  const executeGoto = async (startImaging: boolean = false) => {
    if (!selectedObject) return
    
    setIsPerformingAction(true)
    try {
      // Convert to CelestialObject type for context first
      const celestialObject = {
        id: selectedObject.id,
        name: selectedObject.name,
        type: selectedObject.type as "galaxy" | "nebula" | "cluster" | "planet" | "moon" | "double-star",
        magnitude: selectedObject.magnitude,
        ra: selectedObject.ra,
        dec: selectedObject.dec,
        bestSeenIn: selectedObject.bestSeenIn,
        description: selectedObject.description,
        optimalMoonPhase: selectedObject.optimalMoonPhase as "new" | "crescent" | "quarter" | "gibbous" | "full" | "any",
        isCurrentlyVisible: selectedObject.isCurrentlyVisible
      }
      
      // Select the target in the context
      handleTargetSelect(celestialObject)
      
      console.log(`Sending goto message for ${selectedObject.name} with imaging=${startImaging}`)
      console.log('Message details:', {
        target_name: selectedObject.name,
        coordinates: { ra: selectedObject.ra, dec: selectedObject.dec },
        start_imaging: startImaging,
        target_type: selectedObject.type,
        magnitude: selectedObject.magnitude,
        description: selectedObject.description
      })
      
      // Close dialog immediately for better UX
      onOpenChange(false)
      
      // Execute the command in the background - context function will handle success/error notifications
      handleGotoTarget(
        selectedObject.name,
        selectedObject.ra,
        selectedObject.dec,
        startImaging,
        selectedObject.type,
        selectedObject.magnitude,
        selectedObject.description
      )
    } catch (error) {
      console.error('Failed to initiate goto command:', error)
      
      // Show error toast for immediate validation errors
      toast.error("Failed to initiate goto command", {
        description: `Could not start navigation to ${selectedObject.name}. Please try again.`,
        duration: 6000,
      })
      
      // Close the dialog
      onOpenChange(false)
    } finally {
      setIsPerformingAction(false)
    }
  }

  const handleGotoAndImage = async () => {
    // Call handleGoto with startImaging=true
    await handleGoto(true)
  }

  const handleCancel = () => {
    setSelectedObject(null)
  }

  const handleConfirmStopImaging = async () => {
    setShowStopImagingConfirm(false)
    
    if (pendingGotoAction) {
      // TODO: Add stop imaging command here if needed
      // For now, just proceed with the goto
      await executeGoto(pendingGotoAction.startImaging)
      setPendingGotoAction(null)
    }
  }

  const handleCancelStopImaging = () => {
    setShowStopImagingConfirm(false)
    setPendingGotoAction(null)
  }

  return (
    <>
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput 
        placeholder="Search celestial objects above horizon..." 
        className="text-base"
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList className="max-h-[400px]">
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-6">
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="text-sm text-muted-foreground">Loading catalog...</p>
              </>
            ) : (
              <>
                <Search className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No visible objects found</p>
                <p className="text-xs text-muted-foreground">
                  Only objects above the horizon are shown
                </p>
              </>
            )}
          </div>
        </CommandEmpty>
        
        {orderedGroups.map((group) => {
          const objects = groupedObjects[group]
          if (!objects || objects.length === 0) return null
          
          return (
            <CommandGroup key={group} heading={getGroupTitle(group)}>
              {objects.map((obj) => (
                <CommandItem
                  key={obj.id}
                  value={`${obj.name} ${obj.type} ${obj.description} ${obj.name.startsWith('M ') ? `Messier ${obj.name.slice(2)}` : ''}`}
                  onSelect={() => handleSelect(obj)}
                  className={`flex items-center justify-between p-3 cursor-pointer ${
                    selectedObject?.id === obj.id ? 'bg-blue-600/20 border-blue-400 border' : ''
                  } ${obj.altitude <= 0 ? 'opacity-60' : ''}`}
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
                        {obj.id === 'moon' && obj._moonPhase !== undefined && (
                          <div className="text-xs mt-1">
                            Phase: {Math.round(obj._moonPhase * 100)}% illuminated
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
                    {obj.altitude > 0 ? (
                      <Badge 
                        variant={obj.altitude > 45 ? "default" : obj.altitude > 20 ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        {obj.altitude > 45 ? "High" : obj.altitude > 20 ? "Med" : "Low"}
                      </Badge>
                    ) : (
                      <Badge 
                        variant="destructive"
                        className="text-xs"
                      >
                        Below Horizon
                      </Badge>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
      
      {/* Action Buttons - shown when an object is selected */}
      {selectedObject && (
        <div className="border-t p-4 bg-muted/50">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20">
                {getObjectTypeIcon(selectedObject.type)}
              </div>
              <div>
                <span className="font-medium text-sm">{selectedObject.name}</span>
                <div className="text-xs text-muted-foreground">
                  {selectedObject.description}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isPerformingAction}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleGoto(false)}
                disabled={isPerformingAction}
                className="flex-1"
                title='Navigate telescope to selected object'
              >
                <Navigation className="w-4 h-4 mr-1" />
                Goto
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleGotoAndImage}
                disabled={isPerformingAction}
                className="flex-1"
                title='Navigate telescope and start imaging'
              >
                <Camera className="w-4 h-4 mr-1" />
                Goto & Image
              </Button>
            </div>
          </div>
        </div>
      )}
      
      <div className="border-t p-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>
            Showing {visibleObjects.length} objects
            {searchQuery && ' (including below horizon)'}
          </span>
          <div className="flex items-center gap-2">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              <span className="text-xs">⌘</span>K
            </kbd>
            <span>to search</span>
          </div>
        </div>
      </div>
    </CommandDialog>

    {/* Stop Imaging Confirmation Dialog */}
    <AlertDialog open={showStopImagingConfirm} onOpenChange={setShowStopImagingConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop Current Imaging Session?</AlertDialogTitle>
          <AlertDialogDescription>
            The telescope is currently imaging another target. Going to {selectedObject?.name} will stop the current imaging session.
            {pendingGotoAction?.startImaging && " Imaging will then start on the new target."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancelStopImaging}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmStopImaging}>
            {pendingGotoAction?.startImaging ? "Stop & Goto with Imaging" : "Stop & Goto"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}