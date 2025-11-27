import { create } from 'zustand'

// Types
export interface CelestialObject {
  id: string
  name: string
  object_type: string
  ra_decimal: number
  dec_decimal: number
  magnitude?: number
  constellation: string
  altitude?: number
  azimuth?: number
  above_horizon: boolean
  description?: string
  size_arcmin?: number
}

export interface SolarSystemObject {
  id: string
  name: string
  object_type: 'sun' | 'moon' | 'planet'
  ra_decimal: number
  dec_decimal: number
  altitude?: number
  azimuth?: number
  above_horizon: boolean
  phase?: number // Moon phase
  illumination?: number
}

export interface ObjectType {
  id: string
  name: string
  count: number
}

export interface SearchFilters {
  query: string
  objectType?: string
  minMagnitude?: number
  maxMagnitude?: number
  aboveHorizonOnly: boolean
  limit: number
}

interface CatalogStore {
  // State
  searchResults: CelestialObject[]
  solarSystemObjects: SolarSystemObject[]
  objectTypes: ObjectType[]
  selectedObject: CelestialObject | SolarSystemObject | null
  isSearching: boolean
  filters: SearchFilters
  recentSearches: string[]

  // Actions
  setSearchResults: (results: CelestialObject[]) => void
  setSolarSystemObjects: (objects: SolarSystemObject[]) => void
  setObjectTypes: (types: ObjectType[]) => void
  setSelectedObject: (object: CelestialObject | SolarSystemObject | null) => void
  setIsSearching: (searching: boolean) => void
  updateFilters: (filters: Partial<SearchFilters>) => void
  resetFilters: () => void
  addRecentSearch: (query: string) => void
  clearRecentSearches: () => void
}

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  objectType: undefined,
  minMagnitude: undefined,
  maxMagnitude: 10,
  aboveHorizonOnly: true,
  limit: 50,
}

export const useCatalogStore = create<CatalogStore>((set) => ({
  // Initial state
  searchResults: [],
  solarSystemObjects: [],
  objectTypes: [],
  selectedObject: null,
  isSearching: false,
  filters: DEFAULT_FILTERS,
  recentSearches: [],

  // Actions
  setSearchResults: (searchResults) => set({ searchResults }),

  setSolarSystemObjects: (solarSystemObjects) => set({ solarSystemObjects }),

  setObjectTypes: (objectTypes) => set({ objectTypes }),

  setSelectedObject: (selectedObject) => set({ selectedObject }),

  setIsSearching: (isSearching) => set({ isSearching }),

  updateFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters }
  })),

  resetFilters: () => set({ filters: DEFAULT_FILTERS }),

  addRecentSearch: (query) => set((state) => {
    const filtered = state.recentSearches.filter(s => s !== query)
    return {
      recentSearches: [query, ...filtered].slice(0, 10)
    }
  }),

  clearRecentSearches: () => set({ recentSearches: [] }),
}))
