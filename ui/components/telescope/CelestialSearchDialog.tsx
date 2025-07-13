"use client"

import { useEffect, useState } from "react"
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
import { useTelescopeWebSocket } from "../../hooks/useTelescopeWebSocket"
import { getObjectTypeIcon } from "../../utils/telescope-utils"
import { 
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
  const { celestialObjects, handleTargetSelect, currentTelescope, streamStatus } = useTelescopeContext()
  const { sendGotoMessage, isConnected, connect } = useTelescopeWebSocket({ autoConnect: false })
  const [visibleObjects, setVisibleObjects] = useState<CelestialObjectWithHorizon[]>([])
  const [selectedObject, setSelectedObject] = useState<CelestialObjectWithHorizon | null>(null)
  const [isPerformingAction, setIsPerformingAction] = useState(false)
  const [showStopImagingConfirm, setShowStopImagingConfirm] = useState(false)
  const [pendingGotoAction, setPendingGotoAction] = useState<{ startImaging: boolean } | null>(null)

  useEffect(() => {
    // Get objects with real-time calculations for planets, sun, moon
    const objectsWithHorizon = getDynamicCelestialObjects(celestialObjects, DEFAULT_OBSERVER_LOCATION)
    
    // Filter to only show objects above horizon
    const filtered = filterVisibleObjects(objectsWithHorizon, 0)
    
    // Sort by altitude (highest first)
    filtered.sort((a, b) => b.altitude - a.altitude)
    
    setVisibleObjects(filtered)
  }, [celestialObjects])

  // Reset selected object when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedObject(null)
      setIsPerformingAction(false)
      setShowStopImagingConfirm(false)
      setPendingGotoAction(null)
    }
  }, [open])

  // Establish WebSocket connection when dialog opens and telescope is available
  useEffect(() => {
    if (open && currentTelescope && !isConnected) {
      console.log('🔌 Attempting to connect to WebSocket for telescope:', currentTelescope.name)
      connect(currentTelescope).catch((error) => {
        console.error('❌ Failed to connect to WebSocket:', error)
      })
    }
  }, [open, currentTelescope, isConnected, connect])

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
      
      // Send goto message to server
      console.log(`WebSocket connection status: ${isConnected ? 'CONNECTED' : 'DISCONNECTED'}`)
      if (isConnected) {
        console.log(`Sending goto message for ${selectedObject.name} with imaging=${startImaging}`)
        console.log('Message details:', {
          target_name: selectedObject.name,
          coordinates: { ra: selectedObject.ra, dec: selectedObject.dec },
          start_imaging: startImaging,
          target_type: selectedObject.type,
          magnitude: selectedObject.magnitude,
          description: selectedObject.description
        })
        
        try {
          await sendGotoMessage(
            selectedObject.name,
            selectedObject.ra,
            selectedObject.dec,
            startImaging,
            selectedObject.type,
            selectedObject.magnitude,
            selectedObject.description
          )
          console.log(`✅ Goto message sent successfully for ${selectedObject.name}`)
          
          // Show success toast
          toast.success(
            startImaging 
              ? `Navigating to ${selectedObject.name} and starting imaging` 
              : `Navigating telescope to ${selectedObject.name}`,
            {
              description: `${selectedObject.type.charAt(0).toUpperCase() + selectedObject.type.slice(1)} • Magnitude ${selectedObject.magnitude} • Altitude ${selectedObject.altitude.toFixed(1)}°`,
              duration: 4000,
            }
          )
        } catch (msgError) {
          console.error('❌ Failed to send goto message:', msgError)
          
          // Show error toast
          toast.error("Failed to send goto command", {
            description: `Could not navigate to ${selectedObject.name}. Please check your connection.`,
            duration: 5000,
          })
          throw msgError
        }
      } else {
        console.warn('⚠️ WebSocket not connected, goto message not sent')
        
        // Show warning toast for no connection
        toast.warning("Telescope not connected", {
          description: "Unable to send goto command. Please ensure telescope is connected.",
          duration: 5000,
        })
      }
      
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to send goto message:', error)
      
      // Show generic error toast if not already shown
      if (isConnected) {
        toast.error("Unexpected error occurred", {
          description: "Failed to process goto command. Please try again.",
          duration: 5000,
        })
      }
      
      // Still close the dialog even if command fails
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
                  className={`flex items-center justify-between p-3 cursor-pointer ${
                    selectedObject?.id === obj.id ? 'bg-blue-600/20 border-blue-400 border' : ''
                  }`}
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
                disabled={isPerformingAction || !isConnected}
                className="flex-1"
                title={!isConnected ? 'WebSocket not connected' : 'Navigate telescope to selected object'}
              >
                <Navigation className="w-4 h-4 mr-1" />
                Goto
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleGotoAndImage}
                disabled={isPerformingAction || !isConnected}
                className="flex-1"
                title={!isConnected ? 'WebSocket not connected' : 'Navigate telescope and start imaging'}
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