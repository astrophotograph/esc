import { useCallback } from 'react'
import { invoke } from '../services/api'
import { useCatalogStore, CelestialObject, SolarSystemObject, ObjectType } from '../stores'

// API response types
interface CatalogSearchResult {
  objects: CelestialObject[]
  total: number
}

interface QuickSearchResult {
  suggestions: Array<{
    id: string
    name: string
    object_type: string
    magnitude?: number
  }>
}

interface ObjectTypesResult {
  types: ObjectType[]
}

interface SolarSystemResult {
  objects: SolarSystemObject[]
}

/**
 * Hook for catalog operations
 */
export function useCatalog() {
  const {
    setSearchResults,
    setSolarSystemObjects,
    setObjectTypes,
    setSelectedObject,
    setIsSearching,
    updateFilters,
    addRecentSearch,
    filters,
    searchResults,
    solarSystemObjects,
    objectTypes,
    selectedObject,
    isSearching,
    recentSearches,
  } = useCatalogStore()

  /**
   * Search the catalog
   */
  const searchCatalog = useCallback(async (options?: {
    query?: string
    objectType?: string
    minMagnitude?: number
    maxMagnitude?: number
    aboveHorizonOnly?: boolean
    latitude?: number
    longitude?: number
    limit?: number
  }) => {
    setIsSearching(true)

    const searchParams = {
      query: options?.query ?? filters.query,
      object_type: options?.objectType ?? filters.objectType,
      min_magnitude: options?.minMagnitude ?? filters.minMagnitude,
      max_magnitude: options?.maxMagnitude ?? filters.maxMagnitude,
      above_horizon_only: options?.aboveHorizonOnly ?? filters.aboveHorizonOnly,
      latitude: options?.latitude,
      longitude: options?.longitude,
      limit: options?.limit ?? filters.limit,
    }

    try {
      const resultJson = await invoke<string>('catalog_search', {
        params: searchParams
      })

      const result: CatalogSearchResult = JSON.parse(resultJson)
      setSearchResults(result.objects || [])

      // Add to recent searches if there was a query
      if (searchParams.query && searchParams.query.trim()) {
        addRecentSearch(searchParams.query.trim())
      }

      return result
    } catch (error) {
      console.error('Catalog search failed:', error)
      setSearchResults([])
      throw error
    } finally {
      setIsSearching(false)
    }
  }, [filters, setSearchResults, setIsSearching, addRecentSearch])

  /**
   * Quick search for autocomplete
   */
  const quickSearch = useCallback(async (query: string, limit: number = 20) => {
    if (!query || query.length < 2) {
      return []
    }

    try {
      const resultJson = await invoke<string>('catalog_quick_search', {
        query,
        limit
      })

      const result: QuickSearchResult = JSON.parse(resultJson)
      return result.suggestions || []
    } catch (error) {
      console.error('Quick search failed:', error)
      return []
    }
  }, [])

  /**
   * Get available object types
   */
  const getObjectTypes = useCallback(async () => {
    try {
      const resultJson = await invoke<string>('catalog_get_object_types')
      const result: ObjectTypesResult = JSON.parse(resultJson)
      setObjectTypes(result.types || [])
      return result.types || []
    } catch (error) {
      console.error('Failed to get object types:', error)
      return []
    }
  }, [setObjectTypes])

  /**
   * Get solar system objects
   */
  const getSolarSystemObjects = useCallback(async (latitude?: number, longitude?: number) => {
    try {
      const resultJson = await invoke<string>('catalog_get_solar_system', {
        latitude,
        longitude
      })

      const result: SolarSystemResult = JSON.parse(resultJson)
      setSolarSystemObjects(result.objects || [])
      return result.objects || []
    } catch (error) {
      console.error('Failed to get solar system objects:', error)
      return []
    }
  }, [setSolarSystemObjects])

  /**
   * Select an object for GOTO
   */
  const selectObject = useCallback((object: CelestialObject | SolarSystemObject | null) => {
    setSelectedObject(object)
  }, [setSelectedObject])

  /**
   * Update search filters
   */
  const setFilters = useCallback((newFilters: Partial<typeof filters>) => {
    updateFilters(newFilters)
  }, [updateFilters])

  return {
    // State
    searchResults,
    solarSystemObjects,
    objectTypes,
    selectedObject,
    isSearching,
    filters,
    recentSearches,

    // Actions
    searchCatalog,
    quickSearch,
    getObjectTypes,
    getSolarSystemObjects,
    selectObject,
    setFilters,
  }
}
