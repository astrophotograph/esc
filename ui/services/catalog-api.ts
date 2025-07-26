// Service for interacting with the astronomical catalog API

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

export class CatalogAPI {
  private static instance: CatalogAPI
  
  public static getInstance(): CatalogAPI {
    if (!CatalogAPI.instance) {
      CatalogAPI.instance = new CatalogAPI()
    }
    return CatalogAPI.instance
  }

  async searchCatalog(params: CatalogSearchParams): Promise<CatalogSearchResponse> {
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
    
    return response.json()
  }

  async getObjectTypes(): Promise<Record<string, number>> {
    const response = await fetch(`${API_BASE_URL}/catalog/object-types`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch object types: ${response.statusText}`)
    }
    
    return response.json()
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
      bestSeenIn: "Night"
    }
  }
}

export const catalogAPI = CatalogAPI.getInstance()