import { useState, useEffect, useCallback } from 'react'
import { Search, Star, Moon, Sun, Crosshair, X } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { useCatalog, useTelescope, useSession } from '../hooks'
import type { CelestialObject, SolarSystemObject } from '../stores'

interface CatalogSearchProps {
  onSelectTarget?: (target: CelestialObject | SolarSystemObject) => void
  compact?: boolean
}

export function CatalogSearch({ onSelectTarget, compact = false }: CatalogSearchProps) {
  const {
    searchResults,
    solarSystemObjects,
    objectTypes,
    selectedObject,
    isSearching,
    filters,
    recentSearches,
    searchCatalog,
    quickSearch,
    getObjectTypes,
    getSolarSystemObjects,
    selectObject,
    setFilters,
  } = useCatalog()

  const { gotoTarget, currentTelescopeId } = useTelescope()
  const { location } = useSession()

  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Array<{ id: string; name: string; object_type: string }>>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  // Load object types and solar system objects on mount
  useEffect(() => {
    getObjectTypes()
    if (location) {
      getSolarSystemObjects(location.latitude, location.longitude)
    }
  }, [getObjectTypes, getSolarSystemObjects, location])

  // Quick search for autocomplete
  useEffect(() => {
    const debounce = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        const results = await quickSearch(searchQuery)
        setSuggestions(results)
        setShowSuggestions(true)
      } else {
        setSuggestions([])
        setShowSuggestions(false)
      }
    }, 200)

    return () => clearTimeout(debounce)
  }, [searchQuery, quickSearch])

  const handleSearch = useCallback(async () => {
    setShowSuggestions(false)
    await searchCatalog({
      query: searchQuery,
      latitude: location?.latitude,
      longitude: location?.longitude,
    })
  }, [searchQuery, searchCatalog, location])

  const handleSelectSuggestion = useCallback((suggestion: { id: string; name: string }) => {
    setSearchQuery(suggestion.name)
    setShowSuggestions(false)
    searchCatalog({
      query: suggestion.name,
      latitude: location?.latitude,
      longitude: location?.longitude,
    })
  }, [searchCatalog, location])

  const handleSelectObject = useCallback(async (object: CelestialObject | SolarSystemObject) => {
    selectObject(object)
    onSelectTarget?.(object)
  }, [selectObject, onSelectTarget])

  const handleGotoObject = useCallback(async (object: CelestialObject | SolarSystemObject) => {
    if (!currentTelescopeId) return

    try {
      await gotoTarget(
        currentTelescopeId,
        object.name,
        object.ra_decimal,
        object.dec_decimal
      )
    } catch (error) {
      console.error('GOTO failed:', error)
    }
  }, [currentTelescopeId, gotoTarget])

  const formatRA = (ra: number) => {
    const hours = Math.floor(ra / 15)
    const minutes = Math.floor((ra / 15 - hours) * 60)
    const seconds = ((ra / 15 - hours) * 60 - minutes) * 60
    return `${hours}h ${minutes}m ${seconds.toFixed(1)}s`
  }

  const formatDec = (dec: number) => {
    const sign = dec >= 0 ? '+' : '-'
    const absDec = Math.abs(dec)
    const degrees = Math.floor(absDec)
    const minutes = Math.floor((absDec - degrees) * 60)
    const seconds = ((absDec - degrees) * 60 - minutes) * 60
    return `${sign}${degrees}° ${minutes}' ${seconds.toFixed(1)}"`
  }

  const getObjectIcon = (type: string) => {
    const lowerType = type.toLowerCase()
    if (lowerType.includes('sun')) return <Sun className="h-4 w-4 text-yellow-500" />
    if (lowerType.includes('moon')) return <Moon className="h-4 w-4 text-gray-400" />
    if (lowerType.includes('planet')) return <Star className="h-4 w-4 text-orange-400" />
    if (lowerType.includes('galaxy')) return <Star className="h-4 w-4 text-purple-400" />
    if (lowerType.includes('nebula')) return <Star className="h-4 w-4 text-pink-400" />
    if (lowerType.includes('cluster')) return <Star className="h-4 w-4 text-blue-400" />
    return <Star className="h-4 w-4 text-white" />
  }

  return (
    <Card className={compact ? 'border-0 shadow-none' : ''}>
      {!compact && (
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Crosshair className="h-5 w-5" />
            Catalog Search
          </CardTitle>
        </CardHeader>
      )}

      <CardContent className={compact ? 'p-0' : ''}>
        {/* Search Input */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search objects (M31, NGC 7000, Orion...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                  onClick={() => {
                    setSearchQuery('')
                    setSuggestions([])
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {/* Autocomplete Suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2"
                  onClick={() => handleSelectSuggestion(suggestion)}
                >
                  {getObjectIcon(suggestion.object_type)}
                  <span className="font-medium">{suggestion.name}</span>
                  <span className="text-xs text-muted-foreground">{suggestion.object_type}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filters Toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </Button>

        {/* Filters */}
        {showFilters && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="object-type">Object Type</Label>
                <Select
                  value={filters.objectType || 'all'}
                  onValueChange={(value) => setFilters({ objectType: value === 'all' ? undefined : value })}
                >
                  <SelectTrigger id="object-type">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {objectTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name} ({type.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="max-mag">Max Magnitude</Label>
                <Select
                  value={String(filters.maxMagnitude || 10)}
                  onValueChange={(value) => setFilters({ maxMagnitude: Number(value) })}
                >
                  <SelectTrigger id="max-mag">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 (naked eye)</SelectItem>
                    <SelectItem value="8">8 (binocular)</SelectItem>
                    <SelectItem value="10">10 (small scope)</SelectItem>
                    <SelectItem value="12">12 (medium scope)</SelectItem>
                    <SelectItem value="15">15 (large scope)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="above-horizon"
                checked={filters.aboveHorizonOnly}
                onCheckedChange={(checked) => setFilters({ aboveHorizonOnly: checked })}
              />
              <Label htmlFor="above-horizon">Above horizon only</Label>
            </div>
          </div>
        )}

        {/* Solar System Objects */}
        {solarSystemObjects.length > 0 && !searchQuery && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">Solar System</h4>
            <div className="flex flex-wrap gap-2">
              {solarSystemObjects.map((obj) => (
                <Button
                  key={obj.id}
                  variant={selectedObject?.id === obj.id ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1"
                  onClick={() => handleSelectObject(obj)}
                >
                  {getObjectIcon(obj.object_type)}
                  {obj.name}
                  {obj.altitude !== undefined && (
                    <span className={`text-xs ${obj.above_horizon ? 'text-green-500' : 'text-red-500'}`}>
                      {obj.altitude.toFixed(0)}°
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Recent Searches */}
        {recentSearches.length > 0 && !searchQuery && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">Recent Searches</h4>
            <div className="flex flex-wrap gap-1">
              {recentSearches.map((query) => (
                <Badge
                  key={query}
                  variant="secondary"
                  className="cursor-pointer hover:bg-secondary/80"
                  onClick={() => {
                    setSearchQuery(query)
                    searchCatalog({ query, latitude: location?.latitude, longitude: location?.longitude })
                  }}
                >
                  {query}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-4 space-y-2 max-h-80 overflow-auto">
            <h4 className="text-sm font-medium">
              Results ({searchResults.length})
            </h4>
            {searchResults.map((object) => (
              <div
                key={object.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedObject?.id === object.id
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => handleSelectObject(object)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getObjectIcon(object.object_type)}
                    <div>
                      <h5 className="font-medium">{object.name}</h5>
                      <p className="text-xs text-muted-foreground">
                        {object.object_type} • {object.constellation || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    {typeof object.magnitude === 'number' && (
                      <span className="text-muted-foreground">
                        Mag {object.magnitude.toFixed(1)}
                      </span>
                    )}
                    {typeof object.altitude === 'number' && (
                      <div className={object.above_horizon ? 'text-green-500' : 'text-red-500'}>
                        Alt {object.altitude.toFixed(1)}°
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    RA: {formatRA(object.ra_decimal)} • Dec: {formatDec(object.dec_decimal)}
                  </span>
                  {currentTelescopeId && object.above_horizon && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleGotoObject(object)
                      }}
                    >
                      GOTO
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No Results */}
        {searchQuery && !isSearching && searchResults.length === 0 && (
          <div className="mt-4 text-center text-muted-foreground py-8">
            <Crosshair className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No objects found for "{searchQuery}"</p>
            <p className="text-sm">Try adjusting your filters or search term</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
