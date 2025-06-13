"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import {
  X,
  MapPin,
  Plus,
  Edit,
  Trash2,
  Star,
  Eye,
  Thermometer,
  Mountain,
  Home,
  Car,
  Tent,
  Building,
  Navigation,
  Save,
  Globe,
  Lightbulb,
  Clock,
  Check,
  BarChart3,
} from "lucide-react"

// Define location interface
export interface ObservingLocation {
  id: string
  name: string
  description?: string
  coordinates: {
    latitude: number
    longitude: number
    elevation: number // meters above sea level
  }
  lightPollution: {
    bortle: number // 1-9 Bortle scale
    sqm: number // Sky Quality Meter reading (mag/arcsec²)
    description: string
  }
  weather: {
    averageSeeing: "excellent" | "good" | "fair" | "poor"
    windExposure: "sheltered" | "moderate" | "exposed"
    temperatureRange: {
      min: number
      max: number
    }
    humidity: number // average percentage
  }
  accessibility: {
    driveTime: number // minutes from home
    difficulty: "easy" | "moderate" | "difficult"
    facilities: string[] // parking, restrooms, power, etc.
    restrictions: string[] // permits required, hours, etc.
  }
  equipment: {
    powerAvailable: boolean
    internetAccess: boolean
    shelter: boolean
    setupSpace: "compact" | "medium" | "large"
  }
  settings: {
    defaultEquipment: string
    preferredTargets: string[]
    notes: string
    isDefault: boolean
    isFavorite: boolean
  }
  metadata: {
    createdAt: Date
    lastUsed?: Date
    timesUsed: number
    averageRating: number
  }
  type: "home" | "dark_site" | "public" | "private" | "remote"
}

interface LocationManagementProps {
  showLocationManager: boolean
  setShowLocationManager: (show: boolean) => void
  locations: ObservingLocation[]
  setLocations: (locations: ObservingLocation[] | ((prev: ObservingLocation[]) => ObservingLocation[])) => void
  currentLocation: ObservingLocation | null
  setCurrentLocation: (location: ObservingLocation | null) => void
}

export function LocationManagement({
  showLocationManager,
  setShowLocationManager,
  locations,
  setLocations,
  currentLocation,
  setCurrentLocation,
}: LocationManagementProps) {
  const [view, setView] = useState<"list" | "add" | "edit" | "details">("list")
  const [selectedLocation, setSelectedLocation] = useState<ObservingLocation | null>(null)
  const [editingLocation, setEditingLocation] = useState<Partial<ObservingLocation>>({})
  const [searchQuery, setSearchQuery] = useState("")

  // Form state for new/edit location
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    latitude: "",
    longitude: "",
    elevation: "",
    bortle: 4,
    sqm: 20.0,
    averageSeeing: "good" as const,
    windExposure: "moderate" as const,
    tempMin: 5,
    tempMax: 25,
    humidity: 50,
    driveTime: 30,
    difficulty: "moderate" as const,
    facilities: [] as string[],
    restrictions: [] as string[],
    powerAvailable: false,
    internetAccess: false,
    shelter: false,
    setupSpace: "medium" as const,
    defaultEquipment: "",
    notes: "",
    type: "dark_site" as const,
  })

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      latitude: "",
      longitude: "",
      elevation: "",
      bortle: 4,
      sqm: 20.0,
      averageSeeing: "good",
      windExposure: "moderate",
      tempMin: 5,
      tempMax: 25,
      humidity: 50,
      driveTime: 30,
      difficulty: "moderate",
      facilities: [],
      restrictions: [],
      powerAvailable: false,
      internetAccess: false,
      shelter: false,
      setupSpace: "medium",
      defaultEquipment: "",
      notes: "",
      type: "dark_site",
    })
  }

  // Load location data into form
  const loadLocationToForm = (location: ObservingLocation) => {
    setFormData({
      name: location.name,
      description: location.description || "",
      latitude: location.coordinates.latitude.toString(),
      longitude: location.coordinates.longitude.toString(),
      elevation: location.coordinates.elevation.toString(),
      bortle: location.lightPollution.bortle,
      sqm: location.lightPollution.sqm,
      averageSeeing: location.weather.averageSeeing,
      windExposure: location.weather.windExposure,
      tempMin: location.weather.temperatureRange.min,
      tempMax: location.weather.temperatureRange.max,
      humidity: location.weather.humidity,
      driveTime: location.accessibility.driveTime,
      difficulty: location.accessibility.difficulty,
      facilities: location.accessibility.facilities,
      restrictions: location.accessibility.restrictions,
      powerAvailable: location.equipment.powerAvailable,
      internetAccess: location.equipment.internetAccess,
      shelter: location.equipment.shelter,
      setupSpace: location.equipment.setupSpace,
      defaultEquipment: location.settings.defaultEquipment,
      notes: location.settings.notes,
      type: location.type,
    })
  }

  // Save location
  const saveLocation = () => {
    if (!formData.name.trim() || !formData.latitude || !formData.longitude) {
      return
    }

    const locationData: ObservingLocation = {
      id: selectedLocation?.id || `location-${Date.now()}`,
      name: formData.name.trim(),
      description: formData.description.trim(),
      coordinates: {
        latitude: Number.parseFloat(formData.latitude),
        longitude: Number.parseFloat(formData.longitude),
        elevation: Number.parseFloat(formData.elevation) || 0,
      },
      lightPollution: {
        bortle: formData.bortle,
        sqm: formData.sqm,
        description: getBortleDescription(formData.bortle),
      },
      weather: {
        averageSeeing: formData.averageSeeing,
        windExposure: formData.windExposure,
        temperatureRange: {
          min: formData.tempMin,
          max: formData.tempMax,
        },
        humidity: formData.humidity,
      },
      accessibility: {
        driveTime: formData.driveTime,
        difficulty: formData.difficulty,
        facilities: formData.facilities,
        restrictions: formData.restrictions,
      },
      equipment: {
        powerAvailable: formData.powerAvailable,
        internetAccess: formData.internetAccess,
        shelter: formData.shelter,
        setupSpace: formData.setupSpace,
      },
      settings: {
        defaultEquipment: formData.defaultEquipment,
        preferredTargets: [],
        notes: formData.notes,
        isDefault: false,
        isFavorite: false,
      },
      metadata: {
        createdAt: selectedLocation?.metadata.createdAt || new Date(),
        lastUsed: selectedLocation?.metadata.lastUsed,
        timesUsed: selectedLocation?.metadata.timesUsed || 0,
        averageRating: selectedLocation?.metadata.averageRating || 0,
      },
      type: formData.type,
    }

    if (selectedLocation) {
      // Update existing location
      setLocations((prev) => prev.map((loc) => (loc.id === selectedLocation.id ? locationData : loc)))
    } else {
      // Add new location
      setLocations((prev) => [...prev, locationData])
    }

    resetForm()
    setSelectedLocation(null)
    setView("list")
  }

  // Delete location
  const deleteLocation = (id: string) => {
    setLocations((prev) => prev.filter((loc) => loc.id !== id))
    if (currentLocation?.id === id) {
      setCurrentLocation(null)
    }
    setView("list")
  }

  // Set as current location
  const setAsCurrentLocation = (location: ObservingLocation) => {
    setCurrentLocation(location)
    // Update usage statistics
    setLocations((prev) =>
      prev.map((loc) =>
        loc.id === location.id
          ? {
              ...loc,
              metadata: {
                ...loc.metadata,
                lastUsed: new Date(),
                timesUsed: loc.metadata.timesUsed + 1,
              },
            }
          : loc,
      ),
    )
  }

  // Toggle favorite
  const toggleFavorite = (id: string) => {
    setLocations((prev) =>
      prev.map((loc) =>
        loc.id === id ? { ...loc, settings: { ...loc.settings, isFavorite: !loc.settings.isFavorite } } : loc,
      ),
    )
  }

  // Set as default
  const setAsDefault = (id: string) => {
    setLocations((prev) =>
      prev.map((loc) => ({
        ...loc,
        settings: { ...loc.settings, isDefault: loc.id === id },
      })),
    )
  }

  // Get Bortle scale description
  const getBortleDescription = (bortle: number): string => {
    const descriptions = {
      1: "Excellent dark-sky site",
      2: "Typical truly dark site",
      3: "Rural sky",
      4: "Rural/suburban transition",
      5: "Suburban sky",
      6: "Bright suburban sky",
      7: "Suburban/urban transition",
      8: "City sky",
      9: "Inner-city sky",
    }
    return descriptions[bortle as keyof typeof descriptions] || "Unknown"
  }

  // Get location type icon
  const getLocationTypeIcon = (type: ObservingLocation["type"]) => {
    switch (type) {
      case "home":
        return <Home className="w-4 h-4" />
      case "dark_site":
        return <Mountain className="w-4 h-4" />
      case "public":
        return <Building className="w-4 h-4" />
      case "private":
        return <Car className="w-4 h-4" />
      case "remote":
        return <Tent className="w-4 h-4" />
      default:
        return <MapPin className="w-4 h-4" />
    }
  }

  // Get light pollution color
  const getLightPollutionColor = (bortle: number) => {
    if (bortle <= 2) return "text-green-400"
    if (bortle <= 4) return "text-yellow-400"
    if (bortle <= 6) return "text-orange-400"
    return "text-red-400"
  }

  // Filter locations based on search
  const filteredLocations = locations.filter(
    (location) =>
      location.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      location.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      location.lightPollution.description.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Sort locations (favorites first, then by usage)
  const sortedLocations = [...filteredLocations].sort((a, b) => {
    if (a.settings.isFavorite && !b.settings.isFavorite) return -1
    if (!a.settings.isFavorite && b.settings.isFavorite) return 1
    return b.metadata.timesUsed - a.metadata.timesUsed
  })

  if (!showLocationManager) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg max-w-6xl w-full h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Location Management
          </h2>
          <div className="flex items-center gap-2">
            {view !== "list" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setView("list")
                  setSelectedLocation(null)
                  resetForm()
                }}
                className="border-gray-600 text-white hover:bg-gray-700"
              >
                Back to List
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLocationManager(false)}
              className="h-8 w-8 p-0 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {view === "list" && (
            <div className="space-y-6">
              {/* Header with search and add button */}
              <div className="flex items-center justify-between">
                <div className="flex-1 max-w-md">
                  <Input
                    placeholder="Search locations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                  />
                </div>
                <Button
                  onClick={() => {
                    resetForm()
                    setView("add")
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Location
                </Button>
              </div>

              {/* Current location indicator */}
              {currentLocation && (
                <Card className="bg-blue-900/20 border-blue-500/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
                        <div>
                          <div className="font-medium text-white">Current Location</div>
                          <div className="text-sm text-blue-300">{currentLocation.name}</div>
                        </div>
                      </div>
                      <Badge variant="outline" className="border-blue-400 text-blue-400">
                        Active
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Locations grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedLocations.map((location) => (
                  <Card
                    key={location.id}
                    className={`bg-gray-700 border-gray-600 hover:border-gray-500 transition-colors cursor-pointer ${
                      currentLocation?.id === location.id ? "ring-2 ring-blue-500" : ""
                    }`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {getLocationTypeIcon(location.type)}
                          <div>
                            <CardTitle className="text-white text-sm flex items-center gap-2">
                              {location.name}
                              {location.settings.isFavorite && (
                                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                              )}
                              {location.settings.isDefault && (
                                <Badge variant="outline" className="text-xs">
                                  Default
                                </Badge>
                              )}
                            </CardTitle>
                            {location.description && (
                              <p className="text-xs text-gray-400 mt-1">{location.description}</p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFavorite(location.id)
                          }}
                          className="h-6 w-6 p-0"
                        >
                          <Star
                            className={`w-3 h-3 ${
                              location.settings.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-gray-400"
                            }`}
                          />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Key metrics */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          <Lightbulb className={`w-3 h-3 ${getLightPollutionColor(location.lightPollution.bortle)}`} />
                          <span className="text-gray-300">Bortle {location.lightPollution.bortle}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Eye className="w-3 h-3 text-blue-400" />
                          <span className="text-gray-300 capitalize">{location.weather.averageSeeing}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-purple-400" />
                          <span className="text-gray-300">{location.accessibility.driveTime}min</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Mountain className="w-3 h-3 text-green-400" />
                          <span className="text-gray-300">{location.coordinates.elevation}m</span>
                        </div>
                      </div>

                      {/* Facilities */}
                      <div className="flex flex-wrap gap-1">
                        {location.equipment.powerAvailable && (
                          <Badge variant="secondary" className="text-xs">
                            Power
                          </Badge>
                        )}
                        {location.equipment.internetAccess && (
                          <Badge variant="secondary" className="text-xs">
                            Internet
                          </Badge>
                        )}
                        {location.equipment.shelter && (
                          <Badge variant="secondary" className="text-xs">
                            Shelter
                          </Badge>
                        )}
                      </div>

                      {/* Usage stats */}
                      <div className="text-xs text-gray-400">
                        Used {location.metadata.timesUsed} times
                        {location.metadata.lastUsed && (
                          <span> • Last: {location.metadata.lastUsed.toLocaleDateString()}</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => setAsCurrentLocation(location)}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                          disabled={currentLocation?.id === location.id}
                        >
                          {currentLocation?.id === location.id ? "Current" : "Use"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedLocation(location)
                            setView("details")
                          }}
                          className="border-gray-600 text-white hover:bg-gray-700"
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedLocation(location)
                            loadLocationToForm(location)
                            setView("edit")
                          }}
                          className="border-gray-600 text-white hover:bg-gray-700"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteLocation(location.id)}
                          className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {sortedLocations.length === 0 && (
                <div className="text-center py-12">
                  <MapPin className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No locations found</h3>
                  <p className="text-gray-400 mb-4">
                    {searchQuery
                      ? "Try adjusting your search terms"
                      : "Add your first observing location to get started"}
                  </p>
                  {!searchQuery && (
                    <Button
                      onClick={() => {
                        resetForm()
                        setView("add")
                      }}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Location
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {(view === "add" || view === "edit") && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">
                  {view === "add" ? "Add New Location" : "Edit Location"}
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Basic Information */}
                  <Card className="bg-gray-700 border-gray-600">
                    <CardHeader>
                      <CardTitle className="text-white text-sm">Basic Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Name *</label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="e.g., Dark Sky Park"
                          className="bg-gray-600 border-gray-500 text-white placeholder-gray-400"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Description</label>
                        <Textarea
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          placeholder="Brief description of the location..."
                          className="bg-gray-600 border-gray-500 text-white placeholder-gray-400 resize-none"
                          rows={3}
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Type</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: "home", label: "Home", icon: <Home className="w-3 h-3" /> },
                            { value: "dark_site", label: "Dark Site", icon: <Mountain className="w-3 h-3" /> },
                            { value: "public", label: "Public", icon: <Building className="w-3 h-3" /> },
                            { value: "private", label: "Private", icon: <Car className="w-3 h-3" /> },
                            { value: "remote", label: "Remote", icon: <Tent className="w-3 h-3" /> },
                          ].map(({ value, label, icon }) => (
                            <Button
                              key={value}
                              variant={formData.type === value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setFormData({ ...formData, type: value as any })}
                              className={`justify-start ${
                                formData.type === value
                                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                                  : "border-gray-600 text-white hover:bg-gray-700"
                              }`}
                            >
                              {icon}
                              <span className="ml-2">{label}</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Coordinates */}
                  <Card className="bg-gray-700 border-gray-600">
                    <CardHeader>
                      <CardTitle className="text-white text-sm flex items-center gap-2">
                        <Navigation className="w-4 h-4" />
                        Coordinates
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-gray-300 mb-2 block">Latitude *</label>
                          <Input
                            type="number"
                            step="any"
                            value={formData.latitude}
                            onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                            placeholder="e.g., 40.7128"
                            className="bg-gray-600 border-gray-500 text-white placeholder-gray-400"
                          />
                        </div>
                        <div>
                          <label className="text-sm text-gray-300 mb-2 block">Longitude *</label>
                          <Input
                            type="number"
                            step="any"
                            value={formData.longitude}
                            onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                            placeholder="e.g., -74.0060"
                            className="bg-gray-600 border-gray-500 text-white placeholder-gray-400"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Elevation (meters)</label>
                        <Input
                          type="number"
                          value={formData.elevation}
                          onChange={(e) => setFormData({ ...formData, elevation: e.target.value })}
                          placeholder="e.g., 500"
                          className="bg-gray-600 border-gray-500 text-white placeholder-gray-400"
                        />
                      </div>
                      <div className="text-xs text-gray-400">
                        <p>Use decimal degrees format. You can get coordinates from Google Maps or GPS devices.</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Light Pollution */}
                  <Card className="bg-gray-700 border-gray-600">
                    <CardHeader>
                      <CardTitle className="text-white text-sm flex items-center gap-2">
                        <Lightbulb className="w-4 h-4" />
                        Light Pollution
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">
                          Bortle Scale: {formData.bortle} - {getBortleDescription(formData.bortle)}
                        </label>
                        <Slider
                          value={[formData.bortle]}
                          onValueChange={([value]) => setFormData({ ...formData, bortle: value })}
                          min={1}
                          max={9}
                          step={1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                          <span>1 (Excellent)</span>
                          <span>9 (City)</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">
                          SQM Reading: {formData.sqm.toFixed(1)} mag/arcsec²
                        </label>
                        <Slider
                          value={[formData.sqm]}
                          onValueChange={([value]) => setFormData({ ...formData, sqm: value })}
                          min={15.0}
                          max={22.0}
                          step={0.1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                          <span>15.0 (City)</span>
                          <span>22.0 (Excellent)</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Weather Conditions */}
                  <Card className="bg-gray-700 border-gray-600">
                    <CardHeader>
                      <CardTitle className="text-white text-sm flex items-center gap-2">
                        <Thermometer className="w-4 h-4" />
                        Weather Conditions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Average Seeing</label>
                        <div className="grid grid-cols-2 gap-2">
                          {["excellent", "good", "fair", "poor"].map((seeing) => (
                            <Button
                              key={seeing}
                              variant={formData.averageSeeing === seeing ? "default" : "outline"}
                              size="sm"
                              onClick={() => setFormData({ ...formData, averageSeeing: seeing as any })}
                              className={`capitalize ${
                                formData.averageSeeing === seeing
                                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                                  : "border-gray-600 text-white hover:bg-gray-700"
                              }`}
                            >
                              {seeing}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Wind Exposure</label>
                        <div className="grid grid-cols-3 gap-2">
                          {["sheltered", "moderate", "exposed"].map((exposure) => (
                            <Button
                              key={exposure}
                              variant={formData.windExposure === exposure ? "default" : "outline"}
                              size="sm"
                              onClick={() => setFormData({ ...formData, windExposure: exposure as any })}
                              className={`capitalize ${
                                formData.windExposure === exposure
                                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                                  : "border-gray-600 text-white hover:bg-gray-700"
                              }`}
                            >
                              {exposure}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-gray-300 mb-2 block">Min Temp (°C)</label>
                          <Input
                            type="number"
                            value={formData.tempMin}
                            onChange={(e) =>
                              setFormData({ ...formData, tempMin: Number.parseInt(e.target.value) || 0 })
                            }
                            className="bg-gray-600 border-gray-500 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-sm text-gray-300 mb-2 block">Max Temp (°C)</label>
                          <Input
                            type="number"
                            value={formData.tempMax}
                            onChange={(e) =>
                              setFormData({ ...formData, tempMax: Number.parseInt(e.target.value) || 0 })
                            }
                            className="bg-gray-600 border-gray-500 text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">
                          Average Humidity: {formData.humidity}%
                        </label>
                        <Slider
                          value={[formData.humidity]}
                          onValueChange={([value]) => setFormData({ ...formData, humidity: value })}
                          min={0}
                          max={100}
                          step={5}
                          className="w-full"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Accessibility */}
                  <Card className="bg-gray-700 border-gray-600">
                    <CardHeader>
                      <CardTitle className="text-white text-sm flex items-center gap-2">
                        <Car className="w-4 h-4" />
                        Accessibility
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">
                          Drive Time: {formData.driveTime} minutes
                        </label>
                        <Slider
                          value={[formData.driveTime]}
                          onValueChange={([value]) => setFormData({ ...formData, driveTime: value })}
                          min={0}
                          max={300}
                          step={5}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Difficulty</label>
                        <div className="grid grid-cols-3 gap-2">
                          {["easy", "moderate", "difficult"].map((difficulty) => (
                            <Button
                              key={difficulty}
                              variant={formData.difficulty === difficulty ? "default" : "outline"}
                              size="sm"
                              onClick={() => setFormData({ ...formData, difficulty: difficulty as any })}
                              className={`capitalize ${
                                formData.difficulty === difficulty
                                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                                  : "border-gray-600 text-white hover:bg-gray-700"
                              }`}
                            >
                              {difficulty}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Facilities</label>
                        <div className="grid grid-cols-2 gap-2">
                          {["Parking", "Restrooms", "Tables", "Lighting", "Security", "Food"].map((facility) => (
                            <div key={facility} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={facility}
                                checked={formData.facilities.includes(facility)}
                                onChange={(e) => {
                                  const facilities = e.target.checked
                                    ? [...formData.facilities, facility]
                                    : formData.facilities.filter((f) => f !== facility)
                                  setFormData({ ...formData, facilities })
                                }}
                                className="rounded"
                              />
                              <label htmlFor={facility} className="text-sm text-gray-300 cursor-pointer">
                                {facility}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Equipment & Setup */}
                  <Card className="bg-gray-700 border-gray-600">
                    <CardHeader>
                      <CardTitle className="text-white text-sm flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        Equipment & Setup
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-300">Power Available</span>
                          <Switch
                            checked={formData.powerAvailable}
                            onCheckedChange={(checked) => setFormData({ ...formData, powerAvailable: checked })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-300">Internet Access</span>
                          <Switch
                            checked={formData.internetAccess}
                            onCheckedChange={(checked) => setFormData({ ...formData, internetAccess: checked })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-300">Shelter Available</span>
                          <Switch
                            checked={formData.shelter}
                            onCheckedChange={(checked) => setFormData({ ...formData, shelter: checked })}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Setup Space</label>
                        <div className="grid grid-cols-3 gap-2">
                          {["compact", "medium", "large"].map((space) => (
                            <Button
                              key={space}
                              variant={formData.setupSpace === space ? "default" : "outline"}
                              size="sm"
                              onClick={() => setFormData({ ...formData, setupSpace: space as any })}
                              className={`capitalize ${
                                formData.setupSpace === space
                                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                                  : "border-gray-600 text-white hover:bg-gray-700"
                              }`}
                            >
                              {space}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Default Equipment</label>
                        <Input
                          value={formData.defaultEquipment}
                          onChange={(e) => setFormData({ ...formData, defaultEquipment: e.target.value })}
                          placeholder="e.g., 8-inch Dobsonian, DSLR camera"
                          className="bg-gray-600 border-gray-500 text-white placeholder-gray-400"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Notes */}
                  <Card className="bg-gray-700 border-gray-600 lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-white text-sm">Notes & Additional Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Add any additional notes about this location, such as specific directions, best targets, seasonal considerations, etc."
                        className="bg-gray-600 border-gray-500 text-white placeholder-gray-400 resize-none"
                        rows={4}
                      />
                    </CardContent>
                  </Card>
                </div>

                {/* Save/Cancel buttons */}
                <div className="flex gap-4 pt-4">
                  <Button
                    onClick={saveLocation}
                    className="bg-green-600 hover:bg-green-700"
                    disabled={!formData.name.trim() || !formData.latitude || !formData.longitude}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {view === "add" ? "Add Location" : "Save Changes"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setView("list")
                      setSelectedLocation(null)
                      resetForm()
                    }}
                    className="border-gray-600 text-white hover:bg-gray-700"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {view === "details" && selectedLocation && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    {getLocationTypeIcon(selectedLocation.type)}
                    {selectedLocation.name}
                    {selectedLocation.settings.isFavorite && (
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    )}
                  </h3>
                  {selectedLocation.description && <p className="text-gray-400 mt-1">{selectedLocation.description}</p>}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setAsCurrentLocation(selectedLocation)}
                    className="bg-green-600 hover:bg-green-700"
                    disabled={currentLocation?.id === selectedLocation.id}
                  >
                    {currentLocation?.id === selectedLocation.id ? "Current Location" : "Use This Location"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      loadLocationToForm(selectedLocation)
                      setView("edit")
                    }}
                    className="border-gray-600 text-white hover:bg-gray-700"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Location Details */}
                <Card className="bg-gray-700 border-gray-600">
                  <CardHeader>
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <Navigation className="w-4 h-4" />
                      Location Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Latitude:</span>
                        <div className="text-white">{selectedLocation.coordinates.latitude.toFixed(6)}°</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Longitude:</span>
                        <div className="text-white">{selectedLocation.coordinates.longitude.toFixed(6)}°</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Elevation:</span>
                        <div className="text-white">{selectedLocation.coordinates.elevation}m</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Type:</span>
                        <div className="text-white capitalize">{selectedLocation.type.replace("_", " ")}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Light Pollution */}
                <Card className="bg-gray-700 border-gray-600">
                  <CardHeader>
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <Lightbulb className="w-4 h-4" />
                      Light Pollution
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Bortle Scale:</span>
                        <span
                          className={`font-medium ${getLightPollutionColor(selectedLocation.lightPollution.bortle)}`}
                        >
                          {selectedLocation.lightPollution.bortle}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{selectedLocation.lightPollution.description}</div>
                    </div>
                    <div className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">SQM Reading:</span>
                        <span className="text-white">{selectedLocation.lightPollution.sqm.toFixed(1)} mag/arcsec²</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Weather Conditions */}
                <Card className="bg-gray-700 border-gray-600">
                  <CardHeader>
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <Thermometer className="w-4 h-4" />
                      Weather Conditions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Average Seeing:</span>
                        <div className="text-white capitalize">{selectedLocation.weather.averageSeeing}</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Wind Exposure:</span>
                        <div className="text-white capitalize">{selectedLocation.weather.windExposure}</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Temperature:</span>
                        <div className="text-white">
                          {selectedLocation.weather.temperatureRange.min}° to{" "}
                          {selectedLocation.weather.temperatureRange.max}°C
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-400">Humidity:</span>
                        <div className="text-white">{selectedLocation.weather.humidity}%</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Accessibility */}
                <Card className="bg-gray-700 border-gray-600">
                  <CardHeader>
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <Car className="w-4 h-4" />
                      Accessibility
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Drive Time:</span>
                        <div className="text-white">{selectedLocation.accessibility.driveTime} minutes</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Difficulty:</span>
                        <div className="text-white capitalize">{selectedLocation.accessibility.difficulty}</div>
                      </div>
                    </div>
                    {selectedLocation.accessibility.facilities.length > 0 && (
                      <div>
                        <span className="text-gray-400 text-sm">Facilities:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedLocation.accessibility.facilities.map((facility) => (
                            <Badge key={facility} variant="secondary" className="text-xs">
                              {facility}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedLocation.accessibility.restrictions.length > 0 && (
                      <div>
                        <span className="text-gray-400 text-sm">Restrictions:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedLocation.accessibility.restrictions.map((restriction) => (
                            <Badge key={restriction} variant="destructive" className="text-xs">
                              {restriction}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Equipment & Setup */}
                <Card className="bg-gray-700 border-gray-600">
                  <CardHeader>
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Equipment & Setup
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        {selectedLocation.equipment.powerAvailable ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <X className="w-3 h-3 text-red-400" />
                        )}
                        <span className="text-gray-300">Power Available</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedLocation.equipment.internetAccess ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <X className="w-3 h-3 text-red-400" />
                        )}
                        <span className="text-gray-300">Internet Access</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedLocation.equipment.shelter ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <X className="w-3 h-3 text-red-400" />
                        )}
                        <span className="text-gray-300">Shelter</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Setup Space:</span>
                        <div className="text-white capitalize">{selectedLocation.equipment.setupSpace}</div>
                      </div>
                    </div>
                    {selectedLocation.settings.defaultEquipment && (
                      <div>
                        <span className="text-gray-400 text-sm">Default Equipment:</span>
                        <div className="text-white text-sm mt-1">{selectedLocation.settings.defaultEquipment}</div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Usage Statistics */}
                <Card className="bg-gray-700 border-gray-600">
                  <CardHeader>
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Usage Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Times Used:</span>
                        <div className="text-white">{selectedLocation.metadata.timesUsed}</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Average Rating:</span>
                        <div className="text-white">
                          {selectedLocation.metadata.averageRating > 0
                            ? `${selectedLocation.metadata.averageRating.toFixed(1)}/5`
                            : "Not rated"}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-400">Created:</span>
                        <div className="text-white">{selectedLocation.metadata.createdAt.toLocaleDateString()}</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Last Used:</span>
                        <div className="text-white">
                          {selectedLocation.metadata.lastUsed
                            ? selectedLocation.metadata.lastUsed.toLocaleDateString()
                            : "Never"}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Notes */}
              {selectedLocation.settings.notes && (
                <Card className="bg-gray-700 border-gray-600">
                  <CardHeader>
                    <CardTitle className="text-white text-sm">Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{selectedLocation.settings.notes}</p>
                  </CardContent>
                </Card>
              )}

              {/* Quick Actions */}
              <Card className="bg-gray-700 border-gray-600">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleFavorite(selectedLocation.id)}
                      className="border-gray-600 text-white hover:bg-gray-700"
                    >
                      <Star
                        className={`w-4 h-4 mr-2 ${
                          selectedLocation.settings.isFavorite ? "fill-yellow-400 text-yellow-400" : ""
                        }`}
                      />
                      {selectedLocation.settings.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAsDefault(selectedLocation.id)}
                      className="border-gray-600 text-white hover:bg-gray-700"
                      disabled={selectedLocation.settings.isDefault}
                    >
                      <Home className="w-4 h-4 mr-2" />
                      {selectedLocation.settings.isDefault ? "Default Location" : "Set as Default"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const coords = `${selectedLocation.coordinates.latitude},${selectedLocation.coordinates.longitude}`
                        window.open(`https://www.google.com/maps?q=${coords}`, "_blank")
                      }}
                      className="border-gray-600 text-white hover:bg-gray-700"
                    >
                      <MapPin className="w-4 h-4 mr-2" />
                      View on Maps
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
