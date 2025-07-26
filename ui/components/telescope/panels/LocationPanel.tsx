"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MapPin, Plus, Settings, AlertTriangle, Navigation, Loader2 } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"
import { useState } from "react"
import { toast } from "sonner"
import { saveToStorage } from "../../../utils/storage-utils"

export function LocationPanel() {
  const { currentObservingLocation, setCurrentObservingLocation, setShowLocationManager } = useTelescopeContext()
  const [isGettingLocation, setIsGettingLocation] = useState(false)

  const handleOpenLocationManager = () => {
    setShowLocationManager(true)
  }

  const handleGetCurrentLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by this browser")
      return
    }

    setIsGettingLocation(true)
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setIsGettingLocation(false)
        
        // Create a location object from browser coordinates
        const browserLocation = {
          id: "browser-location",
          name: "Current Location",
          description: "GPS location from browser",
          type: "temporary" as const,
          coordinates: {
            latitude: parseFloat(latitude.toFixed(6)),
            longitude: parseFloat(longitude.toFixed(6)),
            elevation: 0
          },
          lightPollution: {
            bortle: 5,
            sqm: 20.5,
            nelm: 5.5
          },
          horizon: {
            hasCustomHorizon: false,
            minimumAltitude: 10
          },
          weather: {
            enableMonitoring: false
          },
          notes: "Auto-detected from browser geolocation",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          settings: {
            isDefault: false,
            autoDetectTimezone: true,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        }
        
        // Update context state
        setCurrentObservingLocation(browserLocation)
        
        // Save to local storage
        saveToStorage("telescope-browser-location", browserLocation)
        
        toast.success(`Location set: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, {
          duration: 3000
        })
      },
      (error) => {
        setIsGettingLocation(false)
        let message = "Unable to get your location"
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = "Location access denied. Please enable location permissions."
            break
          case error.POSITION_UNAVAILABLE:
            message = "Location information unavailable."
            break
          case error.TIMEOUT:
            message = "Location request timed out."
            break
        }
        
        toast.error(message)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Observing Location
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentObservingLocation ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-sm">{currentObservingLocation.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {currentObservingLocation.description || "No description"}
                </p>
              </div>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Active
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Latitude:</span>
                <div className="font-mono">{currentObservingLocation.coordinates.latitude.toFixed(4)}°</div>
              </div>
              <div>
                <span className="text-muted-foreground">Longitude:</span>
                <div className="font-mono">{currentObservingLocation.coordinates.longitude.toFixed(4)}°</div>
              </div>
              <div>
                <span className="text-muted-foreground">Elevation:</span>
                <div className="font-mono">{currentObservingLocation.coordinates.elevation}m</div>
              </div>
              <div>
                <span className="text-muted-foreground">Bortle Scale:</span>
                <div className="font-mono">{currentObservingLocation.lightPollution.bortle}</div>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleOpenLocationManager}
                className="w-full"
              >
                <Settings className="w-4 h-4 mr-2" />
                Manage Locations
              </Button>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleGetCurrentLocation}
                disabled={isGettingLocation}
                className="w-full"
              >
                {isGettingLocation ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Navigation className="w-4 h-4 mr-2" />
                )}
                {isGettingLocation ? "Getting Location..." : "Use Current Location"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-4 py-4">
            <div className="flex flex-col items-center gap-2">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <div>
                <h3 className="font-medium text-sm">No Location Set</h3>
                <p className="text-xs text-muted-foreground">
                  Set your observing location for accurate horizon calculations
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Button 
                onClick={handleOpenLocationManager}
                className="w-full"
                size="sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Location
              </Button>
              
              <Button 
                variant="outline"
                size="sm" 
                onClick={handleGetCurrentLocation}
                disabled={isGettingLocation}
                className="w-full"
              >
                {isGettingLocation ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Navigation className="w-4 h-4 mr-2" />
                )}
                {isGettingLocation ? "Getting Location..." : "Use Current Location"}
              </Button>
            </div>
          </div>
        )}

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Your location is used to calculate which celestial objects are currently above the horizon and their altitude/azimuth coordinates.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}