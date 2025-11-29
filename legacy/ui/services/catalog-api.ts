// Service for interacting with the astronomical catalog API

import { getWebSocketService } from './websocket-service'

export interface CatalogObject {
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
  moon_phase?: number
}

export interface CatalogSearchParams {
  query?: string
  object_type?: string
  min_magnitude?: number
  max_magnitude?: number
  above_horizon_only?: boolean
  latitude?: number
  longitude?: number
  elevation?: number
  limit?: number
}

export interface CatalogSearchResponse {
  objects: CatalogObject[]
  total_count: number
  filtered_count: number
  observer_location?: {
    latitude: number
    longitude: number
    elevation: number
  }
}

const API_BASE_URL = '/api'

interface CacheEntry {
  data: CatalogSearchResponse
  timestamp: number
  key: string
}

export class CatalogAPI {
  private static instance: CatalogAPI
  private cache: Map<string, CacheEntry> = new Map()
  private readonly CACHE_TTL = 60000 // 1 minute cache TTL
  
  public static getInstance(): CatalogAPI {
    if (!CatalogAPI.instance) {
      CatalogAPI.instance = new CatalogAPI()
    }
    return CatalogAPI.instance
  }

  private getCacheKey(params: CatalogSearchParams): string {
    return JSON.stringify(params)
  }

  private getFromCache(key: string): CatalogSearchResponse | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    
    const now = Date.now()
    if (now - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(key)
      return null
    }
    
    return entry.data
  }

  private setCache(key: string, data: CatalogSearchResponse): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      key
    })
    
    // Limit cache size to 10 entries
    if (this.cache.size > 10) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
  }

  async searchCatalog(params: CatalogSearchParams): Promise<CatalogSearchResponse> {
    // Check cache first
    const cacheKey = this.getCacheKey(params)
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      console.log('Using cached catalog data')
      return cached
    }

    try {
      // Try WebSocket first
      const ws = getWebSocketService()
      if (ws.isConnected()) {
        console.log('Using WebSocket for catalog search')
        const response = await ws.searchCatalog(params)
        const data: CatalogSearchResponse = {
          objects: response.objects,
          total_count: response.total_count,
          filtered_count: response.filtered_count,
          observer_location: response.observer_location
        }
        this.setCache(cacheKey, data)
        return data
      }
    } catch (wsError) {
      console.warn('WebSocket catalog search failed, falling back to HTTP:', wsError)
    }

    // Fallback to HTTP
    const queryParams = new URLSearchParams()
    
    if (params.query) queryParams.append('query', params.query)
    if (params.object_type) queryParams.append('object_type', params.object_type)
    if (params.min_magnitude !== undefined) queryParams.append('min_magnitude', params.min_magnitude.toString())
    if (params.max_magnitude !== undefined) queryParams.append('max_magnitude', params.max_magnitude.toString())
    if (params.above_horizon_only !== undefined) queryParams.append('above_horizon_only', params.above_horizon_only.toString())
    if (params.latitude !== undefined) queryParams.append('latitude', params.latitude.toString())
    if (params.longitude !== undefined) queryParams.append('longitude', params.longitude.toString())
    if (params.elevation !== undefined) queryParams.append('elevation', params.elevation.toString())
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString())

    const response = await fetch(`${API_BASE_URL}/catalog/search?${queryParams}`)
    
    if (!response.ok) {
      throw new Error(`Catalog search failed: ${response.statusText}`)
    }
    
    const data = await response.json()
    this.setCache(cacheKey, data)
    return data
  }

  async quickSearch(latitude?: number, longitude?: number, elevation?: number): Promise<CatalogSearchResponse> {
    // Use a special cache key for quick search
    const cacheKey = `quick:${latitude}:${longitude}:${elevation}`
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      console.log('Using cached quick search data')
      return cached
    }

    try {
      // Try WebSocket first
      const ws = getWebSocketService()
      if (ws.isConnected()) {
        console.log('Using WebSocket for catalog quick search')
        const response = await ws.quickSearchCatalog(latitude, longitude, elevation)
        const data: CatalogSearchResponse = {
          objects: response.objects,
          total_count: response.total_count,
          filtered_count: response.filtered_count,
          observer_location: response.observer_location
        }
        this.setCache(cacheKey, data)
        return data
      }
    } catch (wsError) {
      console.warn('WebSocket catalog quick search failed, falling back to HTTP:', wsError)
    }

    // Fallback to HTTP
    const queryParams = new URLSearchParams()
    if (latitude !== undefined) queryParams.append('latitude', latitude.toString())
    if (longitude !== undefined) queryParams.append('longitude', longitude.toString())
    if (elevation !== undefined) queryParams.append('elevation', elevation.toString())

    const response = await fetch(`${API_BASE_URL}/catalog/quick-search?${queryParams}`)
    
    if (!response.ok) {
      throw new Error(`Quick catalog search failed: ${response.statusText}`)
    }
    
    const data = await response.json()
    this.setCache(cacheKey, data)
    return data
  }

  async getObjectTypes(): Promise<Record<string, number>> {
    const response = await fetch(`${API_BASE_URL}/catalog/object-types`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch object types: ${response.statusText}`)
    }
    
    return response.json()
  }

  // Preload quick search data in the background
  async preloadQuickSearch(latitude?: number, longitude?: number, elevation?: number): Promise<void> {
    try {
      // This will cache the data for instant access later
      await this.quickSearch(latitude, longitude, elevation)
      console.log('Preloaded quick search catalog data')
    } catch (error) {
      console.error('Failed to preload catalog data:', error)
    }
  }

  // Convert catalog object to the format expected by the frontend
  static convertToFrontendObject(catalogObj: CatalogObject, index: number = 0): any {
    // Convert decimal degrees back to the string format expected by frontend
    const raHours = catalogObj.ra_decimal / 15
    const hours = Math.floor(raHours)
    const minutes = Math.floor((raHours - hours) * 60)
    const seconds = Math.floor(((raHours - hours) * 60 - minutes) * 60)
    const raString = `${hours}h ${minutes}m ${seconds}s`

    const decDegrees = Math.abs(catalogObj.dec_decimal)
    const degrees = Math.floor(decDegrees)
    const arcminutes = Math.floor((decDegrees - degrees) * 60)
    const arcseconds = Math.floor(((decDegrees - degrees) * 60 - arcminutes) * 60)
    const sign = catalogObj.dec_decimal >= 0 ? '+' : '-'
    const decString = `${sign}${degrees}° ${arcminutes}′ ${arcseconds}″`

    // Determine best observation time based on object type
    let bestSeenIn = "Night"  // Default for most deep sky objects
    if (catalogObj.id === 'sun') {
      bestSeenIn = "Day (with proper solar filter)"
    } else if (catalogObj.id === 'moon') {
      bestSeenIn = "Night or Twilight"
    } else if (catalogObj.id === 'mercury' || catalogObj.id === 'venus') {
      bestSeenIn = "Twilight"
    }

    return {
      id: catalogObj.id,
      name: catalogObj.name,
      type: catalogObj.object_type,
      coordinates: {
        ra: raString,
        dec: decString
      },
      ra: raString,
      dec: decString,
      magnitude: catalogObj.magnitude,
      constellation: catalogObj.constellation,
      description: catalogObj.description || "",
      isVisible: catalogObj.above_horizon,
      isAboveHorizon: catalogObj.above_horizon,
      altitude: catalogObj.altitude || 0,
      azimuth: catalogObj.azimuth || 0,
      size: catalogObj.size_arcmin,
      _moonPhase: catalogObj.moon_phase,
      isCurrentlyVisible: catalogObj.above_horizon,
      optimalMoonPhase: "any",
      bestSeenIn: bestSeenIn
    }
  }
}

export const catalogAPI = CatalogAPI.getInstance()